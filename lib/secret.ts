import crypto from "crypto";
import fs from "fs";
import path from "path";

/**
 * Khoá ký phiên đăng nhập.
 *
 * Ưu tiên biến môi trường; không có thì tự sinh một lần rồi cất vào thư mục
 * data (đã được bind mount và nằm ngoài thư mục checkout). Nhờ vậy lần deploy
 * đầu không bao giờ chết vì quên đặt biến, mà cũng không dùng khoá mặc định
 * ai cũng đoán được.
 *
 * Chỉ đặt tay khi cần xoay khoá, hoặc chạy nhiều instance không chung ổ đĩa.
 */
function loadSecret(): string {
  const fromEnv = process.env.ADMIN_SESSION_SECRET;
  if (fromEnv && fromEnv.length >= 16) return fromEnv;

  const dir = process.env.DATA_DIR ?? path.join(process.cwd(), "data");
  const file = path.join(dir, "session-secret");

  try {
    const existing = fs.readFileSync(file, "utf8").trim();
    if (existing.length >= 32) return existing;
  } catch {
    // chưa có thì sinh mới bên dưới
  }

  const generated = crypto.randomBytes(48).toString("hex");
  try {
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(file, generated, { mode: 0o600 });
  } catch (err) {
    // Không ghi được thì vẫn chạy, chỉ là khởi động lại sẽ đăng xuất hết.
    console.warn("[secret] không ghi được khoá phiên, dùng khoá tạm:", err);
  }
  return generated;
}

export const SESSION_SECRET = loadSecret();
