import { NextResponse } from "next/server";
import { createSessionToken, getSessionCookieOptions, getSessionUser, SESSION_COOKIE } from "@/lib/auth";
import { hit, retryAfter, tooMany } from "@/lib/rateLimit";

/** Phiên bị đánh cắp cũng không dò được mật khẩu hiện tại qua đây. */
const WRONG_CURRENT = { max: 5, windowMs: 15 * 60_000 };
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

  const key = `password:${user.id}`;
  const wait = retryAfter(key, WRONG_CURRENT);
  if (wait) return tooMany(wait);
  if (!(await verifyPassword(user, current))) {
    hit(key);
    return NextResponse.json({ error: "Mật khẩu hiện tại không đúng" }, { status: 403 });
  }
  if (next.length < 8 || next.length > 256) {
    return NextResponse.json({ error: "Mật khẩu mới phải từ 8 đến 256 ký tự" }, { status: 400 });
  }
  if (next === current) {
    return NextResponse.json({ error: "Mật khẩu mới phải khác mật khẩu cũ" }, { status: 400 });
  }

  const ok = await changePassword(user.id, next);
  if (!ok) return NextResponse.json({ error: "Đổi mật khẩu thất bại" }, { status: 500 });

  // Đổi mật khẩu làm mọi phiên cũ mất hiệu lực (xem lib/auth.ts) — cấp lại
  // phiên cho chính thiết bị đang đổi, để người đổi không bị đăng xuất theo.
  const fresh = await findById(user.id);
  const response = NextResponse.json({ ok: true });
  if (fresh) response.cookies.set(SESSION_COOKIE, createSessionToken(fresh), getSessionCookieOptions(request));
  return response;
}
