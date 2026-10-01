/**
 * Chạy một lần khi máy chủ Next khởi động (chỉ runtime Node, vì cần Prisma):
 *   - bật vòng nền của khu quản trị (lib/monitor.ts);
 *   - hâm nóng trang chủ: bản dựng lúc build chỉ là bản giữ chỗ (lúc build
 *     không có database), nên bỏ nó đi rồi tự xem trang chủ một lượt — người
 *     đọc đầu tiên sau mỗi lần deploy/khởi động lại nhận ngay bản có bài.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { startMonitor } = await import("@/lib/monitor");
  startMonitor();

  const base = `http://127.0.0.1:${process.env.PORT ?? 3000}`;
  // register() chạy TRƯỚC khi máy chủ nhận request, nên hâm nóng ở nhịp sau
  // và thử lại tới khi máy chủ trả lời (tối đa ~10 giây).
  let tries = 0;
  const warm = async () => {
    try {
      await fetch(`${base}/api/internal/warm`, { method: "POST" });
      await fetch(`${base}/`);
    } catch {
      if (++tries < 20) setTimeout(warm, 500).unref?.();
      else console.warn("[warm] không hâm nóng được trang chủ");
    }
  };
  setTimeout(warm, 300).unref?.();
}
