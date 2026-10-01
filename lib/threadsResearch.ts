import crypto from "crypto";
import { XMLParser } from "fast-xml-parser";
import { prisma } from "@/lib/prisma";
import { browserSearch, type KeywordResult, type ThreadsPost } from "@/lib/threadsBrowserSearch";
import { summarize } from "@/scripts/lib/threads-search.mjs";
import { isNoise } from "@/scripts/lib/topic-filter.mjs";

/**
 * "Research Threads now" ở /admin/research: tìm ngay trên Threads, không chờ
 * lượt cron 06:00. Cùng cách tìm (trình duyệt + phiên ở /admin/threads) và cùng
 * định dạng đề tài với bước Threads của scripts/collect-trends.mjs, ghi vào
 * hàng đợi với source = "threads".
 *
 * Chạy NỀN và trả về mã việc ngay: ~10 giây mỗi từ khoá, 10 từ khoá là gần 2
 * phút — quá trần 100 giây của Cloudflare nếu bắt trình duyệt chờ một request.
 * Màn hình hỏi tiến độ bằng getResearchJob(). Mỗi lúc chỉ một việc chạy: hai
 * trình duyệt song song trên máy chủ dùng chung là thừa, mà cùng tài khoản
 * Threads tìm dồn dập từ hai nơi cũng dễ bị chặn hơn.
 */

export const MAX_KEYWORDS = 12;
/** Từ khoá đã có trong hàng đợi trong bấy nhiêu ngày thì không thêm lại. */
const DEDUPE_DAYS = 7;
/** Tự lấy từ khoá: bao nhiêu từ khoá Google Trends VN đầu bảng. */
const TRENDS_TAKE = 10;

export interface ResearchItem {
  keyword: string;
  /** Lượt tìm Google Trends nếu từ khoá đến từ đó. */
  traffic?: string;
  state: "waiting" | "searching" | "added" | "skipped" | "duplicate";
  reason?: string;
  postCount?: number;
  recentCount?: number;
  buzz?: number;
  top?: ThreadsPost[];
  requestId?: string;
}

export interface ResearchJob {
  id: string;
  status: "running" | "done" | "error";
  startedAt: string;
  finishedAt?: string;
  source: "manual" | "trends";
  items: ResearchItem[];
  added: number;
  error?: string;
  /** Lý do dừng sớm (phiên hỏng, 3 từ khoá đầu đều trắng…). */
  aborted?: string;
}

const g = globalThis as unknown as { __genzThreadsJobs?: Map<string, ResearchJob> };
const jobs: Map<string, ResearchJob> = (g.__genzThreadsJobs ??= new Map());

export function getResearchJob(id: string) {
  return jobs.get(id) ?? null;
}

export function runningResearchJob() {
  return [...jobs.values()].find((j) => j.status === "running") ?? null;
}

const textOf = (v: unknown): string =>
  v == null ? "" : typeof v === "object" ? String((v as Record<string, unknown>)["#text"] ?? "") : String(v);
const toArray = <T,>(v: T | T[] | undefined): T[] => (v == null ? [] : Array.isArray(v) ? v : [v]);

interface TrendKeyword {
  keyword: string;
  traffic: string;
  articles: { title: string; url: string; source: string }[];
}

