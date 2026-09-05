import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { changePassword, findById, verifyPassword } from "@/lib/users";

export async function POST(request: Request) {
  const session = await getSessionUser();
  if (!session) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Dữ liệu không hợp lệ" }, { status: 400 });
  }

  const current = String(body.currentPassword ?? "");
  const next = String(body.newPassword ?? "");

  const user = await findById(session.id);
  if (!user) return NextResponse.json({ error: "Không tìm thấy tài khoản" }, { status: 404 });

  if (!(await verifyPassword(user, current))) {
    return NextResponse.json({ error: "Mật khẩu hiện tại không đúng" }, { status: 403 });
  }
  if (next.length < 8) {
    return NextResponse.json({ error: "Mật khẩu mới phải từ 8 ký tự" }, { status: 400 });
  }
  if (next === current) {
    return NextResponse.json({ error: "Mật khẩu mới phải khác mật khẩu cũ" }, { status: 400 });
  }

  const ok = await changePassword(user.id, next);
  if (!ok) return NextResponse.json({ error: "Đổi mật khẩu thất bại" }, { status: 500 });

  return NextResponse.json({ ok: true });
}
