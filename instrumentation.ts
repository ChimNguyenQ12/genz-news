/**
 * Chạy một lần khi máy chủ Next khởi động. Chỉ dùng để bật vòng nền của khu
 * quản trị (lib/monitor.ts) — chỉ ở runtime Node, vì nó cần Prisma/SQLite.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { startMonitor } = await import("@/lib/monitor");
    startMonitor();
  }
}
