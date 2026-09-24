import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { publishFacebookPostNow, scheduleFacebookPost } from "@/lib/facebook";

export const dynamic = "force-dynamic";

/**
 * Đưa một bài lên Facebook Page.
 * body: { articleId, caption?, comment?, mode: "now" | "schedule", scheduledAt? }
 * Không có scheduledAt thì xếp vào giờ vàng trống kế tiếp.
 */
export async function POST(req: Request) {
  const user = await getSessionUser();
  if (user?.role !== "admin") {
    return NextResponse.json({ error: "Không có quyền truy cập" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const { articleId, caption, comment, mode, scheduledAt } = body as {
    articleId?: string;
    caption?: string;
    comment?: string;
    mode?: "now" | "schedule";
    scheduledAt?: string;
  };
  if (!articleId) return NextResponse.json({ error: "Thiếu articleId" }, { status: 400 });

  try {
    if (mode === "now") {
      const post = await publishFacebookPostNow(articleId, { caption, comment });
      return NextResponse.json({ post, message: "Đã đăng lên Facebook Page" });
    }
    const at = scheduledAt ? new Date(scheduledAt) : undefined;
    if (at && (Number.isNaN(at.getTime()) || at.getTime() < Date.now() - 60_000)) {
      return NextResponse.json({ error: "Giờ đăng không hợp lệ hoặc đã qua" }, { status: 400 });
    }
    const post = await scheduleFacebookPost(articleId, { caption, comment, scheduledAt: at });
    return NextResponse.json({ post, message: "Đã lên lịch đăng" });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 400 });
  }
}
