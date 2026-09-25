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
        ? "No free golden hours left today"
        : r.scheduled.length
          ? `Scheduled the ${r.scheduled.length} hottest into today's ${r.freeSlots} free golden hours`
          : "Nothing left to schedule",
    });
  } catch (err) {
    return fail(err);
  }
}
