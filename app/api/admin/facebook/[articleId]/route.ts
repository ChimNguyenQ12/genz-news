import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { removeFacebookPost, updateFacebookPost } from "@/lib/facebook";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ articleId: string }> };

/** Sửa caption / bình luận / giờ đăng. Bài đã lên Page thì sửa luôn trên Facebook, không đăng lại. */
export async function PATCH(req: Request, { params }: Ctx) {
  const user = await getSessionUser();
  if (user?.role !== "admin") {
    return NextResponse.json({ error: "Không có quyền truy cập" }, { status: 403 });
  }
  const { articleId } = await params;
  const body = (await req.json().catch(() => ({}))) as {
    caption?: string;
    comment?: string;
    scheduledAt?: string;
  };
  const at = body.scheduledAt ? new Date(body.scheduledAt) : undefined;
  if (at && Number.isNaN(at.getTime())) {
    return NextResponse.json({ error: "Giờ đăng không hợp lệ" }, { status: 400 });
  }
  try {
    const post = await updateFacebookPost(articleId, { ...body, scheduledAt: at });
    return NextResponse.json({ post, message: "Đã lưu thay đổi" });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 400 });
  }
}

/** Gỡ bài khỏi Page, hoặc huỷ lịch nếu chưa đăng. */
export async function DELETE(_req: Request, { params }: Ctx) {
  const user = await getSessionUser();
  if (user?.role !== "admin") {
    return NextResponse.json({ error: "Không có quyền truy cập" }, { status: 403 });
  }
  const { articleId } = await params;
  try {
    await removeFacebookPost(articleId);
    return NextResponse.json({ message: "Đã gỡ" });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 400 });
  }
}
