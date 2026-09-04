export function formatDate(iso: string) {
  const d = new Date(iso);
  return new Intl.DateTimeFormat("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(d);
}

export function relativeTime(iso: string) {
  const now = new Date("2026-09-04");
  const then = new Date(iso);
  const diffMs = now.getTime() - then.getTime();
  const diffH = Math.round(diffMs / (1000 * 60 * 60));
  if (diffH < 1) return "Vừa xong";
  if (diffH < 24) return `${diffH} giờ trước`;
  const diffD = Math.round(diffH / 24);
  return `${diffD} ngày trước`;
}
