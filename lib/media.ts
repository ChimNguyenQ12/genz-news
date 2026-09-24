/**
 * Đưa ảnh trên kho S3 qua chính tên miền của trang.
 *
 * Bucket nằm ở us-east-1: tải thẳng từ Việt Nam mất 4–16 giây cho một ảnh
 * 450KB. Đi qua genz-news.site thì Cloudflare cache ảnh ở edge gần Việt Nam
 * (Singapore), lần sau còn khoảng 0,1 giây. /media/* được chuyển tiếp tới S3
 * trong next.config.ts; S3 đã trả sẵn Cache-Control immutable 1 năm (xem
 * lib/storage.ts), nên Cloudflare giữ ảnh lâu mà không cần cấu hình thêm.
 *
 * Chỉ đổi URL lúc hiển thị: DB vẫn lưu URL S3 gốc, để lệnh lưu bài, trang
 * quản trị và bản sao lưu không phải biết gì về chuyện này.
 */

export const S3_UPLOADS_BASE = `${
  process.env.S3_PUBLIC_BASE ??
  `https://${process.env.S3_BUCKET ?? "genz-news"}.s3.${process.env.AWS_REGION ?? "us-east-1"}.amazonaws.com`
}/uploads/`;

export const MEDIA_PATH = "/media/";

/** URL ảnh trên kho của mình → /media/...; URL khác giữ nguyên. */
export function mediaUrl(url: string): string;
export function mediaUrl(url: string | undefined): string | undefined;
export function mediaUrl(url: string | undefined) {
  return url?.startsWith(S3_UPLOADS_BASE)
    ? MEDIA_PATH + url.slice(S3_UPLOADS_BASE.length)
    : url;
}

function escapeRegExp(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Chỉ thẻ <img>. Video (<video>, <source>) để đi thẳng S3: proxy qua app phải
// lo cả Range request, và Cloudflare gói miễn phí không dành cho phát video.
const IMG_SRC = new RegExp(
  `(<img\\b[^>]*?\\bsrc=")${escapeRegExp(S3_UPLOADS_BASE)}`,
  "g",
);

/** Đổi src của mọi <img> trỏ về kho S3 trong thân bài (HTML đã làm sạch). */
export function mediaHtml(html: string): string {
  return html.replace(IMG_SRC, `$1${MEDIA_PATH}`);
}
