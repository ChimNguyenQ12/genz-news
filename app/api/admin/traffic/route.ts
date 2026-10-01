import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { blockIp, snapshot, unblockIp } from "@/lib/traffic";
import { dailyTotals, topViewed } from "@/lib/views";
import { tick } from "@/lib/monitor";
import { clientIp } from "@/lib/rateLimit";

export const dynamic = "force-dynamic";

/** Lưu lượng hiện tại (trong bộ nhớ) + bài đọc nhiều. Tham số: days (1/7/30). */
export async function GET(request: Request) {
  if (!(await requireRole("admin"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const days = [1, 7, 30].includes(Number(new URL(request.url).searchParams.get("days")))
    ? Number(new URL(request.url).searchParams.get("days"))
    : 1;

  // Ghi luôn lô lượt đọc đang chờ và cảnh báo mới, để màn hình thấy số mới nhất
  // thay vì trễ tới 30 giây.
  await tick().catch(() => {});

  const [top, daily] = await Promise.all([topViewed(days, 15), dailyTotals(14)]);
  return NextResponse.json({ traffic: snapshot(), topViewed: top, daily, days });
}

const MAX_BLOCK_MINUTES = 7 * 24 * 60;
const IP_RE = /^[0-9a-fA-F:.]{3,45}$/;

/**
 * Chặn / bỏ chặn một IP tại app: body `{ action: "block" | "unblock", ip, minutes? }`.
 * Chặn nằm trong bộ nhớ — khởi động lại app là mất, và chỉ chặn ở tầng app.
 */
export async function POST(request: Request) {
  const admin = await requireRole("admin");
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Dữ liệu không hợp lệ" }, { status: 400 });
  }
  const ip = String(body.ip ?? "").trim();
  if (!IP_RE.test(ip)) {
    return NextResponse.json({ error: "Địa chỉ IP không hợp lệ" }, { status: 400 });
  }

  if (body.action === "unblock") {
    unblockIp(ip);
    return NextResponse.json({ ok: true });
  }
  if (body.action !== "block") {
    return NextResponse.json({ error: "Thao tác không hợp lệ" }, { status: 400 });
  }
  // Tự chặn IP của chính mình là tự khoá mình khỏi trang quản trị.
  if (ip === clientIp(request)) {
    return NextResponse.json({ error: "Đây là IP bạn đang dùng — không chặn được." }, { status: 400 });
  }
  const minutes = Math.min(Math.max(Math.round(Number(body.minutes) || 60), 1), MAX_BLOCK_MINUTES);
  blockIp(ip, minutes * 60_000, `Chặn tay bởi ${admin.username}`);
  return NextResponse.json({ ok: true });
}
