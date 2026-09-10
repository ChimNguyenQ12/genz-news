/**
 * Khung xám hiện ngay trong lúc máy chủ dựng trang.
 *
 * Các trang trong khu quản trị đều là `force-dynamic` — mỗi lần đổi tab là một
 * lượt hỏi máy chủ, và trước khi có tệp loading.tsx thì trình duyệt đứng im ở
 * trang cũ suốt lượt đó, nên bấm xong tưởng như không có gì xảy ra. Khung này
 * đổi cảm giác "treo" thành "đang tải".
 */
export default function ListSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div className="animate-pulse">
      <div className="mb-6 h-8 w-56 rounded-lg bg-surface-2" />
      <div className="mb-3 h-10 w-full max-w-md rounded-xl bg-surface-2" />
      <div className="mb-4 h-12 w-full rounded-xl bg-surface-2" />
      <div className="space-y-2">
        {Array.from({ length: rows }).map((_, i) => (
          <div
            key={i}
            className="flex items-center gap-3 rounded-2xl border border-border bg-surface p-3"
          >
            <div className="size-11 shrink-0 rounded-lg bg-surface-2 sm:size-12" />
            <div className="min-w-0 flex-1 space-y-2">
              <div className="h-3 w-24 rounded bg-surface-2" />
              <div className="h-4 w-2/3 rounded bg-surface-2" />
              <div className="h-3 w-40 rounded bg-surface-2" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
