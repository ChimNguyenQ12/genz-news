import { NextResponse } from "next/server";
import { POSTS_PER_DAY, scheduleToday } from "@/lib/social/core";
import { fail, guard } from "@/lib/social/http";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ platform: string }> };

/** Xếp các bài đăng web hôm nay chưa có trên nền tảng này vào giờ vàng còn trống. */
export async function POST(req: Request, { params }: Ctx) {
  const g = await guard((await params).platform);
  if (g.error) return g.error;
  const body = (await req.json().catch(() => ({}))) as { perDay?: number };
  const perDay = Math.min(Math.max(Number(body.perDay) || POSTS_PER_DAY, 1), 8);
  try {
    const r = await scheduleToday(g.platform, perDay);
    return NextResponse.json({
      ...r,
      message: r.total
        ? `Đã xếp lịch ${r.scheduled.length}/${r.total} bài hôm nay`
        : "Không còn bài nào hôm nay chưa lên lịch",
    });
  } catch (err) {
    return fail(err);
  }
}
