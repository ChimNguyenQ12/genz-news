import { NextResponse } from "next/server";
import { removePost, updatePost } from "@/lib/social/core";
import { fail, guard } from "@/lib/social/http";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ platform: string; articleId: string }> };

/** Sửa caption / bình luận / giờ đăng. Bài đã đăng thì sửa trên nền tảng (nếu nền tảng cho), không đăng lại. */
export async function PATCH(req: Request, { params }: Ctx) {
  const { platform, articleId } = await params;
  const g = await guard(platform);
  if (g.error) return g.error;
  const body = (await req.json().catch(() => ({}))) as { caption?: string; comment?: string; scheduledAt?: string };
  const at = body.scheduledAt ? new Date(body.scheduledAt) : undefined;
  if (at && Number.isNaN(at.getTime())) {
    return NextResponse.json({ error: "Giờ đăng không hợp lệ" }, { status: 400 });
  }
  try {
    await updatePost(g.platform, articleId, { caption: body.caption, comment: body.comment, scheduledAt: at });
    return NextResponse.json({ message: "Đã lưu thay đổi" });
  } catch (err) {
    return fail(err);
  }
}

/** Gỡ bài khỏi nền tảng, hoặc huỷ lịch nếu chưa đăng. */
export async function DELETE(_req: Request, { params }: Ctx) {
  const { platform, articleId } = await params;
  const g = await guard(platform);
  if (g.error) return g.error;
  try {
    await removePost(g.platform, articleId);
    return NextResponse.json({ message: "Đã gỡ" });
  } catch (err) {
    return fail(err);
  }
}
