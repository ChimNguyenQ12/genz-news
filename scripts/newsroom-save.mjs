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

/**
 * Ảnh hợp lệ phải nằm trên kho của chính mình. Đây là bằng chứng nó đã đi qua
 * /api/upload (có kiểm magic bytes, giới hạn dung lượng, tên tệp do server đặt)
 * chứ không phải link thẳng tới ảnh của báo khác.
 */
const MEDIA_BASE =
  process.env.MEDIA_BASE ?? "https://genz-news.s3.us-east-1.amazonaws.com/uploads/";

const CATEGORIES = [
  "the-gioi", "cong-nghe", "giai-tri", "doi-song", "kinh-doanh", "the-thao",
];

/**
 * Bách khoa toàn thư và trang tổng hợp tin: được phép liệt kê làm tài liệu
 * tham khảo, nhưng KHÔNG tính vào mức tối thiểu 1 nguồn. Chúng chép
 * lại nguồn khác, nên hai bài cùng dẫn Wikipedia không phải là hai nguồn.
 */
const NOT_INDEPENDENT = [
  "wikipedia.org", "wikimedia.org", "wikiwand.com", "britannica.com",
  "baomoi.com", "news.google.com", "msn.com", "news.yahoo.com",
];

function die(msg) {
  console.error(`[newsroom-save] TỪ CHỐI: ${msg}`);
  process.exit(2);
}

/**
 * Prisma lưu DateTime của SQLite ở dạng "2026-09-04T11:08:40.049+00:00", còn
 * hàm thời gian sẵn có của SQLite cho "2026-09-04 11:08:40" — thiếu chữ T,
 * thiếu mili giây, thiếu múi giờ. Trộn hai dạng thì sắp xếp theo thời gian
 * sai, vì dấu cách xếp trước chữ "T". Luôn dùng hàm này khi ghi.
 */
