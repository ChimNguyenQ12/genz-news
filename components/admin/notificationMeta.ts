/** Kiểu dữ liệu và cách hiển thị thông báo, dùng chung cho chuông và trang Activity. */

export type NotificationType = "user" | "article" | "comment" | "views" | "traffic" | "system";
export type NotificationLevel = "info" | "warning" | "danger";

export interface NotificationItem {
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

const LEVEL_CLS: Record<NotificationLevel, string> = {
  info: "",
  warning: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
  danger: "bg-red-500/15 text-red-600 dark:text-red-400",
};

export const NOTIFICATION_META: Record<
  NotificationType,
  { label: string; icon: string; cls: (level: NotificationLevel) => string }
> = {
  user: { label: "New users", icon: "👤", cls: (l) => LEVEL_CLS[l] || "bg-sky-500/15 text-sky-600" },
  article: { label: "Articles", icon: "📝", cls: (l) => LEVEL_CLS[l] || "bg-violet-500/15 text-violet-600" },
  comment: { label: "Comments", icon: "💬", cls: (l) => LEVEL_CLS[l] || "bg-emerald-500/15 text-emerald-600" },
  views: { label: "Views", icon: "📈", cls: (l) => LEVEL_CLS[l] || "bg-fuchsia-500/15 text-fuchsia-600" },
  traffic: { label: "Traffic", icon: "🛡️", cls: (l) => LEVEL_CLS[l] || "bg-surface-2 text-muted" },
  system: { label: "System", icon: "⚙️", cls: (l) => LEVEL_CLS[l] || "bg-surface-2 text-muted" },
};

export function timeAgo(iso: string, now = Date.now()) {
  const s = Math.max(0, Math.round((now - new Date(iso).getTime()) / 1000));
  if (s < 60) return "just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h ago`;
  const d = Math.round(h / 24);
  if (d < 7) return `${d} d ago`;
  return new Date(iso).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}
