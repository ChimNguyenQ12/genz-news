import { NextResponse } from "next/server";
import { POSTS_PER_DAY, scheduleToday } from "@/lib/social/core";
import { fail, guard } from "@/lib/social/http";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ platform: string }> };

/** Lấp giờ vàng còn trống hôm nay bằng các bài nóng nhất chưa lên nền tảng này. */
export async function POST(req: Request, { params }: Ctx) {
  const g = await guard((await params).platform);
  if (g.error) return g.error;
  const body = (await req.json().catch(() => ({}))) as { perDay?: number };
  const perDay = Math.min(Math.max(Number(body.perDay) || POSTS_PER_DAY, 1), 8);
  try {
    const r = await scheduleToday(g.platform, perDay);
    return NextResponse.json({
      ...r,
      message: !r.freeSlots
        ? "Hôm nay không còn giờ vàng trống"
        : r.scheduled.length
          ? `Đã xếp ${r.scheduled.length} bài nóng nhất vào ${r.freeSlots} giờ vàng còn trống hôm nay`
          : "Không còn bài nào chưa lên",
    });
  } catch (err) {
    return fail(err);
  }
}
