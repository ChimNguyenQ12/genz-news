import { NextResponse, after } from "next/server";
import { queueNow, runDue, schedulePost } from "@/lib/social/core";
import { fail, guard } from "@/lib/social/http";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ platform: string }> };

/**
 * Đưa một bài lên nền tảng.
 * body: { articleId, caption?, comment?, mode: "now" | "schedule", scheduledAt? }
 * "now" chỉ đưa vào hàng đợi rồi trả lời ngay; việc đăng chạy nền.
 * "schedule" không có scheduledAt thì vào giờ vàng trống kế tiếp.
 */
export async function POST(req: Request, { params }: Ctx) {
  const g = await guard((await params).platform);
  if (g.error) return g.error;

  const body = (await req.json().catch(() => ({}))) as {
    articleId?: string;
    caption?: string;
    comment?: string;
    mode?: "now" | "schedule";
    scheduledAt?: string;
  };
  if (!body.articleId) return NextResponse.json({ error: "Thiếu articleId" }, { status: 400 });

  try {
    if (body.mode === "now") {
      const { queued, skipped } = await queueNow(g.platform, [body.articleId], body);
      if (!queued.length) throw new Error(skipped[0]?.reason ?? "Không đưa được vào hàng đợi");
      after(() => runDue().catch(() => {}));
      return NextResponse.json({ message: "Đã đưa vào hàng đợi, bài sẽ lên trong giây lát" });
    }
    const at = body.scheduledAt ? new Date(body.scheduledAt) : undefined;
    if (at && (Number.isNaN(at.getTime()) || at.getTime() < Date.now() - 60_000)) {
      return NextResponse.json({ error: "Giờ đăng không hợp lệ hoặc đã qua" }, { status: 400 });
    }
    await schedulePost(g.platform, body.articleId, { caption: body.caption, comment: body.comment, scheduledAt: at });
    return NextResponse.json({ message: "Đã lên lịch đăng" });
  } catch (err) {
    return fail(err);
  }
}
