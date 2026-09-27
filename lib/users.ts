import crypto from "crypto";
import { promisify } from "util";
import { prisma } from "./prisma";

const scrypt = promisify(crypto.scrypt) as (
  password: string,
  salt: string,
  keylen: number,
) => Promise<Buffer>;

export type Role = "admin" | "contributor";

export interface User {
  id: string;
  username: string;
  displayName: string;
  /** scrypt hash — không bao giờ gửi ra client. */
  passwordHash: string;
  salt: string;
  role: Role;
  /** Bị admin khoá (ISO). Không có = đang hoạt động. */
  disabledAt?: string;
  createdAt: string;
}

/** Bản rút gọn an toàn để gửi ra client. */
export interface PublicUser {
  id: string;
  username: string;
  displayName: string;
  role: Role;
}

export function toPublicUser(u: User): PublicUser {
  return { id: u.id, username: u.username, displayName: u.displayName, role: u.role };
}

type UserRow = {
  id: string;
  username: string;
  displayName: string;
  passwordHash: string;
  salt: string;
  role: string;
  disabledAt: Date | null;
  createdAt: Date;
};

function toUser(row: UserRow): User {
  return {
    id: row.id,
    username: row.username,
    displayName: row.displayName,
    passwordHash: row.passwordHash,
    salt: row.salt,
    role: row.role as Role,
    disabledAt: row.disabledAt?.toISOString(),
    createdAt: row.createdAt.toISOString(),
  };
}

async function hashPassword(password: string, salt: string) {
  const buf = await scrypt(password, salt, 64);
  return buf.toString("hex");
}

/**
 * Chạy scrypt giả khi không có tài khoản, để "sai tên đăng nhập" mất đúng bằng
 * thời gian "sai mật khẩu" — không thì đo thời gian phản hồi là dò được
 * tài khoản nào tồn tại.
 */
const DUMMY_SALT = crypto.randomBytes(16).toString("hex");
export async function burnPasswordCheck(password: string) {
  await hashPassword(password, DUMMY_SALT);
}

export async function verifyPassword(user: User, password: string) {
  const hash = await hashPassword(password, user.salt);
  const a = Buffer.from(hash, "hex");
  const b = Buffer.from(user.passwordHash, "hex");
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

/**
 * Lần chạy đầu: tạo tài khoản quản trị từ biến môi trường
 * (mặc định admin/admin). Sau đó đổi mật khẩu phải làm trong app.
 */
async function ensureSeeded() {
  const adminCount = await prisma.user.count({ where: { role: "admin" } });
  if (adminCount > 0) return;

  const salt = crypto.randomBytes(16).toString("hex");
  const username = (process.env.ADMIN_USER ?? "admin").toLowerCase();
  await prisma.user.create({
    data: {
      username,
      displayName: username,
      passwordHash: await hashPassword(process.env.ADMIN_PASSWORD ?? "admin", salt),
      salt,
      role: "admin",
    },
  });
}

export async function findByUsername(username: string): Promise<User | undefined> {
  await ensureSeeded();
  const row = await prisma.user.findUnique({
    where: { username: username.trim().toLowerCase() },
  });
  return row ? toUser(row) : undefined;
}

export async function findById(id: string): Promise<User | undefined> {
  const row = await prisma.user.findUnique({ where: { id } });
  return row ? toUser(row) : undefined;
}

export type RegisterResult =
  | { ok: true; user: PublicUser }
  | { ok: false; error: string };

export async function registerContributor(input: {
  username: string;
  password: string;
  displayName: string;
}): Promise<RegisterResult> {
  const username = input.username.trim().toLowerCase();
  const displayName = input.displayName.trim();

  if (!/^[a-z0-9_.-]{3,24}$/.test(username)) {
    return {
      ok: false,
      error: "Tên đăng nhập 3–24 ký tự, chỉ gồm chữ thường, số và _ . -",
    };
  }
  if (input.password.length < 8 || input.password.length > 256) {
    return { ok: false, error: "Mật khẩu phải từ 8 đến 256 ký tự" };
  }
  if (displayName.length < 2 || displayName.length > 40) {
    return { ok: false, error: "Tên hiển thị phải từ 2 đến 40 ký tự" };
  }

  await ensureSeeded();
  const salt = crypto.randomBytes(16).toString("hex");

  try {
    const row = await prisma.user.create({
      data: {
        username,
        displayName,
        passwordHash: await hashPassword(input.password, salt),
        salt,
        role: "contributor",
      },
    });
    return { ok: true, user: toPublicUser(toUser(row)) };
  } catch (err) {
    // P2002 = vi phạm ràng buộc unique (username đã tồn tại)
    if ((err as { code?: string }).code === "P2002") {
      return { ok: false, error: "Tên đăng nhập đã tồn tại" };
    }
    throw err;
  }
}

export async function changePassword(userId: string, newPassword: string) {
  if (newPassword.length < 8 || newPassword.length > 256) return false;
  const salt = crypto.randomBytes(16).toString("hex");
  try {
    await prisma.user.update({
      where: { id: userId },
      data: { salt, passwordHash: await hashPassword(newPassword, salt) },
    });
    return true;
  } catch {
    return false;
  }
}

/** Còn dùng tài khoản admin/admin mặc định không — để cảnh báo trên UI. */
export async function adminUsesDefaultPassword(): Promise<boolean> {
  await ensureSeeded();
  const row = await prisma.user.findFirst({ where: { role: "admin" } });
  if (!row || row.username !== "admin") return false;
  return verifyPassword(toUser(row), "admin");
}
