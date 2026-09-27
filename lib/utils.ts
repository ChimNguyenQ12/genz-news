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

/**
 * JSON để nhúng trong <script type="application/ld+json">.
 *
 * JSON.stringify KHÔNG escape "<", nên một tít có "</script><script>…" thoát
 * ra khỏi thẻ và chạy như mã thật — tít/dek/tag do tài khoản thường nhập, và
 * admin mở bản xem trước bài nháp là chạy mã đó bằng phiên admin. Đổi các ký
 * tự nguy hiểm sang dạng \uXXXX: vẫn là JSON hợp lệ, trình duyệt không còn
 * thấy thẻ đóng.
 */
export function jsonLdScript(data: unknown): string {
  return JSON.stringify(data)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}
