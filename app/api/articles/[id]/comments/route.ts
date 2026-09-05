import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { createComment, listComments } from "@/lib/comments";
import { getArticleById } from "@/lib/store";

/** Ai cũng đọc được bình luận của bài đã đăng. */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const article = await getArticleById(id);
  if (!article) {
    return NextResponse.json({ error: "Không tìm thấy bài viết" }, { status: 404 });
  }

  // Bài chưa đăng: chỉ admin hoặc tác giả xem được bình luận.
  if (article.status !== "published") {
    const user = await getSessionUser();
    const allowed = user && (user.role === "admin" || article.authorId === user.id);
    if (!allowed) {
      return NextResponse.json({ error: "Không tìm thấy bài viết" }, { status: 404 });
    }
  }

  return NextResponse.json({ comments: await listComments(id) });
}

/** Phải đăng nhập mới được bình luận. */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json(
      { error: "Đăng nhập để bình luận" },
      { status: 401 },
    );
  }

  const { id } = await params;

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Dữ liệu không hợp lệ" }, { status: 400 });
  }

  const result = await createComment({
    articleId: id,
    userId: user.id,
    body: String(body.body ?? ""),
    parentId: body.parentId ? String(body.parentId) : null,
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  return NextResponse.json(
    { comment: result.comment, parentId: result.parentId },
    { status: 201 },
  );
}