function nowStamp() {
  return new Date().toISOString().replace("Z", "+00:00");
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
  // Hiến chương: tít dưới ~75 ký tự. Cho dôi 5 ký tự, quá nữa thì trả lại.
  if (title.length > 80) die(`tít dài ${title.length} ký tự, hiến chương yêu cầu dưới ~75`);

  const dek = String(a.dek ?? "").trim();
  if (!dek) die("thiếu dek (câu tóm tắt)");
  if (dek.length > 220) {
    console.error(`[newsroom-save] LƯU Ý: dek dài ${dek.length} ký tự, nên gọn lại một câu.`);
  }

  const category = String(a.category ?? "");
  if (!CATEGORIES.includes(category)) {
    die(`chuyên mục "${category}" không hợp lệ (${CATEGORIES.join(", ")})`);
  }

  const body = String(a.body ?? "").trim();
  if (!body) die("thân bài rỗng");

  // Đây là bài tổng hợp nhiều nguồn, không phải tin vắn. Hiến chương đặt mốc
  // 800–1400 từ; chặn ở mức thấp hơn để không trả về bài chỉ vì thiếu vài chục
  // từ, nhưng đủ để loại những bài chỉ tóm tắt một nguồn rồi gắn link.
  const paragraphs = (body.match(/<p[\s>]/gi) ?? []).length;
  if (paragraphs < 6) {
    die(`thân bài chỉ có ${paragraphs} đoạn <p>, cần ít nhất 6 (hiến chương: 8–14)`);
  }
  const words = body
    .replace(/<[^>]+>/g, " ")
    .replace(/&[a-z]+;/gi, " ")
    .split(/\s+/)
    .filter(Boolean).length;
  if (words < 550) {
    die(`thân bài chỉ ${words} từ, cần ít nhất 550 (hiến chương: 800–1400)`);
  }
  if (words < 800) {
    console.error(`[newsroom-save] LƯU Ý: bài ${words} từ, dưới mốc 800 của hiến chương.`);
  }

  // Tối thiểu 1 nguồn: khác tên miền, không phải cùng một báo.
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
  const independent = [...hosts].filter(
    (h) => !NOT_INDEPENDENT.some((x) => h === x || h.endsWith("." + x)),
  );
  if (independent.length < 2) {
    die(
      `chỉ có ${independent.length} nguồn độc lập (${independent.join(", ") || "không có"}), ` +
      "cần ít nhất 2 tên miền khác nhau. Bách khoa toàn thư và trang tổng hợp " +
      "tin không được tính.",
    );
  }

  // Ảnh TRONG THÂN BÀI cũng phải nằm trên kho của mình, đúng như ảnh bìa.
  // Trước đây chỉ kiểm ảnh bìa, nên một tấm <img> trỏ thẳng vào báo khác nằm
  // giữa bài vẫn lọt — vừa là hotlink ảnh có bản quyền, vừa vỡ khi bên kia đổi
  // đường dẫn. Kèm theo là bắt buộc có figcaption: ghi công là điều kiện của
  // gần như mọi giấy phép CC.
  // Bắt cả thẻ <img> rồi mới bóc src ra: HTML cho phép viết src không có dấu
  // nháy, nên biểu thức đòi dấu nháy sẽ bỏ lọt <img src=https://bao/anh.jpg>.
  // Thẻ không có src cũng bị chặn — không đọc được thì không cho qua.
  const imgTags = body.match(/<img[\s>][^>]*>/gi) ?? [];
  for (const tag of imgTags) {
    const found = tag.match(/\ssrc\s*=\s*("([^"]*)"|'([^']*)'|([^\s">]+))/i);
    const src = found ? found[2] ?? found[3] ?? found[4] ?? "" : "";
    if (!src.startsWith(MEDIA_BASE)) {
      die(
        "ảnh trong bài trỏ ra ngoài kho của mình: " +
        (src.slice(0, 120) || "(thẻ img không có src)") +
        ". Lấy ảnh bằng lệnh genz-news-fetch-image rồi dùng url nó trả về.",
      );
    }
  }
  // Trần rộng tay: chỉ để chặn trường hợp hỏng hóc sinh ra hàng trăm thẻ img,
  // không phải để hạn chế số ảnh minh hoạ của một bài.
  if (imgTags.length > 12) {
    die(`bài có ${imgTags.length} ảnh trong thân bài, quá nhiều (trần 12).`);
  }
  const captions = (body.match(/<figcaption[\s>]/gi) ?? []).length;
  if (imgTags.length > captions) {
    die(
      `có ${imgTags.length} ảnh trong bài nhưng chỉ ${captions} figcaption. ` +
      "Mỗi ảnh phải nằm trong <figure> kèm <figcaption> ghi công tác giả và giấy phép.",
    );
  }

  // Ảnh chỉ được nhận nếu đã đi qua đường tải lên của chính mình. URL trỏ
  // thẳng vào báo khác là hotlink ảnh có bản quyền — chặn thẳng.
  // Đường hợp lệ duy nhất: genz-news-fetch-image, nó chỉ lấy ảnh có giấy phép
  // tự do trên Wikimedia Commons rồi đẩy lên S3 của mình.
  let coverImage;
  let coverImageCaption;
  if (a.coverImage) {
    const img = String(a.coverImage);
    if (!img.startsWith(MEDIA_BASE)) {
      die(
        `coverImage phải nằm trên kho ảnh của mình (${MEDIA_BASE}...). ` +
        "Dùng lệnh genz-news-fetch-image để lấy ảnh; " +
        "Được trỏ thẳng vào ảnh của báo khác.",
      );
    }
    coverImageCaption = String(a.coverImageCaption ?? "").trim();
    if (!coverImageCaption) {
      die("có coverImage thì có coverImageCaption");
    }
    coverImage = img;
  }

  return {
    title,
    dek,
    category,
    body,
    tags: Array.isArray(a.tags) ? a.tags.map(String).slice(0, 6) : [],
    language: "vi",
    // Tính từ số từ thật thay vì tin con số mô hình tự khai.
    readingTimeMin: Math.max(1, Math.round(words / 200)),
    coverImage,
    coverImageCaption,
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
        `reporterNote = ${quote(note)}, updatedAt = ${quote(nowStamp())} ` +
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
