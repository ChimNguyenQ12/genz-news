import { notify, pruneNotifications } from "@/lib/notifications";
import { drainAlerts, type TrafficAlert } from "@/lib/traffic";
import { flushViews } from "@/lib/views";

/**
 * Vòng nền của khu quản trị, khởi động một lần từ instrumentation.ts:
 * - chuyển cảnh báo lưu lượng (lib/traffic.ts, trong bộ nhớ) thành thông báo,
 * - ghi lô lượt đọc còn treo,
 * - dọn thông báo quá hạn mỗi ngày.
 *
 * proxy.ts không tự ghi thông báo vì nó chạy trước mọi request — kéo Prisma
 * vào đó là thêm một lần truy vấn DB vào đường nóng nhất của app, đúng lúc
 * đang bị dội.
 */

const TICK_MS = 30_000;
const PRUNE_MS = 24 * 3600_000;

const g = globalThis as unknown as { __genzMonitor?: { started: boolean; lastPrune: number } };

const time = (minute: number) =>
  new Date(minute).toLocaleTimeString("vi-VN", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Ho_Chi_Minh",
  });

/** Biến cảnh báo thành thông báo. KHÔNG đưa IP vào — xem lib/traffic.ts. */
async function alertToNotification(a: TrafficAlert) {
  if (a.kind === "ip") {
    await notify({
      type: "traffic",
      level: "danger",
      title: a.autoBlocked
        ? `Một địa chỉ IP gửi ${a.count} request/phút — đã tự chặn 10 phút`
        : `Một địa chỉ IP gửi ${a.count} request/phút`,
      body: `Lúc ${time(a.minute)}. Xem IP, đường dẫn và User-Agent ở tab Traffic để quyết định có chặn không.`,
      link: "/admin/activity?tab=traffic",
      groupKey: "traffic:ip",
      groupWindowMs: 30 * 60_000,
    });
  } else if (a.kind === "total") {
    await notify({
      type: "traffic",
      level: "danger",
      title: `Lưu lượng vượt ngưỡng: ${a.count.toLocaleString("vi-VN")} request/phút`,
      body: `Lúc ${time(a.minute)}. Có thể đang bị dội request (DDoS) — kiểm tra tab Traffic và Cloudflare.`,
      link: "/admin/activity?tab=traffic",
      groupKey: "traffic:total",
      groupWindowMs: 30 * 60_000,
    });
  } else {
    await notify({
      type: "traffic",
      level: "warning",
      title: `Lưu lượng tăng đột biến: ${a.count.toLocaleString("vi-VN")} request/phút`,
      body: `Lúc ${time(a.minute)}, gấp nhiều lần mức trung bình ${a.baseline ?? 0}/phút trước đó. Có thể là bài đang lên top — hoặc bị dội.`,
      link: "/admin/activity?tab=traffic",
      groupKey: "traffic:spike",
      groupWindowMs: 30 * 60_000,
    });
  }
}

export async function tick() {
  for (const a of drainAlerts()) await alertToNotification(a);
  await flushViews();

  const st = g.__genzMonitor;
  if (st && Date.now() - st.lastPrune > PRUNE_MS) {
    st.lastPrune = Date.now();
    await pruneNotifications();
  }
}

export function startMonitor() {
  if (g.__genzMonitor?.started) return;
  g.__genzMonitor = { started: true, lastPrune: 0 };
  const timer = setInterval(() => {
    tick().catch((err) => console.error("[monitor]", err));
  }, TICK_MS);
  timer.unref?.();
}
