/**
 * Múi giờ để HIỂN THỊ. Phải ghim Asia/Ho_Chi_Minh chứ không để mặc định: app
 * chạy trong container UTC, nên 00:23 ngày 30/09 giờ Việt Nam sẽ bị hiện thành
 * 29/09 — lệch hẳn một ngày với người đọc.
 */
const TZ = "Asia/Ho_Chi_Minh";

export function formatDate(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return new Intl.DateTimeFormat("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: TZ,
  }).format(d);
}

/**
 * Ngày VÀ giờ đăng, giờ Việt Nam. VD: "29/09/2026 20:37".
 *
 * Ghép tay thay vì để Intl tự sắp: mặc định của vi-VN là GIỜ trước ngày
 * ("20:37 29/09/2026"), còn ở đây muốn ngày trước cho khớp cách đọc "ngày và
 * giờ", và cũng để nhãn "Đăng 29/09/2026 20:37" xuôi mắt.
 */
export function formatDateTime(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const day = new Intl.DateTimeFormat("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: TZ,
  }).format(d);
  const time = new Intl.DateTimeFormat("vi-VN", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: TZ,
  }).format(d);
  return `${day} ${time}`;
}

/**
 * Nhãn thời gian cho thẻ bài ở trang chủ / chuyên mục.
 *
 * Chỉ bài vừa lên trong VÒNG MỘT GIỜ mới nói "Vừa xong"; quá đó thì hiện thẳng
 * ngày + giờ đăng, vì "3 ngày trước" không cho biết bài lên lúc nào.
 *
 * Bản trước lấy `now` cứng là 2026-09-04 nên mọi bài đăng sau mốc đó đều cho
 * hiệu số âm và rơi vào nhánh < 1 giờ — cả trang chủ hiện "Vừa xong" hết.
 */
export function relativeTime(iso: string) {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const diffMin = Math.floor((Date.now() - then) / 60000);
  // diffMin âm (bài mang mốc thời gian tương lai) cũng coi như vừa lên.
  if (diffMin < 60) return "Vừa xong";
  return formatDateTime(iso);
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
