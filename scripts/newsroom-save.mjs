/**
 * Lưu bài do phóng viên AI viết.
 *
 *   node scripts/newsroom-save.mjs bai.json
 *   cat bai.json | node scripts/newsroom-save.mjs
 *
 * KHÔNG phụ thuộc gói ngoài nào: fetch có sẵn từ Node 18, phần đụng cơ sở dữ
 * liệu gọi lệnh sqlite3 của máy chủ.
 *
 * Bài đi qua HTTP API của app chứ không ghi thẳng vào cơ sở dữ liệu: như vậy
 * nó phải qua đúng bộ làm sạch HTML và đúng lớp phân quyền mà người thật cũng
 * phải qua. Hai đường ghi khác nhau là hai đường sẽ lệch nhau.
 *
 * Bot đăng nhập bằng tài khoản THƯỜNG (contributor), không phải admin. API chỉ
 * cho tài khoản thường đặt "draft" hoặc "pending" — nên kể cả khi bị chèn lệnh
 * từ trang web mà nó đọc, nó vẫn không thể tự đăng bài. Người vẫn bấm nút cuối.
 *
 * Biến môi trường: APP_URL, NEWSROOM_USER, NEWSROOM_PASS, DATABASE_PATH,
 *                  NEWSROOM_REQUEST_ID
 */
import { execFileSync } from "child_process";
import fs from "fs/promises";
import path from "path";

const APP_URL = process.env.APP_URL ?? "http://127.0.0.1:5006";
const USER = process.env.NEWSROOM_USER ?? "";
const PASS = process.env.NEWSROOM_PASS ?? "";
const DATA_DIR = process.env.DATA_DIR ?? path.join(process.cwd(), "data");
const DB = process.env.DATABASE_PATH ?? path.join(DATA_DIR, "app.db");

const CATEGORIES = [
  "the-gioi", "cong-nghe", "giai-tri", "doi-song", "kinh-doanh", "the-thao",
];

function die(msg) {
  console.error(`[newsroom-save] TỪ CHỐI: ${msg}`);
  process.exit(2);
}

