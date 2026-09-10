"use client";

/**
 * Phân trang dùng chung cho các danh sách trong khu quản trị.
 *
 * Chỉ bày vài số quanh trang đang xem: hàng đợi đề tài có thể lên tới hàng
 * trăm trang, in hết số ra thì tràn màn hình điện thoại.
 */
export default function Pagination({
  page,
  totalPages,
  onChange,
  className = "mt-4",
}: {
  page: number;
  totalPages: number;
  onChange: (page: number) => void;
  /** Danh sách bày phân trang ở cả trên lẫn dưới nên khoảng cách phải đổi được. */
  className?: string;
}) {
  if (totalPages <= 1) return null;

  const span = 2;
  const numbers: (number | "gap")[] = [];
  for (let i = 1; i <= totalPages; i++) {
    if (i === 1 || i === totalPages || Math.abs(i - page) <= span) {
      numbers.push(i);
    } else if (numbers[numbers.length - 1] !== "gap") {
      numbers.push("gap");
    }
  }

  const box =
    "min-w-9 rounded-lg border border-border px-2.5 py-1.5 text-xs font-semibold transition disabled:opacity-40";

  return (
    <div className={`flex flex-wrap items-center justify-center gap-1.5 ${className}`}>
      <button
        onClick={() => onChange(page - 1)}
        disabled={page <= 1}
        className={`${box} hover:border-accent hover:text-accent`}
      >
        ← Trước
      </button>

      {numbers.map((n, i) =>
        n === "gap" ? (
          <span key={`gap-${i}`} className="px-1 text-xs text-muted">
            …
          </span>
        ) : (
          <button
            key={n}
            onClick={() => onChange(n)}
            className={`${box} ${
              n === page
                ? "border-accent bg-accent text-white"
                : "hover:border-accent hover:text-accent"
            }`}
          >
            {n}
          </button>
        ),
      )}

      <button
        onClick={() => onChange(page + 1)}
        disabled={page >= totalPages}
        className={`${box} hover:border-accent hover:text-accent`}
      >
        Sau →
      </button>
    </div>
  );
}
