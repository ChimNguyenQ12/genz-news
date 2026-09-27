/**
 * Đăng các bài mạng xã hội (Facebook, Threads) đã tới giờ (lib/social/core.ts).
 *
 *   0-59/5 * * * * flock -n /var/lock/genz-news-social.lock node /srv/genz-news/repo/scripts/social-run-due.mjs >> /var/log/genz-news-social.log 2>&1
 *
 * Việc đăng nằm trong app (nó có các token, sharp để đổi ảnh sang JPEG, và
 * Prisma); script này chỉ gõ cửa /api/admin/social/run-due bằng một phiên
 * admin tự ký bằng session-secret — đúng cách các script bảo trì khác làm.
 * Không có gì tới giờ thì im lặng, để log chỉ có dòng khi thật sự đăng.
 */
import crypto from "crypto";
import fs from "fs";
import path from "path";
import { execFileSync } from "child_process";

const APP_URL = process.env.APP_URL ?? "http://127.0.0.1:5006";
const DATA_DIR = process.env.DATA_DIR ?? "/srv/genz-news/data";
const DB = process.env.DATABASE_PATH ?? path.join(DATA_DIR, "app.db");

function adminCookie() {
  const secret =
    process.env.ADMIN_SESSION_SECRET?.length >= 16
      ? process.env.ADMIN_SESSION_SECRET
      : fs.readFileSync(path.join(DATA_DIR, "session-secret"), "utf8").trim();
  const out = execFileSync(
    "sqlite3",
    ["-cmd", ".timeout 5000", DB, "SELECT id || '|' || salt FROM users WHERE role = 'admin' ORDER BY createdAt LIMIT 1;"],
    { encoding: "utf8" },
  ).trim();
  if (!out) throw new Error("không tìm thấy tài khoản admin nào");
  const [id, salt] = out.split("|");
  const payload = `${id}.${Date.now() + 10 * 60 * 1000}`;
  // Chữ ký phủ cả salt mật khẩu — khớp sign() trong lib/auth.ts.
  const signature = crypto.createHmac("sha256", secret).update(`${payload}.${salt}`).digest("hex");
  return `genz_session=${payload}.${signature}`;
}

const res = await fetch(`${APP_URL}/api/admin/social/run-due`, {
  method: "POST",
  headers: { Cookie: adminCookie() },
  signal: AbortSignal.timeout(4 * 60 * 1000),
});
const body = await res.json().catch(() => ({}));
if (!res.ok) {
  console.error(`${new Date().toISOString()} run-due hỏng (${res.status}): ${body.error ?? ""}`);
  process.exit(1);
}
for (const r of body.results ?? []) {
  console.log(`${new Date().toISOString()} ${r.articleId} ${r.outcome}`);
}
