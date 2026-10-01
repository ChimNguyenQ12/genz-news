import fs from "fs";
import path from "path";

/**
 * Phiên đăng nhập threads.com dùng cho bước research của collect-trends
 * (scripts/lib/threads-search.mjs đọc trang tìm kiếm bằng cookie này).
 *
 * Lưu ở data/threads-session.json — cùng chỗ với threads-token.json và
 * session-secret, nằm ngoài thư mục checkout, quyền 600. Script collect-trends
 * chạy trên host đọc thẳng tệp này (scripts/lib/threads-session.mjs), nên định
 * dạng phải giữ khớp ở hai nơi.
 *
 * CHỈ lưu cookie, KHÔNG BAO GIỜ lưu mật khẩu: mật khẩu chỉ nằm trong bộ nhớ
 * suốt một lượt đăng nhập (lib/threadsLogin.ts) rồi bỏ.
 */

export interface StoredCookie {
  name: string;
  value: string;
  domain: string;
  path?: string;
  expires?: number;
}

export interface ThreadsSessionFile {
  username: string;
  cookies: StoredCookie[];
  savedAt: string;
  /** "login" = đăng nhập qua form; "cookie" = dán cookie tay. */
  method: "login" | "cookie";
  /** Lần kiểm tra gần nhất (nút "Kiểm tra" hoặc lượt collect-trends). */
  lastCheck?: { at: string; ok: boolean; message: string };
}

export interface ThreadsSessionStatus {
  connected: boolean;
  username?: string;
  savedAt?: string;
  method?: "login" | "cookie";
  /** Ngày cookie sessionid hết hạn theo chính Threads, nếu biết. */
  expiresAt?: string;
  lastCheck?: { at: string; ok: boolean; message: string };
}

const FILE = path.join(
  process.env.DATA_DIR ?? path.join(process.cwd(), "data"),
  "threads-session.json",
);

export function readThreadsSession(): ThreadsSessionFile | null {
  try {
    const data = JSON.parse(fs.readFileSync(FILE, "utf8")) as ThreadsSessionFile;
    return Array.isArray(data.cookies) && data.cookies.length ? data : null;
  } catch {
    return null;
  }
}

export function writeThreadsSession(data: ThreadsSessionFile) {
  fs.mkdirSync(path.dirname(FILE), { recursive: true });
  // Ghi ra tệp tạm rồi đổi tên: collect-trends có thể đang đọc đúng lúc này.
  const tmp = `${FILE}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), { mode: 0o600 });
  fs.renameSync(tmp, FILE);
}

export function clearThreadsSession() {
  try {
    fs.unlinkSync(FILE);
  } catch {
    // chưa có thì thôi
  }
}

export function recordThreadsCheck(ok: boolean, message: string) {
  const s = readThreadsSession();
  if (!s) return;
  writeThreadsSession({ ...s, lastCheck: { at: new Date().toISOString(), ok, message } });
}

/** Chuỗi header Cookie gửi kèm request tới threads.com. */
export function cookieHeader(s: ThreadsSessionFile): string {
  return s.cookies.map((c) => `${c.name}=${c.value}`).join("; ");
}

export function threadsSessionStatus(): ThreadsSessionStatus {
  const s = readThreadsSession();
  if (!s) return { connected: false };
  const sid = s.cookies.find((c) => c.name === "sessionid");
  return {
    connected: true,
    username: s.username,
    savedAt: s.savedAt,
    method: s.method,
    expiresAt: sid?.expires && sid.expires > 0 ? new Date(sid.expires * 1000).toISOString() : undefined,
    lastCheck: s.lastCheck,
  };
}

/**
 * Đọc chuỗi cookie dán tay ("sessionid=…; csrftoken=…" — copy từ DevTools).
 * Chấp nhận cả một giá trị sessionid trơn. Trả null nếu không có sessionid.
 */
export function parseCookieString(raw: string): StoredCookie[] | null {
  const text = raw.trim().replace(/^cookie:\s*/i, "");
  if (!text) return null;
  const cookies: StoredCookie[] = [];
  if (!text.includes("=")) {
    cookies.push({ name: "sessionid", value: text, domain: ".threads.com" });
  } else {
    for (const part of text.split(";")) {
      const i = part.indexOf("=");
      if (i <= 0) continue;
      const name = part.slice(0, i).trim();
      const value = part.slice(i + 1).trim();
      if (!/^[\w.-]+$/.test(name) || !value || /[\r\n]/.test(value)) continue;
      cookies.push({ name, value, domain: ".threads.com" });
    }
  }
  return cookies.some((c) => c.name === "sessionid") ? cookies : null;
}
