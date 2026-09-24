import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { POSTS_PER_DAY, scheduleTodayArticles } from "@/lib/facebook";

export const dynamic = "force-dynamic";

/** Xếp các bài đăng web hôm nay chưa có trên Facebook vào giờ vàng còn trống. */
export async function POST(req: Request) {
  const user = await getSessionUser();
  if (user?.role !== "admin") {
    return NextResponse.json({ error: "Không có quyền truy cập" }, { status: 403 });
  }
  const body = (await req.json().catch(() => ({}))) as { perDay?: number };
  const perDay = Math.min(Math.max(Number(body.perDay) || POSTS_PER_DAY, 1), 8);
  try {
    const result = await scheduleTodayArticles(perDay);
    return NextResponse.json({
      ...result,
      message: result.total
        ? `Đã xếp lịch ${result.scheduled.length}/${result.total} bài hôm nay`
        : "Không còn bài nào hôm nay chưa có trên Facebook",
    });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 400 });
  }
}
