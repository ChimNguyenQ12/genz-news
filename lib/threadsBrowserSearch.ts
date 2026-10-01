import type { BrowserContext, Response } from "playwright-core";
import { readThreadsSession, type ThreadsSessionFile } from "@/lib/threadsSession";
import { collectPosts, jsonBlobs, SEARCH_URL } from "@/scripts/lib/threads-search.mjs";

/**
 * Tìm trên threads.com bằng một Chromium chạy ngầm đã nạp phiên đăng nhập.
 *
 * Vì sao cần trình duyệt: trang tìm kiếm của Threads tải kết quả bằng
 * JavaScript SAU khi trang mở (gọi GraphQL), nên tải HTML thô như
 * scripts/lib/threads-search.mjs làm thì gần như luôn thấy trang rỗng — kể cả
 * khi đã đăng nhập. Ở đây trang được chạy thật; mọi phản hồi JSON nó tải về
 * và JSON nhúng trong HTML đều được đi qua cùng bộ nhặt bài collectPosts().
 *
 * Mỗi từ khoá trả kèm `diag` (URL cuối, tiêu đề trang, số phản hồi JSON bắt
 * được…) để khi không ra bài thì biết vì sao, thay vì đoán.
 */

const BROWSER_PATH = process.env.THREADS_BROWSER_PATH ?? "/usr/bin/chromium";
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";

export interface ThreadsPost {
  code: string;
  username: string;
  text: string;
  likes: number;
  replies: number;
  reposts: number;
  quotes: number;
  takenAt: string | null;
  url: string;
}

export interface SearchDiag {
  finalUrl: string;
  title: string;
  jsonResponses: number;
  loginPage: boolean;
}

export interface KeywordResult {
  posts: ThreadsPost[];
  reason: string;
  loginWall?: boolean;
  diag?: SearchDiag;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Phản hồi GraphQL của Meta hay có tiền tố chống JSON-hijacking "for (;;);". */
function parseJsonBody(text: string): unknown[] {
  const body = text.replace(/^for\s*\(;;\);/, "").trim();
  if (!body) return [];
  try {
    return [JSON.parse(body)];
  } catch {
    // Vài endpoint trả nhiều object JSON nối nhau, mỗi object một dòng.
    const out: unknown[] = [];
    for (const line of body.split("\n")) {
      try {
        out.push(JSON.parse(line));
      } catch {
        // bỏ dòng không phải JSON
      }
    }
    return out;
  }
}

async function addSession(context: BrowserContext, s: ThreadsSessionFile) {
  await context.addCookies(
    s.cookies.map((c) => ({
      name: c.name,
      value: c.value,
      domain: c.domain || ".threads.com",
      path: c.path || "/",
      ...(c.expires && c.expires > 0 ? { expires: c.expires } : {}),
    })),
  );
}

async function searchOne(context: BrowserContext, keyword: string): Promise<KeywordResult> {
  const page = await context.newPage();
  const found = new Map<string, ThreadsPost>();
  let jsonResponses = 0;
  const pending: Promise<void>[] = [];

  page.on("response", (res: Response) => {
    const type = res.headers()["content-type"] ?? "";
    const url = res.url();
    if (!/json|javascript/.test(type) && !/graphql|\/api\//.test(url)) return;
    pending.push(
      res
        .text()
        .then((text) => {
          if (!text.includes("username")) return;
          const parsed = parseJsonBody(text);
          if (parsed.length) jsonResponses++;
          for (const node of parsed) collectPosts(node, found);
        })
        .catch(() => {}),
    );
  });

  try {
    const url = `${SEARCH_URL}?${new URLSearchParams({ q: keyword, serp_type: "default" })}`;
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30_000 });
    // Chờ trang tự gọi API lấy kết quả, cuộn một nhịp để nó tải thêm.
    await page.waitForLoadState("networkidle", { timeout: 12_000 }).catch(() => {});
    await page.mouse.wheel(0, 2500).catch(() => {});
    await page.waitForLoadState("networkidle", { timeout: 6_000 }).catch(() => {});
    await Promise.all(pending);

    for (const blob of jsonBlobs(await page.content())) collectPosts(blob, found);

    const finalUrl = page.url();
    const loginPage =
      /\/login|accounts\/login/.test(finalUrl) ||
      (await page.locator('input[type="password"]').first().isVisible().catch(() => false));
    const diag: SearchDiag = { finalUrl, title: (await page.title().catch(() => "")).slice(0, 120), jsonResponses, loginPage };

    const posts = [...found.values()];
    if (posts.length) return { posts, reason: "", diag };
    if (loginPage) {
      return { posts, reason: "trang chuyển tới đăng nhập — phiên không còn dùng được", loginWall: true, diag };
    }
    return {
      posts,
      reason: `trang mở được nhưng không thấy bài (tiêu đề "${diag.title}", ${jsonResponses} phản hồi dữ liệu)`,
      diag,
    };
  } catch (err) {
    return { posts: [], reason: (err as Error).message.split("\n")[0] };
  } finally {
    await page.close().catch(() => {});
  }
}

/**
 * Tìm lần lượt nhiều từ khoá trong MỘT lần mở trình duyệt. Dừng sớm sau 3
 * từ khoá trắng đầu tiên (gần như chắc chắn là phiên hỏng / trang đổi).
 */
export async function browserSearch(
  keywords: string[],
  { delayMs = 2500 }: { delayMs?: number } = {},
): Promise<{ results: Record<string, KeywordResult>; aborted: string; account: string | null }> {
  const session = readThreadsSession();
  const results: Record<string, KeywordResult> = {};
  const { chromium } = await import("playwright-core");
  const browser = await chromium.launch({
    executablePath: BROWSER_PATH,
    headless: true,
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
  });
  try {
    const context = await browser.newContext({ userAgent: UA, locale: "vi-VN", viewport: { width: 1280, height: 900 } });
    if (session) await addSession(context, session);

    let anyHit = false;
    let empty = 0;
    for (const [i, kw] of keywords.entries()) {
      if (i > 0) await sleep(delayMs);
      const r = await searchOne(context, kw);
      results[kw] = r;
      if (r.posts.length) {
        anyHit = true;
      } else if (!anyHit && ++empty >= 3) {
        return { results, aborted: `3 từ khoá đầu đều trắng (${r.reason})`, account: session?.username ?? null };
      }
      if (r.loginWall) {
        return { results, aborted: r.reason, account: session?.username ?? null };
      }
    }
    return { results, aborted: "", account: session?.username ?? null };
  } finally {
    await browser.close().catch(() => {});
  }
}