/** Từ khoá đang được tìm nhiều ở Việt Nam hôm nay (Google Trends RSS). */
export async function fetchTrendingVN(): Promise<TrendKeyword[]> {
  const res = await fetch("https://trends.google.com/trending/rss?geo=VN", {
    headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" },
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) throw new Error(`Google Trends trả HTTP ${res.status}`);
  const parsed = new XMLParser({ ignoreAttributes: false, htmlEntities: true }).parse(await res.text());
  return toArray(parsed?.rss?.channel?.item)
    .map((item: Record<string, unknown>) => ({
      keyword: textOf(item.title).trim(),
      traffic: textOf(item["ht:approx_traffic"]),
      articles: toArray(item["ht:news_item"] as Record<string, unknown>[]).map((n) => ({
        title: textOf(n["ht:news_item_title"]),
        url: textOf(n["ht:news_item_url"]),
        source: textOf(n["ht:news_item_source"]),
      })),
    }))
    .filter((t) => t.keyword && !isNoise(t.keyword))
    .slice(0, TRENDS_TAKE);
}

const fmt = (n: number) => n.toLocaleString("vi-VN");
const snippet = (t: string, max = 160) => (t.length > max ? `${t.slice(0, max - 1)}…` : t);
const norm = (s: string) => s.normalize("NFC").toLowerCase().replace(/\s+/g, " ").trim();

/** Bắt đầu một lượt. Đang có lượt chạy thì trả về chính lượt đó. */
export async function startResearchJob(input: { keywords?: string[]; fromTrends?: boolean }): Promise<ResearchJob> {
  const running = runningResearchJob();
  if (running) return running;

  const job: ResearchJob = {
    id: crypto.randomUUID(),
    status: "running",
    startedAt: new Date().toISOString(),
    source: input.fromTrends ? "trends" : "manual",
    items: [],
    added: 0,
  };

  // Lấy từ khoá trước khi trả về, để màn hình hiện ngay danh sách sẽ tìm.
  const trends = new Map<string, TrendKeyword>();
  let keywords: string[];
  if (input.fromTrends) {
    for (const t of await fetchTrendingVN()) trends.set(t.keyword, t);
    keywords = [...trends.keys()];
  } else {
    keywords = [...new Set((input.keywords ?? []).map((k) => k.trim()).filter(Boolean))];
  }
  keywords = keywords.slice(0, MAX_KEYWORDS);
  if (!keywords.length) throw new Error("Không có từ khoá nào để tìm");

  // Bỏ những từ khoá đã nằm trong hàng đợi mấy ngày gần đây.
  const since = new Date(Date.now() - DEDUPE_DAYS * 24 * 3600_000);
  const recent = await prisma.researchRequest.findMany({
    where: { createdAt: { gte: since } },
    select: { topic: true },
  });
  const seen = new Set(recent.map((r) => norm(r.topic)));

  job.items = keywords.map((keyword) => ({
    keyword,
    traffic: trends.get(keyword)?.traffic,
    state: seen.has(norm(keyword)) ? "duplicate" : "waiting",
    reason: seen.has(norm(keyword)) ? `đã có trong hàng đợi ${DEDUPE_DAYS} ngày qua` : undefined,
  }));
  jobs.set(job.id, job);

  void runJob(job, trends).catch((err) => {
    job.status = "error";
    job.error = (err as Error).message.split("\n")[0];
    job.finishedAt = new Date().toISOString();
  });
  return job;
}

async function runJob(job: ResearchJob, trends: Map<string, TrendKeyword>) {
  const todo = job.items.filter((i) => i.state === "waiting");
  const byKeyword = new Map(job.items.map((i) => [i.keyword, i]));
  if (todo.length) todo[0].state = "searching";

  const found: { item: ResearchItem; r: KeywordResult }[] = [];
  const { aborted } = await browserSearch(
    todo.map((i) => i.keyword),
    {
      onProgress: (kw, r) => {
        const item = byKeyword.get(kw)!;
        const sum = summarize(r.posts);
        Object.assign(item, {
          postCount: sum.postCount,
          recentCount: sum.recentCount,
          buzz: sum.buzz,
          top: sum.top,
        });
        if (!sum.recentCount) {
          item.state = "skipped";
          item.reason = r.posts.length ? "không có bài nào trong 72 giờ qua" : r.reason || "không ra bài nào";
        } else {
          found.push({ item, r });
          item.state = "added";
        }
        const next = todo.find((i) => i.state === "waiting");
        if (next) next.state = "searching";
      },
    },
  );
  if (aborted) {
    job.aborted = aborted;
    for (const i of job.items) {
      if (i.state === "waiting" || i.state === "searching") {
        i.state = "skipped";
        i.reason = "dừng sớm";
      }
    }
  }

  // Ghi vào hàng đợi, bàn tán nhiều nhất đứng đầu (máy viết nhặt theo
  // createdAt mới nhất trước — xem stampAt trong collect-trends.mjs).
  found.sort((a, b) => (b.item.buzz ?? 0) - (a.item.buzz ?? 0));
  const base = Date.now();
  for (const [rank, { item }] of found.entries()) {
    const t = trends.get(item.keyword);
    const notes = [
      t ? `[Google Trends VN] lượt tìm kiếm: ${t.traffic || "n/a"}` : "[Research Threads thủ công]",
      ...(t?.articles ?? []).map((a) => `• ${a.title} (${a.source})`),
      `[Threads] ${item.recentCount} bài trong 72 giờ · tổng tương tác 10 bài đầu: ${fmt(item.buzz ?? 0)}`,
      ...(item.top ?? []).map(
        (p) =>
          `• @${p.username} (♥ ${fmt(p.likes)} · 💬 ${fmt(p.replies)} · 🔁 ${fmt(p.reposts)}): ${snippet(p.text)}`,
      ),
      "Threads chỉ cho biết người ta đang bàn — dữ kiện phải lấy từ nguồn tin chính thống, " +
        "bài Threads chỉ trích khi chính nó là chuyện (và ghi rõ là từ Threads).",
    ].join("\n");
    const at = new Date(base - rank * 1000);
    const row = await prisma.researchRequest.create({
      data: {
        topic: item.keyword,
        urls: JSON.stringify([...(t?.articles ?? []).map((a) => a.url), ...(item.top ?? []).map((p) => p.url)]),
        notes,
        status: "pending",
        source: "threads",
        createdAt: at,
        updatedAt: at,
      },
    });
    item.requestId = row.id;
  }

  job.added = found.length;
  job.status = "done";
  job.finishedAt = new Date().toISOString();

  // Giữ tối đa 10 lượt gần nhất trong bộ nhớ.
  const all = [...jobs.values()].sort((a, b) => b.startedAt.localeCompare(a.startedAt));
  for (const old of all.slice(10)) jobs.delete(old.id);
}
