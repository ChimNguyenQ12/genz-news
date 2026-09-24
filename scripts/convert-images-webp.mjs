/**
 * Chuyển ảnh cũ trên kho S3 sang WebP (tối đa 1600px) và trỏ bài viết sang.
 *
 *   sudo node scripts/convert-images-webp.mjs --dry-run   # chỉ đếm
 *   sudo node scripts/convert-images-webp.mjs --limit=3   # thử vài ảnh trước
 *   sudo node scripts/convert-images-webp.mjs             # làm thật
 *
 * Chạy trên máy chủ. Ảnh upload mới đã tự thành WebP (lib/image.ts); lệnh này
 * làm cùng việc đó cho những ảnh có từ trước.
 *
 * Ba bước, mỗi bước làm lại được:
 *   1. Gom mọi ảnh trên kho mà bài viết đang dùng (ảnh bìa + <img> trong bài).
 *   2. Chuyển từng ảnh trong container app (scripts/lib/webp-job.mjs), đẩy
 *      lên S3 với TÊN MỚI. Ảnh gốc giữ nguyên. Kết quả nối vào
 *      data/webp-map.jsonl; chạy lại thì ảnh đã có trong đó được bỏ qua.
 *   3. Sao lưu DB, rồi thay URL cũ → mới trong một transaction.
 *
 * Quay lại: data/webp-map.jsonl có đủ cặp cũ/mới, và bản sao lưu DB ở
 * /root/app.db.before-webp-*.bak.
 */
import fs from "fs";
import path from "path";
import { execFileSync } from "child_process";

const DATA_DIR = process.env.DATA_DIR ?? "/srv/genz-news/data";
const DB = process.env.DATABASE_PATH ?? path.join(DATA_DIR, "app.db");
const CONTAINER = process.env.CONTAINER ?? "genz-news";
const BASE =
  process.env.MEDIA_ORIGIN ?? "https://genz-news.s3.us-east-1.amazonaws.com/";
const JOB = new URL("./lib/webp-job.mjs", import.meta.url);
const MAP = path.join(DATA_DIR, "webp-map.jsonl");
const KEYS = path.join(DATA_DIR, "webp-keys.json");

const dryRun = process.argv.includes("--dry-run");
const limitArg = process.argv.find((a) => a.startsWith("--limit="));
const limit = limitArg ? Number(limitArg.slice("--limit=".length)) : Infinity;

function sql(query) {
  const out = execFileSync("sqlite3", ["-cmd", ".timeout 5000", "-json", DB, query], {
    encoding: "utf8",
    maxBuffer: 256 * 1024 * 1024,
  }).trim();
  return out ? JSON.parse(out) : [];
}

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
// GIF bỏ qua: gần như luôn là ảnh động.
const RASTER = String.raw`uploads/[^"'\s<>?#]+\.(?:jpe?g|png|webp|avif)`;
const COVER = new RegExp(`^${escapeRe(BASE)}(${RASTER})$`, "i");
const IMG_SRC = new RegExp(`<img\\b[^>]*?\\bsrc="${escapeRe(BASE)}(${RASTER})"`, "gi");

function readMap() {
  if (!fs.existsSync(MAP)) return new Map();
  const map = new Map();
  for (const line of fs.readFileSync(MAP, "utf8").split("\n")) {
    if (!line.trim()) continue;
    const rec = JSON.parse(line);
    map.set(rec.old, rec); // bản ghi sau đè bản trước (lần chạy lại sau lỗi)
  }
  return map;
}

// ---------- 1. gom ảnh đang dùng ----------
const rows = sql("SELECT id, coverImage, body FROM articles;");
const used = new Set();
for (const r of rows) {
  const cover = r.coverImage && COVER.exec(r.coverImage);
  if (cover) used.add(cover[1]);
  for (const m of (r.body ?? "").matchAll(IMG_SRC)) used.add(m[1]);
}

