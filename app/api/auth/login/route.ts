import { NextResponse } from "next/server";
import { createSessionToken, SESSION_COOKIE, sessionCookieOptions } from "@/lib/auth";
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

  const response = NextResponse.json({ user: toPublicUser(user) });
  response.cookies.set(SESSION_COOKIE, createSessionToken(user.id), sessionCookieOptions);
  return response;
}
