/**
 * Bổ sung ảnh cho những bài ĐÃ ĐĂNG mà còn thiếu ảnh.
 *
 *   node scripts/backfill-images.mjs --limit=3
 *   node scripts/backfill-images.mjs --limit=3 --dry-run
 *   node scripts/backfill-images.mjs --ids=<id>,<id>
 *
 * Nguyên tắc: CHỈ THÊM, KHÔNG SỬA, KHÔNG XOÁ.
 *   - ảnh, video, nội dung sẵn có giữ nguyên từng ký tự;
 *   - ảnh bìa đã có thì không đụng tới;
 *   - chỉ chèn thêm thẻ <figure> vào giữa các đoạn còn trống.
 *
 * Ảnh lấy từ chính những nguồn mà bài đã dẫn: mỗi nguồn góp tấm ảnh của nó
 * (thẻ og:image), thiếu thì bới thêm ảnh trong thân bài nguồn. Nhờ vậy ảnh
 * luôn đúng vụ việc thay vì "cùng chủ đề".
 *
 * Ghi qua HTTP API chứ không ghi thẳng cơ sở dữ liệu — để đi đúng bộ làm sạch
 * HTML và đúng lớp phân quyền như người thật. Phiên admin được tự ký bằng khoá
 * phiên trong thư mục dữ liệu, nên không cần biết mật khẩu ai cả.
 *
 * Biến môi trường: APP_URL, DATABASE_PATH, DATA_DIR, NEWSROOM_USER/PASS
 */
import crypto from "crypto";
import fs from "fs";
import path from "path";
import { execFileSync } from "child_process";
import { fileURLToPath } from "url";

const APP_URL = process.env.APP_URL ?? "http://127.0.0.1:5006";
const DATA_DIR = process.env.DATA_DIR ?? "/srv/genz-news/data";
const DB = process.env.DATABASE_PATH ?? path.join(DATA_DIR, "app.db");
const HERE = path.dirname(fileURLToPath(import.meta.url));

/**
 * Bao nhiêu ảnh là đủ cho một bài: tối thiểu 3, nhắm 5, trần 7.
 * Bài tổng hợp 800–1400 từ mà chỉ một tấm ảnh thì đọc rất khô.
 */
const TARGET_MIN = 3;
const TARGET_AIM = 5;
const TARGET_MAX = 7;

const arg = (name, fallback = "") => {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
};
const has = (name) => process.argv.includes(`--${name}`);

function sql(query) {
  const out = execFileSync("sqlite3", ["-cmd", ".timeout 5000", "-json", DB, query], {
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  }).trim();
  return out ? JSON.parse(out) : [];
}

/**
 * Tự ký một phiên admin.
 *
 * Token = userId.expiresAt.chữ_ký, đúng công thức trong lib/auth.ts. Khoá nằm
 * ở thư mục dữ liệu dùng chung, nên script trên host ký được phiên mà app
 * trong container chấp nhận — không cần mật khẩu, không cần đổi quyền ai.
 */
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

/** Đếm ảnh và video đang có trong thân bài. */
function countMedia(body) {
  return {
    images: (body.match(/<img[\s>]/gi) ?? []).length,
    videos: (body.match(/<iframe[\s>]/gi) ?? []).length,
  };
}

const escapeHtml = (s) =>
  String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

function figureFor(image, alt) {
  const credit = image.source
    ? `${escapeHtml(image.caption)} (<a href="${escapeHtml(image.source)}">nguồn</a>)`
    : escapeHtml(image.caption);
  return (
    `<figure><img src="${escapeHtml(image.url)}" alt="${escapeHtml(alt)}">` +
    `<figcaption>${credit}</figcaption></figure>`
  );
}

/**
 * Chèn ảnh vào giữa các đoạn, rải đều.
 *
 * Chỉ chèn SAU một thẻ </p>, và tránh chỗ đã có ảnh hay video ngay cạnh —
 * hai tấm ảnh dính nhau đọc rất khó chịu. Nội dung cũ không bị đụng tới.
 */
