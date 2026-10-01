import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { deleteComment } from "@/lib/comments";
import { prisma } from "@/lib/prisma";
import { revalidateArticlePage } from "@/lib/revalidate";

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });

  const { id } = await params;
  // Lấy slug TRƯỚC khi xoá, để làm mới đúng trang bài đang cache bình luận này.
  const owner = await prisma.comment.findUnique({
    where: { id },
    select: { article: { select: { slug: true } } },
  });
  const result = await deleteComment(id, { id: user.id, role: user.role });
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  if (owner) revalidateArticlePage(owner.article.slug);
  return NextResponse.json({ ok: true });
}
