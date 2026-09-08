import { NextResponse } from "next/server";
import { createSessionToken, getSessionCookieOptions, SESSION_COOKIE } from "@/lib/auth";
import { registerContributor } from "@/lib/users";

/** Đặt ALLOW_REGISTRATION=0 để đóng đăng ký công khai (chống spam). */
const REGISTRATION_OPEN = process.env.ALLOW_REGISTRATION !== "0";

export async function POST(request: Request) {
  if (!REGISTRATION_OPEN) {
    return NextResponse.json(
      { error: "Đăng ký đang tạm đóng. Liên hệ admin để được cấp tài khoản." },
      { status: 403 },
    );
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Dữ liệu không hợp lệ" }, { status: 400 });
  }

  const result = await registerContributor({
    username: String(body.username ?? ""),
    password: String(body.password ?? ""),
    displayName: String(body.displayName ?? ""),
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  const response = NextResponse.json(
    { user: result.user, redirectUrl: "/dashboard" },
    { status: 201 },
  );
  response.cookies.set(
    SESSION_COOKIE,
    createSessionToken(result.user.id),
    getSessionCookieOptions(request),
  );
  return response;
}