function insertFigures(body, figures) {
  if (!figures.length) return body;

  // Vị trí kết thúc của từng đoạn văn.
  const stops = [];
  const re = /<\/p>/gi;
  let m;
  while ((m = re.exec(body)) !== null) stops.push(m.index + m[0].length);
  if (stops.length < 2) return body + figures.join("");

  // Bỏ đoạn cuối: ảnh nằm sau đoạn kết trông như bị rơi ra ngoài bài.
  const usable = stops.slice(1, -1);
  if (!usable.length) return body + figures.join("");

  const step = Math.max(1, Math.floor(usable.length / figures.length));
  const chosen = [];
  for (let i = 0; i < figures.length && i * step < usable.length; i++) {
    const at = usable[i * step];
    // Ngay sau chỗ này đã là ảnh/video sẵn có thì đẩy xuống đoạn kế tiếp.
    const after = body.slice(at, at + 40);
    if (/<figure|<div data-youtube-video|<iframe/i.test(after)) {
      const next = usable[i * step + 1];
      chosen.push(next ?? at);
    } else {
      chosen.push(at);
    }
  }

  // Chèn từ cuối lên đầu để các vị trí phía trước không bị lệch.
  let out = body;
  for (let i = chosen.length - 1; i >= 0; i--) {
    out = out.slice(0, chosen[i]) + figures[i] + out.slice(chosen[i]);
  }
  return out;
}

/** Gọi lệnh lấy ảnh cho một URL bài báo. Trả về mảng {url, caption, source}. */
function imagesFromSource(url, { deep }) {
  try {
    const out = execFileSync(
      "node",
      [
        path.join(HERE, "fetch-image.mjs"),
        `--from-article=${url}`,
        `--count=${deep ? 3 : 1}`,
        ...(deep ? ["--deep"] : []),
      ],
      { encoding: "utf8", timeout: 120000, stdio: ["ignore", "pipe", "pipe"] },
    ).trim();
    if (!out) return [];
    const parsed = JSON.parse(out);
    return Array.isArray(parsed) ? parsed : [parsed];
  } catch {
    return []; // báo chặn, không có og:image, hoặc hết giờ — bỏ qua nguồn này
  }
}

