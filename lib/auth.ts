import crypto from "crypto";
import { cookies } from "next/headers";
import { findById, type PublicUser, type Role, toPublicUser } from "./users";
import { SESSION_SECRET } from "./secret";

export const SESSION_COOKIE = "genz_session";
const SESSION_TTL_MS = 1000 * 60 * 60 * 12; // 12 giờ

/**
 * Chữ ký phủ cả salt mật khẩu của tài khoản: đổi hoặc reset mật khẩu là salt
 * đổi, mọi phiên cũ (kể cả phiên bị đánh cắp) mất hiệu lực ngay. Các script
 * bảo trì tự ký phiên (scripts/social-run-due.mjs…) ký đúng công thức này.
 */
function sign(payload: string, salt: string) {
  return crypto.createHmac("sha256", SESSION_SECRET).update(`${payload}.${salt}`).digest("hex");
}

/** Token = userId.expiresAt.chữ_ký — vai trò luôn đọc lại từ cơ sở dữ liệu, không tin cookie. */
export function createSessionToken(user: { id: string; salt: string }) {
  const expiresAt = Date.now() + SESSION_TTL_MS;
  const payload = `${user.id}.${expiresAt}`;
  return `${payload}.${sign(payload, user.salt)}`;
}

/** User đang đăng nhập, hoặc null. */
export async function getSessionUser(): Promise<PublicUser | null> {
  const store = await cookies();
  const parts = (store.get(SESSION_COOKIE)?.value ?? "").split(".");
  if (parts.length !== 3) return null;
  const [userId, expiresAt, signature] = parts;
  if (!(Number(expiresAt) > Date.now())) return null;

  const user = await findById(userId);
  if (!user) return null;
  const expected = sign(`${userId}.${expiresAt}`, user.salt);
  if (
    signature.length !== expected.length ||
    !crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))
  ) {
    return null;
  }
  // Tài khoản bị khoá: phiên đang mở mất hiệu lực ngay, không đợi cookie hết hạn.
  return user.disabledAt ? null : toPublicUser(user);
}

export async function requireRole(role: Role): Promise<PublicUser | null> {
  const user = await getSessionUser();
  if (!user || user.role !== role) return null;
  return user;
}

export function getSessionCookieOptions(req?: Request) {
  let isSecure = process.env.NODE_ENV === "production";
  if (process.env.COOKIE_SECURE === "false") {
    isSecure = false;
  } else if (process.env.COOKIE_SECURE === "true") {
    isSecure = true;
  } else if (req) {
    const proto = req.headers.get("x-forwarded-proto");
    const isHttps = proto ? proto === "https" : req.url.startsWith("https:");
    // Chỉ bật secure nếu kết nối thực sự là HTTPS (tránh trình duyệt mobile chặn cookie khi chạy HTTP mạng LAN)
    isSecure = isSecure && isHttps;
  }

  return {
    httpOnly: true,
    sameSite: "lax" as const,
    path: "/",
    secure: isSecure,
    maxAge: SESSION_TTL_MS / 1000,
  };
}

export const sessionCookieOptions = getSessionCookieOptions();
