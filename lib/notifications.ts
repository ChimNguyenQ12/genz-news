import { prisma } from "@/lib/prisma";

/**
 * Thông báo cho khu quản trị (chuông ở thanh điều hướng /admin).
 *
 * Mọi chỗ gọi `notify()` đều là "tiện thì báo": lỗi ghi thông báo bị nuốt và
 * chỉ log ra, KHÔNG BAO GIỜ làm hỏng việc chính (đăng ký, bình luận, lưu bài).
 * Người đọc gửi bình luận thất bại chỉ vì bảng thông báo bị khoá thì vô lý.
 */

export type NotificationType = "user" | "article" | "comment" | "views" | "traffic" | "system";
export type NotificationLevel = "info" | "warning" | "danger";

export const NOTIFICATION_TYPES: NotificationType[] = [
  "user",
  "article",
  "comment",
  "views",
  "traffic",
  "system",
];

export interface NotifyInput {
  type: NotificationType;
  level?: NotificationLevel;
  title: string;
  body?: string;
  link?: string;
  articleId?: string;
  /**
   * Gộp sự kiện lặp: nếu còn một thông báo CHƯA ĐỌC cùng khoá này trong
   * `groupWindowMs` gần nhất thì cộng `count` và thay tít/nội dung của nó,
   * thay vì đẻ thêm dòng mới. Bài bị dội 40 bình luận vẫn chỉ là một dòng.
   */
  groupKey?: string;
  groupWindowMs?: number;
}

export interface AdminNotificationItem {
  id: string;
  type: NotificationType;
  level: NotificationLevel;
  title: string;
  body: string;
  link: string | null;
  articleId: string | null;
  count: number;
  read: boolean;
  createdAt: string;
  updatedAt: string;
}

const DEFAULT_GROUP_WINDOW = 6 * 3600_000;

/** Giữ thông báo bao lâu. Đây là bảng tin, không phải nhật ký kiểm toán. */
const RETENTION_DAYS = 60;

export async function notify(input: NotifyInput): Promise<void> {
  try {
    const title = input.title.slice(0, 200);
    const body = (input.body ?? "").slice(0, 1000);

    if (input.groupKey) {
      const since = new Date(Date.now() - (input.groupWindowMs ?? DEFAULT_GROUP_WINDOW));
      const existing = await prisma.adminNotification.findFirst({
        where: { groupKey: input.groupKey, readAt: null, updatedAt: { gte: since } },
        orderBy: { updatedAt: "desc" },
        select: { id: true },
      });
      if (existing) {
        await prisma.adminNotification.update({
          where: { id: existing.id },
          data: {
            title,
            body,
            level: input.level ?? "info",
            link: input.link ?? null,
            count: { increment: 1 },
          },
        });
        return;
      }
    }

    await prisma.adminNotification.create({
      data: {
        type: input.type,
        level: input.level ?? "info",
        title,
        body,
        link: input.link ?? null,
        articleId: input.articleId ?? null,
        groupKey: input.groupKey ?? null,
      },
    });
  } catch (err) {
    console.error("[notify] không ghi được thông báo:", err);
  }
}

type Row = Awaited<ReturnType<typeof prisma.adminNotification.findFirstOrThrow>>;