let map = readMap();
const pending = [...used].filter((k) => !map.get(k) || map.get(k).error).slice(0, limit);
console.log(
  `${rows.length} bài, ${used.size} ảnh đang dùng; ` +
    `${[...used].filter((k) => map.get(k) && !map.get(k).error).length} đã xử lý từ trước, ` +
    `lượt này chuyển ${pending.length}.`,
);
if (dryRun) process.exit(0);

// ---------- 2. chuyển trong container ----------
if (pending.length) {
  fs.writeFileSync(KEYS, JSON.stringify(pending));
  fs.copyFileSync(JOB, path.join(DATA_DIR, "webp-job.mjs"));
  // Container chạy bằng uid 1000; nó phải ghi được tệp kết quả.
  for (const f of [KEYS, path.join(DATA_DIR, "webp-job.mjs"), MAP]) {
    if (!fs.existsSync(f)) fs.writeFileSync(f, "");
    fs.chownSync(f, 1000, 1000);
  }
  try {
    execFileSync("docker", ["exec", "-w", "/app", CONTAINER, "node", "/app/data/webp-job.mjs"], {
      stdio: "inherit",
    });
  } finally {
    fs.rmSync(KEYS, { force: true });
    fs.rmSync(path.join(DATA_DIR, "webp-job.mjs"), { force: true });
  }
  map = readMap();
}

// ---------- 3. trỏ bài viết sang ảnh mới ----------
const converted = [...used].map((k) => map.get(k)).filter((r) => r?.new);
const skipped = [...used].map((k) => map.get(k)).filter((r) => r?.skip);
const failed = [...used].map((k) => map.get(k)).filter((r) => r?.error);
const notYet = [...used].filter((k) => !map.get(k)).length;

if (!converted.length) {
  console.log("Không có ảnh nào để trỏ sang.");
  process.exit(failed.length ? 1 : 0);
}

const stamp = new Date().toISOString().replace(/\D/g, "").slice(0, 12);
const backup = `/root/app.db.before-webp-${stamp}.bak`;
execFileSync("sqlite3", [DB, `.backup '${backup}'`]);
console.log(`Đã sao lưu DB: ${backup}`);

// URL chỉ gồm chữ, số, / . - _ nên không có dấu nháy để thoát; vẫn kiểm cho chắc.
const q = (s) => {
  if (s.includes("'")) throw new Error(`URL có dấu nháy: ${s}`);
  return `'${s}'`;
};
const statements = ["BEGIN;"];
for (const r of converted) {
  const from = q(BASE + r.old);
  const to = q(BASE + r.new);
  statements.push(`UPDATE articles SET coverImage = ${to} WHERE coverImage = ${from};`);
  statements.push(
    `UPDATE articles SET body = replace(body, ${from}, ${to}) WHERE instr(body, ${from}) > 0;`,
  );
}
statements.push("COMMIT;");
// -bail: một câu lỗi là dừng, transaction chưa COMMIT thì tự huỷ.
execFileSync("sqlite3", ["-bail", "-cmd", ".timeout 5000", DB], { input: statements.join("\n") });

// ---------- báo cáo ----------
const before = converted.reduce((s, r) => s + r.before, 0);
const after = converted.reduce((s, r) => s + r.after, 0);
const oldUrls = converted.map((r) => BASE + r.old);
const left = sql("SELECT coverImage, body FROM articles;").filter((r) =>
  oldUrls.some((u) => r.coverImage === u || (r.body ?? "").includes(u)),
).length;

console.log(
  `\nĐã chuyển ${converted.length} ảnh: ${(before / 1048576).toFixed(1)}MB → ` +
    `${(after / 1048576).toFixed(1)}MB (-${Math.round(100 - (100 * after) / before)}%).`,
);
console.log(`Giữ nguyên ${skipped.length} ảnh (${[...new Set(skipped.map((r) => r.skip))].join(", ") || "—"}).`);
console.log(`Lỗi ${failed.length} ảnh.`);
for (const r of failed) console.log(`  ${r.old}: ${r.error}`);
if (notYet) console.log(`Chưa tới lượt: ${notYet} ảnh (chạy lại lệnh để làm tiếp).`);
console.log(`Bài còn trỏ URL cũ của ảnh đã chuyển: ${left} (phải là 0).`);
