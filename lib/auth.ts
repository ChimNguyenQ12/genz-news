import crypto from "crypto";
import { cookies } from "next/headers";
import { findById, type PublicUser, type Role, toPublicUser } from "./users";
import { SESSION_SECRET } from "./secret";

export const SESSION_COOKIE = "genz_session";
const SESSION_TTL_MS = 1000 * 60 * 60 * 12; // 12 giờ

function sign(payload: string) {
  return crypto.createHmac("sha256", SESSION_SECRET).update(payload).digest("hex");
}

/** Token = userId.expiresAt.chữ_ký — vai trò luôn đọc lại từ file, không tin cookie. */
export function createSessionToken(userId: string) {
  const expiresAt = Date.now() + SESSION_TTL_MS;
  const payload = `${userId}.${expiresAt}`;
  return `${payload}.${sign(payload)}`;
}

export function verifySessionToken(token: string | undefined): string | null {
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [userId, expiresAt, signature] = parts;

  const expected = sign(`${userId}.${expiresAt}`);
  if (
    signature.length !== expected.length ||
    !crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))
  ) {
    return null;
  }
  if (Number(expiresAt) < Date.now()) return null;
  return userId;
}

/** User đang đăng nhập, hoặc null. Vai trò được đọc từ data/users.json. */
export async function getSessionUser(): Promise<PublicUser | null> {
  const store = await cookies();
  const userId = verifySessionToken(store.get(SESSION_COOKIE)?.value);
  if (!userId) return null;
  const user = await findById(userId);
  return user ? toPublicUser(user) : null;
}

export async function requireRole(role: Role): Promise<PublicUser | null> {
  const user = await getSessionUser();
  if (!user || user.role !== role) return null;
  return user;
}

export const sessionCookieOptions = {
  httpOnly: true,
  sameSite: "lax" as const,
  path: "/",
  secure: process.env.NODE_ENV === "production",
  maxAge: SESSION_TTL_MS / 1000,
};
