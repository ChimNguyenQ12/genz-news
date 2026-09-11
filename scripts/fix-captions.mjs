/**
 * Sửa những caption ảnh còn sót mã thực thể HTML.
 *
 *   node scripts/fix-captions.mjs [--dry-run]
 *
 * Vài toà soạn khai og:site_name bằng thực thể HTML ("B&#xC1;O PH&#x1EE4; N&#x1EEE;"
 * = "BÁO PHỤ NỮ"). Trước khi lệnh lấy ảnh biết giải mã hex, cái tên hỏng đó đã
 * kịp đi vào caption của vài bài — hiện ra dưới ảnh đúng như vậy.
 *
 * Chỉ đụng vào phần chữ trong <figcaption>, không đổi ảnh, không đổi nội dung.
 * Ghi qua HTTP API như mọi đường ghi khác.
 */
import crypto from "crypto";
import fs from "fs";
import path from "path";
import { execFileSync } from "child_process";

const APP_URL = process.env.APP_URL ?? "http://127.0.0.1:5006";
const DATA_DIR = process.env.DATA_DIR ?? "/srv/genz-news/data";
const DB = process.env.DATABASE_PATH ?? path.join(DATA_DIR, "app.db");
const dryRun = process.argv.includes("--dry-run");

function sql(query) {
  const out = execFileSync("sqlite3", ["-cmd", ".timeout 5000", "-json", DB, query], {
    encoding: "utf8",
    maxBuffer: 128 * 1024 * 1024,
  }).trim();
  return out ? JSON.parse(out) : [];
}

function adminCookie() {
  const secret =
    process.env.ADMIN_SESSION_SECRET?.length >= 16
      ? process.env.ADMIN_SESSION_SECRET
      : fs.readFileSync(path.join(DATA_DIR, "session-secret"), "utf8").trim();
  const admin = sql("SELECT id FROM users WHERE role = 'admin' ORDER BY createdAt LIMIT 1;")[0];
  if (!admin) throw new Error("không tìm thấy tài khoản admin nào");
  const expiresAt = Date.now() + 60 * 60 * 1000;
  const payload = `${admin.id}.${expiresAt}`;
  const signature = crypto.createHmac("sha256", secret).update(payload).digest("hex");
  return `genz_session=${payload}.${signature}`;
}

/**
 * Giải mã thực thể, rồi mã hoá lại đúng những ký tự HTML thật sự cần.
 * Giữ nguyên thẻ <a> trong caption — đó là link ghi nguồn.
 */
function fixCaption(inner) {
  return inner.replace(/(&amp;#x[0-9a-f]+;|&amp;#\d+;|&#x[0-9a-f]+;|&#\d+;)+/gi, (run) =>
    run
      .replace(/&amp;/gi, "&")
      .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
      .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code))),
  );
}

async function main() {
  const cookie = adminCookie();
  const rows = sql("SELECT id, title, body FROM articles;");
  let touched = 0;

  for (const row of rows) {
    // Chỉ những bài có mã thực thể nằm trong figcaption mới cần sửa.
    if (!/<figcaption>[^<]*&(amp;)?#x?\d/i.test(row.body)) continue;

    const fixed = row.body.replace(
      /(<figcaption>)([\s\S]*?)(<\/figcaption>)/gi,
      (_, open, inner, close) => open + fixCaption(inner) + close,
    );
    if (fixed === row.body) continue;

    const before = row.body.match(/<figcaption>([^<]{0,80})/i)?.[1] ?? "";
    const after = fixed.match(/<figcaption>([^<]{0,80})/i)?.[1] ?? "";
    console.log(`\n=== ${row.title.slice(0, 56)}`);
    console.log(`    trước: ${before.trim()}`);
    console.log(`    sau  : ${after.trim()}`);

    if (dryRun) continue;

    const put = await fetch(`${APP_URL}/api/articles/${row.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify({ body: fixed }),
      signal: AbortSignal.timeout(120000),
    });
    console.log(put.ok ? "    → đã sửa" : `    → GHI HỎNG (${put.status})`);
    if (put.ok) touched++;
  }

  console.log(
    touched || dryRun ? `\nXong. Sửa ${touched} bài.` : "\nKhông có caption nào cần sửa.",
  );
}

main().catch((err) => {
  console.error("[fix-captions]", err.message);
  process.exitCode = 1;
});
