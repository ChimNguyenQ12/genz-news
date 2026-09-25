import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { foldVietnamese } from "@/lib/store";
import { GOLDEN_HOURS, POSTS_PER_DAY, articleScores, autoPickPreview, driverFor, nextFreeSlots } from "@/lib/social/core";
import { guard } from "@/lib/social/http";
import type { CategorySlug } from "@/lib/types";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ platform: string }> };

const PER_PAGE = 20;
const TABS = ["all", "none", "scheduled", "published", "failed", "skipped"] as const;
type Tab = (typeof TABS)[number];

function parseList(value: string | null | undefined): string[] {
  try {
    const parsed = JSON.parse(value ?? "[]");
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

/** "publishing" nằm chung tab "scheduled": nó là bài đã lên lịch đang được đăng. */
const tabOf = (status: string | undefined): Exclude<Tab, "all"> =>
  !status ? "none" : status === "publishing" ? "scheduled" : (status as Exclude<Tab, "all">);

/**
 * Bài đã đăng web kèm trạng thái trên nền tảng này, có phân trang.
 *
 * Tham số: tab, q (tìm trong tít, MỌI NGÀY — có q thì bỏ qua date), date
 * (YYYY-MM-DD, rỗng = mọi ngày), sort ("date" | "score"), page.
 *
 * Lọc và sắp xếp trong JS chứ không trong SQL: cần bỏ dấu tiếng Việt khi tìm
 * (LIKE của SQLite không làm được) và sắp theo điểm nóng — thứ nằm ở bảng đề
 * tài chứ không ở bảng bài. Chỉ đọc các cột nhẹ, không đọc thân bài, nên vài
 * nghìn bài vẫn nhanh.
 */
export async function GET(req: Request, { params }: Ctx) {
  const g = await guard((await params).platform);
  if (g.error) return g.error;
  const driver = driverFor(g.platform);

  const sp = new URL(req.url).searchParams;
  const tab = (TABS as readonly string[]).includes(sp.get("tab") ?? "") ? (sp.get("tab") as Tab) : "all";
  const q = foldVietnamese(sp.get("q") ?? "").replace(/[^a-z0-9]+/g, " ").trim();
  const date = q ? "" : (sp.get("date") ?? "");
  const byScore = sp.get("sort") === "score";

  const [rows, scores] = await Promise.all([
    prisma.article.findMany({
      where: { status: "published" },
      select: {
        id: true,
        slug: true,
        title: true,
        dek: true,
        category: true,
        tags: true,
        coverImage: true,
        publishedAt: true,
        createdAt: true,
        socialPosts: { where: { platform: g.platform } },
      },
      orderBy: [{ publishedAt: "desc" }, { createdAt: "desc" }],
    }),
    articleScores(),
  ]);

  const matches = rows.filter((a) => {
    if (date && a.publishedAt !== date) return false;
    if (q && !` ${foldVietnamese(a.title).replace(/[^a-z0-9]+/g, " ")}`.includes(` ${q}`)) return false;
    return true;
  });

  const counts: Record<Tab, number> = { all: matches.length, none: 0, scheduled: 0, published: 0, failed: 0, skipped: 0 };
  for (const a of matches) counts[tabOf(a.socialPosts[0]?.status)]++;

  const inTab = tab === "all" ? matches : matches.filter((a) => tabOf(a.socialPosts[0]?.status) === tab);
  if (byScore) inTab.sort((a, b) => (scores.get(b.id) ?? -1) - (scores.get(a.id) ?? -1));

  const total = inTab.length;
  const totalPages = Math.max(1, Math.ceil(total / PER_PAGE));
  const page = Math.min(Math.max(Number(sp.get("page")) || 1, 1), totalPages);

  const configured = driver.configured();
  const [nextSlot] = configured ? await nextFreeSlots(g.platform, 1) : [];
  const autoNext = configured ? await autoPickPreview(g.platform) : null;

  return NextResponse.json({
    platform: g.platform,
    label: driver.label,
    accountName: driver.accountName,
    maxCaption: driver.maxCaption,
    canEditPublished: driver.canEditPublished,
    autoPick: driver.autoPick,
    supportsTopicTag: Boolean(driver.topicTag),
    autoNext,
    configured,
    goldenHours: GOLDEN_HOURS,
    perDay: POSTS_PER_DAY,
    nextSlot: nextSlot ?? null,
    latestDate: rows[0]?.publishedAt ?? "",
    date,
    total,
    page,
    perPage: PER_PAGE,
    counts,
    articles: inTab.slice((page - 1) * PER_PAGE, page * PER_PAGE).map((a) => {
      const view = {
        title: a.title,
        dek: a.dek,
        category: a.category as CategorySlug,
        tags: parseList(a.tags),
        slug: a.slug,
      };
      return {
        id: a.id,
        slug: a.slug,
        title: a.title,
        coverImage: a.coverImage,
        publishedAt: a.publishedAt,
        score: scores.get(a.id) ?? null,
        defaultCaption: driver.formatCaption(view),
        defaultTopicTag: driver.topicTag?.default(view) ?? null,
        topicSuggestions: driver.topicTag?.suggestions(view) ?? [],
        defaultComment: driver.formatComment(view),
        post: a.socialPosts[0] ?? null,
      };
    }),
  });
}
