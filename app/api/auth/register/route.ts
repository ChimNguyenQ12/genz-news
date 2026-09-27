import { NextResponse } from "next/server";
import { createSessionToken, getSessionCookieOptions, SESSION_COOKIE } from "@/lib/auth";
import { findById, registerContributor } from "@/lib/users";
import { clientIp, take, tooMany } from "@/lib/rateLimit";

/** Chặn tạo tài khoản hàng loạt: mỗi IP 5 tài khoản / giờ, 10 / ngày. */
const PER_HOUR = { max: 5, windowMs: 3600_000 };
const PER_DAY = { max: 10, windowMs: 24 * 3600_000 };

/** Đặt ALLOW_REGISTRATION=0 để đóng đăng ký công khai (chống spam). */
const REGISTRATION_OPEN = process.env.ALLOW_REGISTRATION !== "0";

export async function POST(request: Request) {
  if (!REGISTRATION_OPEN) {
    return NextResponse.json(
      { error: "Đăng ký đang tạm đóng. Liên hệ admin để được cấp tài khoản." },
      { status: 403 },
    );
  }

  const ip = clientIp(request);
  const wait = take(`register:h:${ip}`, PER_HOUR) || take(`register:d:${ip}`, PER_DAY);
  if (wait) return tooMany(wait, "Tạo quá nhiều tài khoản từ mạng này. Thử lại sau.");

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

  const created = await findById(result.user.id);
  if (!created) return NextResponse.json({ error: "Không tạo được tài khoản" }, { status: 500 });

  const response = NextResponse.json(
    { user: result.user, redirectUrl: "/dashboard" },
    { status: 201 },
  );
  response.cookies.set(
    SESSION_COOKIE,
    createSessionToken(created),
    getSessionCookieOptions(request),
  );
  return response;
}
