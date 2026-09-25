import { NextResponse } from "next/server";
import { createSessionToken, getSessionCookieOptions, SESSION_COOKIE } from "@/lib/auth";
import { findByUsername, toPublicUser, verifyPassword } from "@/lib/users";

export async function POST(request: Request) {
  let username = "";
  let password = "";
  try {
    const body = await request.json();
    username = String(body.username ?? "");
    password = String(body.password ?? "");
  } catch {
    return NextResponse.json({ error: "Dữ liệu không hợp lệ" }, { status: 400 });
  }

  const user = await findByUsername(username);
  // Luôn trả cùng một thông báo để không lộ tài khoản nào tồn tại.
  const failed = NextResponse.json(
    { error: "Sai tài khoản hoặc mật khẩu" },
    { status: 401 },
  );
  if (!user) return failed;
  if (!(await verifyPassword(user, password))) return failed;
  // Báo rõ chỉ SAU khi đúng mật khẩu: người lạ không dò được tài khoản nào bị khoá.
  if (user.disabledAt) {
    return NextResponse.json(
      { error: "Tài khoản này đã bị khoá. Liên hệ ban biên tập nếu bạn nghĩ đây là nhầm lẫn." },
      { status: 403 },
    );
  }

  const publicUser = toPublicUser(user);
  const redirectUrl = publicUser.role === "admin" ? "/admin" : "/dashboard";

  const response = NextResponse.json({
    user: publicUser,
    redirectUrl,
  });

  response.cookies.set(
    SESSION_COOKIE,
    createSessionToken(user.id),
    getSessionCookieOptions(request),
  );
  return response;
}
