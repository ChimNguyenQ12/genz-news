import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { getArticleById } from "@/lib/store";
import { postArticleToFacebook } from "@/lib/facebook";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user || user.role !== "admin") {
    return NextResponse.json({ error: "Không có quyền truy cập" }, { status: 403 });
  }

  try {
    const body = await req.json();
    const { articleId, customCaption, customComment } = body;

    if (!articleId) {
      return NextResponse.json({ error: "Thiếu articleId" }, { status: 400 });
    }

    const article = await getArticleById(articleId);
    if (!article) {
      return NextResponse.json({ error: "Không tìm thấy bài viết" }, { status: 404 });
    }

    const result = await postArticleToFacebook(article, customCaption, customComment);

    if (!result.success) {
      return NextResponse.json(
        { error: result.error || "Đăng bài Facebook thất bại" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      postId: result.postId,
      commentId: result.commentId,
      message: "Đã xuất bản lên Facebook Fanpage thành công!",
    });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: errorMsg }, { status: 500 });
  }
}
