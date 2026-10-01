import { prisma } from "@/lib/prisma";
import { notify } from "@/lib/notifications";

/**
 * Đếm lượt đọc bài.
 *
 * Trang bài là ISR (revalidate 60) nên máy chủ không thấy từng lượt tải trang;
 * lượt đọc đến từ beacon phía trình duyệt (components/ViewBeacon.tsx →
 * POST /api/articles/[id]/view). Bot tìm kiếm hầu như không chạy JS nên tự
 * bị loại, cộng thêm lọc User-Agent ở API.
 *
 * Gom theo lô trong bộ nhớ rồi mới ghi xuống SQLite mỗi FLUSH_MS: một bài lên
 * top Facebook có thể kéo vài trăm lượt/phút, ghi đĩa từng lượt là tự làm khổ
 * mình — và lúc bị dội request, đường đếm view không được thành chỗ nghẽn.
 * Khởi động lại thì mất tối đa FLUSH_MS lượt chưa ghi — chấp nhận được.
 *
 * Không lưu ai đọc: chỉ cộng con số trên bài và trên ngày (trang Quyền riêng tư
 * cam kết không dựng hồ sơ đọc).
 */

const FLUSH_MS = 15_000;

/** Đạt mốc nào thì báo cho admin. */
export const VIEW_MILESTONES = [100, 500, 1_000, 2_000, 5_000, 10_000, 20_000, 50_000, 100_000];

interface ViewState {
  pending: Map<string, number>;
  timer: ReturnType<typeof setTimeout> | null;
  flushing: Promise<void> | null;
}

const g = globalThis as unknown as { __genzViews?: ViewState };
const state: ViewState = (g.__genzViews ??= { pending: new Map(), timer: null, flushing: null });

/** "YYYY-MM-DD" theo giờ Việt Nam (UTC+7, không đổi giờ mùa hè). */
export function vnDay(at = Date.now()): string {
  return new Date(at + 7 * 3600_000).toISOString().slice(0, 10);
}

export function recordView(articleId: string) {
  state.pending.set(articleId, (state.pending.get(articleId) ?? 0) + 1);
  if (!state.timer) {
    state.timer = setTimeout(() => {
      state.timer = null;
      void flushViews();
    }, FLUSH_MS);
    // Không giữ tiến trình sống chỉ vì còn một lô đang chờ.
    state.timer.unref?.();
  }
}

export async function flushViews(): Promise<void> {
  if (state.flushing) return state.flushing;
  if (!state.pending.size) return;

  const batch = state.pending;
  state.pending = new Map();
  const day = vnDay();

  state.flushing = (async () => {
    for (const [articleId, n] of batch) {
      try {
        // SQL thô để KHÔNG đụng updatedAt (xem reactToArticle trong lib/store.ts:
        // lượt đọc không phải là "bài vừa được sửa"). Chỉ đếm bài đã đăng.
        const rows = await prisma.$queryRaw<{ viewCount: number; title: string }[]>`
          UPDATE "articles" SET "viewCount" = "viewCount" + ${n}
          WHERE "id" = ${articleId} AND "status" = 'published'
          RETURNING "viewCount", "title"
        `;
        const row = rows[0];
        if (!row) continue;

        await prisma.$executeRaw`
          INSERT INTO "article_view_days" ("articleId", "day", "views")
          VALUES (${articleId}, ${day}, ${n})
          ON CONFLICT ("articleId", "day") DO UPDATE SET "views" = "views" + excluded."views"
        `;

        const after = Number(row.viewCount);
        const before = after - n;
        const reached = VIEW_MILESTONES.filter((m) => before < m && after >= m).pop();
        if (reached) {
          await notify({
            type: "views",
            level: "info",
            title: `"${row.title}" đạt ${reached.toLocaleString("vi-VN")} lượt đọc`,
            body: `Tổng hiện tại: ${after.toLocaleString("vi-VN")} lượt.`,
            link: `/admin/articles/${articleId}`,
            articleId,
          });
        }
      } catch (err) {
        console.error("[views] không ghi được lượt đọc:", err);
      }
    }
  })().finally(() => {
    state.flushing = null;
  });
  return state.flushing;
}

export interface ViewStatRow {
  id: string;
  slug: string;
  title: string;
  category: string;
  publishedAt: string;
  viewCount: number;
  /** Lượt đọc trong khoảng ngày đang xem (hôm nay / 7 ngày…). */
  views: number;
  comments: number;
}

/**
 * Bài được đọc nhiều nhất trong `days` ngày gần đây (1 = chỉ hôm nay),
 * kèm tổng lượt đọc mọi thời gian và số bình luận.
 */
export async function topViewed(days: number, limit = 15): Promise<ViewStatRow[]> {
  const from = vnDay(Date.now() - (Math.max(days, 1) - 1) * 24 * 3600_000);
  const grouped = await prisma.articleViewDay.groupBy({
    by: ["articleId"],
    where: { day: { gte: from } },
    _sum: { views: true },
    orderBy: { _sum: { views: "desc" } },
    take: limit,
  });
  if (!grouped.length) return [];

  const ids = grouped.map((r) => r.articleId);
  const [articles, comments] = await Promise.all([
    prisma.article.findMany({
      where: { id: { in: ids } },
      select: { id: true, slug: true, title: true, category: true, publishedAt: true, viewCount: true },
    }),
    prisma.comment.groupBy({
      by: ["articleId"],
      where: { articleId: { in: ids } },
      _count: { _all: true },
    }),
  ]);
  const byId = new Map(articles.map((a) => [a.id, a]));
  const commentsById = new Map(comments.map((c) => [c.articleId, c._count._all]));

  return grouped.flatMap((r) => {
    const a = byId.get(r.articleId);
    if (!a) return [];
    return [{ ...a, views: r._sum.views ?? 0, comments: commentsById.get(a.id) ?? 0 }];
  });
}

/** Tổng lượt đọc toàn trang theo từng ngày, `days` ngày gần nhất (cũ → mới). */
export async function dailyTotals(days: number): Promise<{ day: string; views: number }[]> {
  const out: { day: string; views: number }[] = [];
  for (let i = days - 1; i >= 0; i--) out.push({ day: vnDay(Date.now() - i * 24 * 3600_000), views: 0 });
  const rows = await prisma.articleViewDay.groupBy({
    by: ["day"],
    where: { day: { gte: out[0].day } },
    _sum: { views: true },
  });
  const map = new Map(rows.map((r) => [r.day, r._sum.views ?? 0]));
  return out.map((d) => ({ ...d, views: map.get(d.day) ?? 0 }));
}