const quote = (s) => "'" + String(s).replace(/'/g, "''") + "'";

/**
 * Nhận JSON theo hai lối: đối số là đường dẫn tệp, hoặc stdin.
 * Có lối "tệp" vì danh sách công cụ cho phép của Claude kiểm TỪNG VẾ của ống
 * dẫn — dùng tệp thì khỏi phải mở quyền cho cả "echo" lẫn lệnh này.
 */
async function readInput() {
  const file = process.argv[2];
  let raw;
  if (file) {
    raw = await fs.readFile(file, "utf8");
  } else {
    const chunks = [];
    for await (const c of process.stdin) chunks.push(c);
    raw = Buffer.concat(chunks).toString("utf8");
  }
  // Bỏ BOM: vài shell chèn vào đầu khi pipe, JSON.parse sẽ chết vì nó.
  return raw.replace(/^\uFEFF/, "");
}

/** Những quy tắc trong hiến chương mà máy không được phép bỏ qua. */
function validate(a) {
  if (!a || typeof a !== "object") die("dữ liệu vào không phải JSON hợp lệ");

  const title = String(a.title ?? "").trim();
  if (!title) die("thiếu tiêu đề");
  if (title.length > 90) die(`tít dài ${title.length} ký tự, hiến chương yêu cầu dưới ~75`);

  if (!String(a.dek ?? "").trim()) die("thiếu dek (câu tóm tắt)");

  const category = String(a.category ?? "");
  if (!CATEGORIES.includes(category)) {
    die(`chuyên mục "${category}" không hợp lệ (${CATEGORIES.join(", ")})`);
  }

  const body = String(a.body ?? "").trim();
  if (!body) die("thân bài rỗng");
  const paragraphs = (body.match(/<p[\s>]/gi) ?? []).length;
  if (paragraphs < 3) die(`thân bài chỉ có ${paragraphs} đoạn <p>, cần ít nhất 3`);

  // Tối thiểu 2 nguồn ĐỘC LẬP: khác tên miền, không phải cùng một báo.
  const sources = Array.isArray(a.sources) ? a.sources : [];
  const hosts = new Set();
  for (const s of sources) {
    const url = String(s?.url ?? "");
    try {
      const u = new URL(url);
      if (u.protocol !== "http:" && u.protocol !== "https:") throw new Error();
      hosts.add(u.hostname.replace(/^www\./, ""));
    } catch {
      die(`nguồn có URL không hợp lệ: ${url || "(rỗng)"}`);
    }
  }
  if (hosts.size < 2) {
    die(
      `chỉ có ${hosts.size} nguồn độc lập (${[...hosts].join(", ") || "không có"}), ` +
        "cần ít nhất 2 tên miền khác nhau",
    );
  }

  // Ảnh của báo khác thì không lấy. Mặc định dùng gradient.
  if (a.coverImage) die("không được đặt coverImage — ảnh báo khác có bản quyền riêng");

  return {
    title,
    dek: String(a.dek).trim(),
    category,
    body,
    tags: Array.isArray(a.tags) ? a.tags.map(String).slice(0, 6) : [],
    language: a.language === "en" ? "en" : "vi",
    readingTimeMin: Number(a.readingTimeMin) || 3,
    sources: sources.map((s) => ({
      name: String(s.name ?? "Nguồn"),
      url: String(s.url),
    })),
  };
}

async function login() {
  if (!USER || !PASS) die("thiếu NEWSROOM_USER / NEWSROOM_PASS");
  const res = await fetch(`${APP_URL}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: USER, password: PASS }),
  });
  if (!res.ok) die(`đăng nhập hỏng (${res.status}) — kiểm lại tài khoản bot`);
  const cookie = (res.headers.getSetCookie?.() ?? [])
    .map((c) => c.split(";")[0])
    .join("; ");
  if (!cookie) die("đăng nhập không trả về cookie phiên");
  return cookie;
}

/** Đóng mục trong hàng đợi. Lỗi ở đây không được làm mất bài đã lưu. */
function closeRequest(requestId, article, articleId) {
  try {
    const rows = JSON.parse(
      execFileSync(
        "sqlite3",
        ["-cmd", ".timeout 5000", "-json", DB, `SELECT articleIds FROM research_requests WHERE id = ${quote(requestId)};`],
        { encoding: "utf8" },
      ).trim() || "[]",
    );
    let ids = [];
    try {
      ids = JSON.parse(rows[0]?.articleIds ?? "[]");
    } catch {
      ids = [];
    }
    const note =
      `Đã viết "${article.title}" từ ${article.sources.length} nguồn, ` +
      `đang chờ duyệt. ${new Date().toISOString()}`;
    execFileSync(
      "sqlite3",
      [
        "-cmd", ".timeout 5000",
        DB,
        "UPDATE research_requests SET status = 'done', " +
          `articleIds = ${quote(JSON.stringify([...ids, articleId]))}, ` +
          `reporterNote = ${quote(note)}, updatedAt = CURRENT_TIMESTAMP ` +
          `WHERE id = ${quote(requestId)};`,
      ],
      { encoding: "utf8" },
    );
  } catch (err) {
    console.error(`[newsroom-save] bài đã lưu nhưng không đóng được hàng đợi: ${err.message}`);
  }
}

async function main() {
  const article = validate(JSON.parse(await readInput()));
  const requestId = process.env.NEWSROOM_REQUEST_ID ?? "";
  const cookie = await login();

  // 1) Tạo bài. API luôn tạo ở trạng thái "draft", không nhận status từ ngoài.
  const created = await fetch(`${APP_URL}/api/articles`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookie },
    body: JSON.stringify(article),
  });
  if (created.status !== 201) {
    die(`tạo bài hỏng (${created.status}): ${(await created.text()).slice(0, 300)}`);
  }
  const { article: saved } = await created.json();

  // 2) Chuyển sang chờ duyệt. Tài khoản thường chỉ được tới đây, không hơn.
  const sent = await fetch(`${APP_URL}/api/articles/${saved.id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", Cookie: cookie },
    body: JSON.stringify({ status: "pending" }),
  });
  if (!sent.ok) {
    die(`gửi duyệt hỏng (${sent.status}): ${(await sent.text()).slice(0, 300)}`);
  }

  if (requestId) closeRequest(requestId, article, saved.id);

  console.log(
    JSON.stringify({ ok: true, id: saved.id, slug: saved.slug, status: "pending" }),
  );
}

main().catch((err) => {
  console.error("[newsroom-save]", err.message);
  process.exitCode = 1;
});
