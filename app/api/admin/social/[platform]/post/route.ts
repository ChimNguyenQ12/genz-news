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
    topicTag?: string | null;
    mode?: "now" | "schedule";
    scheduledAt?: string;
  };
  if (!body.articleId) return NextResponse.json({ error: "Missing articleId" }, { status: 400 });

  try {
    if (body.mode === "now") {
      const { queued, skipped } = await queueNow(g.platform, [body.articleId], body);
      if (!queued.length) throw new Error(skipped[0]?.reason ?? "Could not queue");
      after(() => runDue().catch(() => {}));
      return NextResponse.json({ message: "Queued — it will go live in a moment" });
    }
    const at = body.scheduledAt ? new Date(body.scheduledAt) : undefined;
    if (at && (Number.isNaN(at.getTime()) || at.getTime() < Date.now() - 60_000)) {
      return NextResponse.json({ error: "Invalid or past time" }, { status: 400 });
    }
    await schedulePost(g.platform, body.articleId, {
      caption: body.caption,
      comment: body.comment,
      topicTag: body.topicTag,
      scheduledAt: at,
    });
    return NextResponse.json({ message: "Scheduled" });
  } catch (err) {
    return fail(err);
  }
}