async function main() {
  const dryRun = has("dry-run");
  const limit = Math.max(1, Number(arg("limit", "3")) || 3);
  const ids = arg("ids")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  const cookie = adminCookie();

  const rows = ids.length
    ? sql(
        `SELECT id, title FROM articles WHERE id IN (${ids
          .map((i) => `'${i.replace(/'/g, "''")}'`)
          .join(",")});`,
      )
    : sql(
        "SELECT id, title FROM articles WHERE status = 'published' " +
          `ORDER BY publishedAt DESC, createdAt DESC LIMIT ${limit};`,
      );

  if (!rows.length) {
    console.log("Không có bài nào để xử lý.");
    return;
  }

  for (const row of rows) {
    const res = await fetch(`${APP_URL}/api/articles/${row.id}`, { headers: { Cookie: cookie } });
    if (!res.ok) {
      console.log(`\n[BỎ QUA] ${row.title} — đọc bài hỏng (${res.status})`);
      continue;
    }
    const { article } = await res.json();

    const before = countMedia(article.body);
    const need = TARGET_AIM - before.images;

    console.log(`\n=== ${article.title}`);
    console.log(
      `    đang có: ${before.images} ảnh, ${before.videos} video, ` +
        `${article.sources.length} nguồn, ảnh bìa: ${article.coverImage ? "có" : "chưa"}`,
    );

    if (need <= 0 && article.coverImage) {
      console.log("    → đã đủ ảnh, không đụng tới.");
      continue;
    }

    // Ba lượt, nới dần:
    //   1. mỗi TOÀ SOẠN góp đúng một tấm — ảnh trong bài đến từ nhiều báo khác
    //      nhau, chứ không phải bốn tấm của cùng một nơi;
    //   2. vẫn thiếu thì cho phép lấy thêm tấm thứ hai của cùng toà soạn;
    //   3. vẫn thiếu nữa thì bới vào thân bài nguồn.
    const collected = [];
    const seenSrc = new Set();
    const usedHosts = new Set();
    const wanted = Math.min(TARGET_MAX, Math.max(need, TARGET_MIN));

    const passes = [
      { deep: false, oncePerHost: true },
      { deep: false, oncePerHost: false },
      { deep: true, oncePerHost: false },
    ];

    for (const pass of passes) {
      for (const source of article.sources) {
        if (collected.length >= wanted) break;
        let host;
        try {
          host = new URL(source.url).hostname.replace(/^www\./, "");
        } catch {
          continue;
        }
        if (pass.oncePerHost && usedHosts.has(host)) continue;

        for (const image of imagesFromSource(source.url, { deep: pass.deep })) {
          if (collected.length >= wanted) break;
          if (!image?.url || seenSrc.has(image.url)) continue;
          seenSrc.add(image.url);
          usedHosts.add(host);
          collected.push(image);
          if (pass.oncePerHost) break; // lượt một chỉ lấy một tấm mỗi báo
        }
      }
      if (collected.length >= wanted) break;
    }

    if (!collected.length) {
      console.log("    → không nguồn nào cho ảnh. Giữ nguyên bài.");
      continue;
    }

    console.log(`    lấy được ${collected.length} ảnh:`);
    for (const image of collected) {
      console.log(`      · ${image.caption} ← ${new URL(image.source).hostname}`);
    }

    // Ảnh bìa dùng tấm đầu nếu bài chưa có; những tấm còn lại vào thân bài.
    const patch = {};
    let forBody = collected;
    if (!article.coverImage) {
      patch.coverImage = collected[0].url;
      patch.coverImageCaption = collected[0].caption;
      forBody = collected.slice(1);
    }

    if (forBody.length) {
      patch.body = insertFigures(
        article.body,
        forBody.map((image) => figureFor(image, article.title)),
      );
    }

    if (dryRun) {
      console.log("    → (dry-run) không ghi gì.");
      continue;
    }

    // Thử lại vài lần: thân bài kèm ảnh khá nặng, mà một lần nghẽn mạng giữa
    // chừng không đáng để mất cả lượt và phải chạy lại từ đầu.
    let put;
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        put = await fetch(`${APP_URL}/api/articles/${article.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json", Cookie: cookie },
          body: JSON.stringify(patch),
          signal: AbortSignal.timeout(120000),
        });
        break;
      } catch (err) {
        console.log(`    ... ghi hỏng lần ${attempt} (${err.message})`);
        if (attempt === 3) put = null;
        else await new Promise((r) => setTimeout(r, 3000));
      }
    }
    if (!put) {
      console.log("    → GHI HỎNG sau 3 lần thử. Bài giữ nguyên, chạy lại sau.");
      continue;
    }
    if (!put.ok) {
      console.log(`    → GHI HỎNG (${put.status}): ${(await put.text()).slice(0, 200)}`);
      continue;
    }

    const { article: saved } = await put.json();
    const after = countMedia(saved.body);
    console.log(
      `    → xong: ${after.images} ảnh trong bài` +
        (patch.coverImage ? " + ảnh bìa mới" : "") +
        `, video vẫn ${after.videos} (không đụng tới).`,
    );
  }
}

// Node giữ kết nối keep-alive sau lượt fetch cuối nên vòng lặp sự kiện không
// rỗng: lệnh làm xong việc mà tiến trình vẫn treo. Thoát tường minh.
main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("[backfill-images]", err.message);
    process.exit(1);
  });
