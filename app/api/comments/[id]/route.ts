import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { deleteComment } from "@/lib/comments";

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });

  const { id } = await params;
  const result = await deleteComment(id, { id: user.id, role: user.role });
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  return NextResponse.json({ ok: true });
}
