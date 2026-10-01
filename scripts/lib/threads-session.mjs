/**
 * Đọc/ghi phiên threads.com mà admin đã đăng nhập ở /admin/threads.
 * Bản cho script chạy bằng Node thuần — định dạng phải khớp lib/threadsSession.ts.
 */
import fs from "fs";
import path from "path";

export function sessionFile(dataDir) {
  return path.join(dataDir, "threads-session.json");
}

export function readSession(dataDir) {
  try {
    const s = JSON.parse(fs.readFileSync(sessionFile(dataDir), "utf8"));
    return Array.isArray(s.cookies) && s.cookies.length ? s : null;
  } catch {
    return null;
  }
}

export function cookieHeader(s) {
  return s.cookies.map((c) => `${c.name}=${c.value}`).join("; ");
}

/** Ghi kết quả lần dùng gần nhất để màn hình admin hiện "còn dùng được không". */
export function recordCheck(dataDir, ok, message) {
  const s = readSession(dataDir);
  if (!s) return;
  const file = sessionFile(dataDir);
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(
    tmp,
    JSON.stringify({ ...s, lastCheck: { at: new Date().toISOString(), ok, message } }, null, 2),
    { mode: 0o600 },
  );
  // Tệp do app trong container (user node, uid 1000) tạo. Cron trên host hay
  // chạy bằng root: ghi đè mà không trả lại chủ cũ thì tệp thành của root,
  // quyền 600, và app không đọc được phiên nữa.
  try {
    const st = fs.statSync(file);
    fs.chownSync(tmp, st.uid, st.gid);
  } catch {
    // không phải root thì không đổi chủ được — khi đó tệp vốn đã cùng chủ
  }
  fs.renameSync(tmp, file);
}
