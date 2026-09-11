/**
 * Gỡ ảnh kho tư liệu ra khỏi bài đã có ảnh báo chí.
 *
 *   node scripts/drop-archive-images.mjs --id=<id> [--dry-run]
 *   node scripts/drop-archive-images.mjs --id=<id> --cover   # thay cả ảnh bìa
 *
 * Ảnh Wikimedia/Openverse chỉ là ảnh minh hoạ — đúng chủ đề nhưng không phải
 * ảnh của vụ việc. Khi bài đã có ảnh của chính các nguồn nó dẫn thì giữ lại
 * ảnh minh hoạ chỉ làm người đọc hiểu sai: họ mặc định ảnh trong bài là ảnh
 * chụp chuyện đang kể.
 *
 * Chỉ gỡ đúng những <figure> có ghi "qua Wikimedia Commons" hoặc "Openverse"
 * trong figcaption. Chữ nghĩa của bài không đụng tới.
 */
import crypto from "crypto";
import fs from "fs";
import path from "path";
import { execFileSync } from "child_process";

const APP_URL = process.env.APP_URL ?? "http://127.0.0.1:5006";
const DATA_DIR = process.env.DATA_DIR ?? "/srv/genz-news/data";
const DB = process.env.DATABASE_PATH ?? path.join(DATA_DIR, "app.db");

const arg = (name) => {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : "";
};
const has = (name) => process.argv.includes(`--${name}`);

const ARCHIVE = /Wikimedia Commons|Openverse/i;

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

async function main() {
  const id = arg("id");
  if (!id) throw new Error("thiếu --id=<id bài viết>");
  const dryRun = has("dry-run");
  const alsoCover = has("cover");

  const cookie = adminCookie();
  const res = await fetch(`${APP_URL}/api/articles/${id}`, { headers: { Cookie: cookie } });
  if (!res.ok) throw new Error(`đọc bài hỏng (${res.status})`);
  const { article } = await res.json();

  console.log(`=== ${article.title}`);

  const figures = article.body.match(/<figure>[\s\S]*?<\/figure>/gi) ?? [];
  const archive = figures.filter((f) => ARCHIVE.test(f));
  const press = figures.filter((f) => !ARCHIVE.test(f));

  console.log(`    ${figures.length} ảnh: ${press.length} của báo, ${archive.length} ảnh kho`);

  if (!press.length) {
    console.log("    → bài chưa có ảnh báo chí nào, giữ nguyên ảnh kho.");
    return;
  }

  const patch = {};
  let body = article.body;

  for (const figure of archive) {
    const caption = figure.match(/<figcaption>([^<]*)/)?.[1] ?? "";
    console.log(`    gỡ: ${caption.slice(0, 70)}`);
    body = body.replace(figure, "");
  }

  // Ảnh bìa cũng là ảnh kho thì đôn tấm ảnh báo đầu tiên lên thay, và gỡ nó
  // khỏi thân bài để cùng một tấm không hiện hai lần.
  if (alsoCover && ARCHIVE.test(article.coverImageCaption ?? "")) {
    const first = press[0];
    const src = first.match(/<img[^>]*src="([^"]+)"/i)?.[1];
    const caption = first.match(/<figcaption>([\s\S]*?)<\/figcaption>/i)?.[1] ?? "";
    if (src) {
      // coverImageCaption là chữ thuần, không chứa thẻ. Bỏ cả cụm "(nguồn)"
      // đi kèm link — bóc thẻ <a> mà giữ lại chữ thì còn mỗi hai chữ trong
      // ngoặc, chẳng trỏ đi đâu cả.
      patch.coverImage = src;
      patch.coverImageCaption = caption
        .replace(/\s*\(\s*<a[^>]*>[\s\S]*?<\/a>\s*\)\s*/gi, "")
        .replace(/<[^>]+>/g, "")
        .trim();
      body = body.replace(first, "");
      console.log(`    ảnh bìa mới: ${patch.coverImageCaption}`);
      console.log(`    bìa cũ bỏ đi: ${(article.coverImageCaption ?? "").slice(0, 70)}`);
    }
  }

  if (body === article.body && !patch.coverImage) {
    console.log("    → không có gì để đổi.");
    return;
  }
  patch.body = body;

  if (dryRun) {
    console.log("    → (dry-run) không ghi gì.");
    return;
  }

  const put = await fetch(`${APP_URL}/api/articles/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", Cookie: cookie },
    body: JSON.stringify(patch),
    signal: AbortSignal.timeout(120000),
  });
  if (!put.ok) {
    console.log(`    → GHI HỎNG (${put.status}): ${(await put.text()).slice(0, 200)}`);
    return;
  }
  const { article: saved } = await put.json();
  const left = (saved.body.match(/<img[\s>]/gi) ?? []).length;
  console.log(`    → xong, còn ${left} ảnh trong bài.`);
}

// Node giữ kết nối keep-alive sau lượt fetch cuối nên vòng lặp sự kiện không
// rỗng: lệnh làm xong việc mà tiến trình vẫn treo. Thoát tường minh.
main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("[drop-archive-images]", err.message);
    process.exit(1);
  });