function toItem(row: Row): AdminNotificationItem {
  return {
    id: row.id,
    type: row.type as NotificationType,
    level: row.level as NotificationLevel,
    title: row.title,
    body: row.body,
    link: row.link,
    articleId: row.articleId,
    count: row.count,
    read: row.readAt !== null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function listNotifications(query: {
  type?: NotificationType;
  unreadOnly?: boolean;
  page?: number;
  perPage?: number;
}) {
  const perPage = Math.min(Math.max(query.perPage ?? 30, 1), 100);
  const page = Math.max(query.page ?? 1, 1);
  const where = {
    ...(query.type ? { type: query.type } : {}),
    ...(query.unreadOnly ? { readAt: null } : {}),
  };

  const [rows, total, unread, byType] = await Promise.all([
    prisma.adminNotification.findMany({
      where,
      // updatedAt: thông báo gộp vừa được cộng thêm thì nổi lên đầu.
      orderBy: { updatedAt: "desc" },
      skip: (page - 1) * perPage,
      take: perPage,
    }),
    prisma.adminNotification.count({ where }),
    prisma.adminNotification.count({ where: { readAt: null } }),
    prisma.adminNotification.groupBy({
      by: ["type"],
      where: { readAt: null },
      _count: { _all: true },
    }),
  ]);

  const unreadByType = Object.fromEntries(
    NOTIFICATION_TYPES.map((t) => [t, 0]),
  ) as Record<NotificationType, number>;
  for (const g of byType) {
    if (g.type in unreadByType) unreadByType[g.type as NotificationType] = g._count._all;
  }

  return { items: rows.map(toItem), total, page, perPage, unread, unreadByType };
}

export async function unreadCount(): Promise<number> {
  return prisma.adminNotification.count({ where: { readAt: null } });
}

/** Đánh dấu đã đọc: theo danh sách id, hoặc tất cả (có thể lọc theo loại). */
export async function markRead(input: { ids?: string[]; all?: boolean; type?: NotificationType }) {
  const now = new Date();
  if (input.all) {
    const r = await prisma.adminNotification.updateMany({
      where: { readAt: null, ...(input.type ? { type: input.type } : {}) },
      data: { readAt: now },
    });
    return r.count;
  }
  const ids = (input.ids ?? []).filter((x) => typeof x === "string").slice(0, 200);
  if (!ids.length) return 0;
  const r = await prisma.adminNotification.updateMany({
    where: { id: { in: ids }, readAt: null },
    data: { readAt: now },
  });
  return r.count;
}

/** Xoá thông báo đã đọc (nút "Dọn đã đọc"). */
export async function clearRead() {
  const r = await prisma.adminNotification.deleteMany({ where: { readAt: { not: null } } });
  return r.count;
}

/** Dọn thông báo quá hạn — gọi định kỳ từ lib/monitor.ts. */
export async function pruneNotifications() {
  const before = new Date(Date.now() - RETENTION_DAYS * 24 * 3600_000);
  await prisma.adminNotification.deleteMany({ where: { createdAt: { lt: before } } });
}

// --- Các sự kiện cụ thể. Gom về đây để route chỉ cần một dòng `void notifyX()`.

const STATUS_LABEL: Record<string, string> = {
  draft: "nháp",
  pending: "chờ duyệt",
  published: "đã đăng",
  rejected: "bị trả lại",
};

const snippet = (text: string, max = 140) => {
  const t = text.replace(/\s+/g, " ").trim();
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
};

export function notifyNewUser(user: { id: string; username: string; displayName: string }) {
  return notify({
    type: "user",
    title: `Tài khoản mới: ${user.displayName} (@${user.username})`,
    body: "Vừa tự đăng ký trên trang.",
    link: "/admin/users",
  });
}

export function notifyNewComment(input: {
  articleId: string;
  articleTitle: string;
  author: string;
  isReply: boolean;
  body: string;
  hasMedia: boolean;
}) {
  const text = snippet(input.body) || (input.hasMedia ? "[ảnh/video]" : "");
  return notify({
    type: "comment",
    title: `Bình luận mới ở "${snippet(input.articleTitle, 90)}"`,
    body: `${input.author}${input.isReply ? " (trả lời)" : ""}: ${text}`,
    link: `/admin/articles/${input.articleId}#comments`,
    articleId: input.articleId,
    // Bài đang sôi thì gộp thành "N bình luận mới" thay vì N dòng.
    groupKey: `comment:${input.articleId}`,
  });
}

export function notifyArticle(input: {
  articleId: string;
  title: string;
  actor: { displayName: string; role: string };
  event: "created" | "status" | "edited" | "deleted";
  from?: string;
  to?: string;
}) {
  const who = input.actor.displayName;
  const t = `"${snippet(input.title, 90)}"`;
  let title: string;
  let level: NotificationLevel = "info";
  let groupKey: string | undefined;

  switch (input.event) {
    case "created":
      title = `${who} vừa tạo bài ${t}`;
      break;
    case "edited":
      title = `${who} vừa sửa bài ${t}`;
      // Lưu nháp liên tục thì chỉ là một dòng.
      groupKey = `article-edit:${input.articleId}`;
      break;
    case "deleted":
      title = `${who} đã xoá bài ${t}`;
      level = "warning";
      break;
    default:
      if (input.to === "pending") {
        title = `Bài chờ duyệt: ${t}`;
        level = "warning";
      } else {
        title = `${t} chuyển sang ${STATUS_LABEL[input.to ?? ""] ?? input.to}`;
      }
  }

  return notify({
    type: "article",
    level,
    title,
    body:
      input.event === "status"
        ? `${who}: ${STATUS_LABEL[input.from ?? ""] ?? input.from} → ${STATUS_LABEL[input.to ?? ""] ?? input.to}`
        : "",
    link: input.event === "deleted" ? undefined : `/admin/articles/${input.articleId}`,
    articleId: input.articleId,
    groupKey,
  });
}
