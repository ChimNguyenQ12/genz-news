import type { ReactNode } from "react";

/**
 * Khung chung cho các trang tĩnh (giới thiệu, nguyên tắc, điều khoản…).
 *
 * Dùng lại class .article-body của trang bài viết để kiểu chữ, link, danh sách,
 * trích dẫn… giống hệt bài đọc — khỏi phải định nghĩa thêm một hệ typography
 * thứ hai rồi lệch nhau về sau.
 */
export default function InfoPage({
  title,
  summary,
  updatedAt,
  children,
}: {
  title: string;
  summary?: string;
  /** Ngày cập nhật, đã ở dạng hiển thị được (VD "28/09/2026"). */
  updatedAt?: string;
  children: ReactNode;
}) {
  return (
    <article className="mx-auto max-w-3xl px-4 py-10 sm:py-14">
      <h1 className="font-display text-3xl font-black leading-tight sm:text-4xl">
        {title}
      </h1>
      {summary && <p className="mt-4 text-lg text-muted">{summary}</p>}
      {updatedAt && (
        <p className="mt-3 text-sm text-muted">Cập nhật lần cuối: {updatedAt}</p>
      )}
      <div className="article-body mt-8 text-[17px] leading-relaxed">
        {children}
      </div>
    </article>
  );
}
