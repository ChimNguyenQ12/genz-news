import crypto from "crypto";
import { prisma } from "./prisma";
import { foldVietnamese } from "./store";
import { changePassword, type Role } from "./users";

/**
 * Quản lý tài khoản cho /admin/users.
 *
 * Đăng ký mở là đăng được bài (dưới dạng chờ duyệt), nên admin cần thấy ai
 * đang viết gì và chặn được tài khoản spam. Khoá chứ không xoá: xoá thì mất
 * liên kết tới những bài người đó đã viết.
 */

export type UserFilter = "all" | "contributor" | "admin" | "locked";
const PER_PAGE = 20;

export interface UserListItem {
  id: string;
  username: string;
  displayName: string;
  role: Role;
  disabledAt: string | null;
  createdAt: string;
  articles: { total: number; published: number; pending: number; draft: number; rejected: number };
  lastArticleAt: string | null;
}

export async function listUsers(opts: { q?: string; filter?: UserFilter; page?: number }) {
  const [users, grouped, last] = await Promise.all([
    prisma.user.findMany({
      select: { id: true, username: true, displayName: true, role: true, disabledAt: true, createdAt: true },
      orderBy: { createdAt: "desc" },
    }),
    prisma.article.groupBy({ by: ["authorId", "status"], _count: { _all: true } }),
    prisma.article.groupBy({ by: ["authorId"], _max: { createdAt: true } }),
  ]);

  const stats = new Map<string, UserListItem["articles"]>();
  for (const g of grouped) {
    if (!g.authorId) continue;
    const s = stats.get(g.authorId) ?? { total: 0, published: 0, pending: 0, draft: 0, rejected: 0 };
    s.total += g._count._all;
    if (g.status in s) s[g.status as keyof typeof s] += g._count._all;
    stats.set(g.authorId, s);
  }
  const lastAt = new Map(last.map((l) => [l.authorId, l._max.createdAt]));

  // Tìm cả username lẫn tên hiển thị, không phân biệt dấu.
  const q = foldVietnamese(opts.q ?? "").trim();
  const matches = users.filter(
    (u) => !q || foldVietnamese(`${u.username} ${u.displayName}`).includes(q),
  );

  const counts: Record<UserFilter, number> = { all: matches.length, contributor: 0, admin: 0, locked: 0 };
  for (const u of matches) {
    if (u.disabledAt) counts.locked++;
    if (u.role === "admin") counts.admin++;
    else counts.contributor++;
  }

  const filter = opts.filter ?? "all";
  const inTab = matches.filter((u) =>
    filter === "all" ? true : filter === "locked" ? !!u.disabledAt : u.role === filter,
  );
  const total = inTab.length;
  const totalPages = Math.max(1, Math.ceil(total / PER_PAGE));
  const page = Math.min(Math.max(opts.page ?? 1, 1), totalPages);

  const items: UserListItem[] = inTab.slice((page - 1) * PER_PAGE, page * PER_PAGE).map((u) => ({
    id: u.id,
    username: u.username,
    displayName: u.displayName,
    role: u.role as Role,
    disabledAt: u.disabledAt?.toISOString() ?? null,
    createdAt: u.createdAt.toISOString(),
    articles: stats.get(u.id) ?? { total: 0, published: 0, pending: 0, draft: 0, rejected: 0 },
    lastArticleAt: lastAt.get(u.id)?.toISOString() ?? null,
  }));

  return { items, total, page, perPage: PER_PAGE, counts };
}

export async function getUserDetail(id: string) {
  const user = await prisma.user.findUnique({
    where: { id },
    select: { id: true, username: true, displayName: true, role: true, disabledAt: true, createdAt: true },
  });
  if (!user) return null;
  const articles = await prisma.article.findMany({
    where: { authorId: id },
    select: {
      id: true,
      slug: true,
      title: true,
      status: true,
      category: true,
      publishedAt: true,
      submittedAt: true,
      createdAt: true,
      updatedAt: true,
    },
    orderBy: { createdAt: "desc" },
  });
  return {
    ...user,
    disabledAt: user.disabledAt?.toISOString() ?? null,
    createdAt: user.createdAt.toISOString(),
    articles: articles.map((a) => ({
      ...a,
      submittedAt: a.submittedAt?.toISOString() ?? null,
      createdAt: a.createdAt.toISOString(),
      updatedAt: a.updatedAt.toISOString(),
    })),
  };
}

/** Không để hệ thống rơi vào cảnh không còn admin nào dùng được. */
async function assertAnotherActiveAdmin(exceptId: string) {
  const others = await prisma.user.count({
    where: { role: "admin", disabledAt: null, id: { not: exceptId } },
  });
  if (!others) throw new Error("This is the last active admin; that would lock everyone out");
}

export async function setUserLocked(actorId: string, id: string, locked: boolean) {
  if (actorId === id) throw new Error("You can’t lock your own account");
  const user = await prisma.user.findUnique({ where: { id } });
  if (!user) throw new Error("User not found");
  if (locked && user.role === "admin") await assertAnotherActiveAdmin(id);
  await prisma.user.update({ where: { id }, data: { disabledAt: locked ? new Date() : null } });
}

export async function setUserRole(actorId: string, id: string, role: Role) {
  if (role !== "admin" && role !== "contributor") throw new Error("Unknown role");
  if (actorId === id) throw new Error("You can’t change your own role");
  const user = await prisma.user.findUnique({ where: { id } });
  if (!user) throw new Error("User not found");
  if (user.role === "admin" && role !== "admin") await assertAnotherActiveAdmin(id);
  await prisma.user.update({ where: { id }, data: { role } });
}

/** Đặt mật khẩu tạm và trả về để admin gửi cho người dùng; chỉ hiện một lần. */
export async function resetUserPassword(id: string) {
  const user = await prisma.user.findUnique({ where: { id }, select: { id: true } });
  if (!user) throw new Error("User not found");
  const password = crypto.randomBytes(9).toString("base64url");
  if (!(await changePassword(id, password))) throw new Error("Could not reset the password");
  return password;
}
