import Link from "next/link";

/**
 * Phân trang cho trang công khai: link thật (?trang=N) để Google lần được tới
 * các trang sau, và mỗi trang render phía máy chủ như trang đầu.
 */
export default function PageNav({
  page,
  totalPages,
  href,
}: {
  page: number;
  totalPages: number;
  href: (page: number) => string;
}) {
  if (totalPages <= 1) return null;

  // 1 … 4 5 [6] 7 8 … 20
  const shown = new Set([1, totalPages, page - 2, page - 1, page, page + 1, page + 2]);
  const pages = [...shown].filter((p) => p >= 1 && p <= totalPages).sort((a, b) => a - b);

  const cell = "flex h-10 min-w-10 items-center justify-center rounded-full border px-3 text-sm font-semibold transition";
  return (
    <nav aria-label="Phân trang" className="mt-12 flex flex-wrap items-center justify-center gap-2">
      {page > 1 && (
        <Link href={href(page - 1)} rel="prev" className={`${cell} border-border hover:border-accent hover:text-accent`}>
          ← Trước
        </Link>
      )}
      {pages.map((p, i) => (
        <span key={p} className="flex items-center gap-2">
          {i > 0 && p - pages[i - 1] > 1 && <span className="text-muted">…</span>}
          {p === page ? (
            <span aria-current="page" className={`${cell} border-accent bg-accent text-white`}>
              {p}
            </span>
          ) : (
            <Link href={href(p)} className={`${cell} border-border hover:border-accent hover:text-accent`}>
              {p}
            </Link>
          )}
        </span>
      ))}
      {page < totalPages && (
        <Link href={href(page + 1)} rel="next" className={`${cell} border-border hover:border-accent hover:text-accent`}>
          Sau →
        </Link>
      )}
    </nav>
  );
}
