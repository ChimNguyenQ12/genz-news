import { NextResponse } from "next/server";
import { createSessionToken, getSessionCookieOptions, SESSION_COOKIE } from "@/lib/auth";
import { burnPasswordCheck, findByUsername, toPublicUser, verifyPassword } from "@/lib/users";
import { clientIp, hit, reset, retryAfter, tooMany } from "@/lib/rateLimit";

/**
 * Chặn dò mật khẩu: chỉ đếm lần SAI. Theo IP chặn một máy thử nhiều tài khoản;
 * theo tài khoản chặn dò một tài khoản từ nhiều IP. Bot viết bài đăng nhập
 * đúng mỗi lượt nên không bao giờ chạm trần.
 */
const PER_IP = { max: 10, windowMs: 15 * 60_000 };
// Cao hơn theo IP: đủ chậm để dò mật khẩu vô vọng, mà người lạ khó cố tình
// gõ sai để khoá tài khoản admin / bot viết bài.
const PER_ACCOUNT = { max: 20, windowMs: 15 * 60_000 };

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

  if (username.length > 64 || password.length > 256) {
    return NextResponse.json({ error: "Sai tài khoản hoặc mật khẩu" }, { status: 401 });
  }

  const ipKey = `login:ip:${clientIp(request)}`;
  const accountKey = `login:user:${username.trim().toLowerCase()}`;
  const wait = Math.max(retryAfter(ipKey, PER_IP), retryAfter(accountKey, PER_ACCOUNT));
  if (wait) {
    return tooMany(wait, `Sai quá nhiều lần. Thử lại sau ${Math.ceil(wait / 60)} phút.`);
  }

  const user = await findByUsername(username);
  // Luôn trả cùng một thông báo để không lộ tài khoản nào tồn tại.
  const failed = NextResponse.json(
    { error: "Sai tài khoản hoặc mật khẩu" },
    { status: 401 },
  );
  if (!user || !(await verifyPassword(user, password))) {
    if (!user) await burnPasswordCheck(password);
    hit(ipKey);
    hit(accountKey);
    return failed;
  }
  reset(accountKey);
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
    createSessionToken(user),
    getSessionCookieOptions(request),
  );
  return response;
}
