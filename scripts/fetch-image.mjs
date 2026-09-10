/**
 * Tìm ảnh DÙNG LẠI ĐƯỢC trên internet, tải về rồi đẩy lên kho ảnh của toà soạn.
 * In ra JSON: {url, caption, licence, source}.
 *
 *   node scripts/fetch-image.mjs "đường sắt cao tốc Việt Nam"
 *   node scripts/fetch-image.mjs --count=3 "hanoi metro"     # nhiều ảnh, in mảng
 *   node scripts/fetch-image.mjs --html "hanoi metro"        # in luôn <figure>
 *
 * Hai kho ảnh, hỏi lần lượt:
 *   1. Wikimedia Commons — mọi tệp đều khai giấy phép, API trả về dạng máy đọc.
 *   2. Openverse (openverse.org của WordPress) — gom ảnh CC và ảnh không còn
 *      bản quyền từ Flickr, các bảo tàng, thư viện ảnh. Không cần khoá API.
 *
 * Chỉ hai kho này vì cả hai đều nói rõ giấy phép của từng tấm. Ảnh trên báo thì
 * không — ghi nguồn không thay được giấy phép, nên tuyệt đối không lấy.
 *
 * Ảnh đi qua /api/upload của chính app: ở đó đã có kiểm magic bytes, giới hạn
 * dung lượng và tên tệp do server sinh. Không mở thêm đường ghi nào mới.
 *
 * Biến môi trường: APP_URL, NEWSROOM_USER, NEWSROOM_PASS
 */
const APP_URL = process.env.APP_URL ?? "http://127.0.0.1:5006";
const USER = process.env.NEWSROOM_USER ?? "";
const PASS = process.env.NEWSROOM_PASS ?? "";

const COMMONS = "https://commons.wikimedia.org/w/api.php";
const OPENVERSE = "https://api.openverse.org/v1/images/";
// Header HTTP chỉ nhận latin-1: chữ tiếng Việt có dấu trong User-Agent làm
// fetch ném "Cannot convert argument to a ByteString". Giữ thuần ASCII.
const UA = "GenZNewsBot/1.0 (+https://genz-news.site; editorial use)";

/** Loại rõ ràng không được dùng lại. */
const BAD_LICENCE = /(non[- ]?commercial|fair use|all rights reserved)/i;

const ALLOWED_EXT = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
};

/**
 * Loại những thứ hai kho hay đẩy lên đầu nhưng không dùng làm ảnh tin được:
 * bản đồ, sơ đồ, biểu tượng, cờ, huy hiệu. Một tấm bản đồ đường sắt Trung Quốc
 * cho bài về đường sắt Việt Nam còn tệ hơn là không có ảnh.
 */
const BAD_KIND =
  /\b(map|diagram|chart|logo|wordmark|icon|flag|coat of arms|seal|scheme|plan|blueprint|graph)\b/i;

/** Bỏ dấu để so khớp từ khoá với tên tệp. */
const bare = (str) =>
  str
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();

/**
 * Từ tả CẢNH CHUNG CHUNG, không tả một đối tượng cụ thể nào.
 *
 * Khớp được mỗi những từ này thì gần như chắc chắn là ảnh minh hoạ vu vơ. Một
 * bài về vụ nam sinh ở Thanh Hoá từng nhận về tấm "Jinego ES hallway to
 * kitchen" — hành lang một trường tiểu học Nhật Bản — chỉ vì truy vấn có chữ
 * "hallway". Ảnh thời sự sai còn tệ hơn không có ảnh: người đọc mặc định ảnh
 * trong bài là ảnh chụp chính vụ việc.
 */
const GENERIC_SCENE = new Set([
  "school", "classroom", "class", "student", "students", "pupil", "teacher",
  "university", "college", "campus", "exam", "education", "lesson",
  "hallway", "corridor", "building", "room", "house", "home", "office", "desk",
  "hospital", "clinic", "doctor", "nurse", "patient", "medical", "health",
  "mental", "awareness", "therapy", "counselling", "counseling",
  "police", "officer", "court", "judge", "law", "justice", "crime", "prison",
  "street", "road", "traffic", "city", "town", "village", "district",
  "people", "person", "man", "woman", "boy", "girl", "child", "children",
  "family", "crowd", "group", "worker", "workers", "staff", "meeting",
  "computer", "laptop", "phone", "mobile", "screen", "internet", "online",
  "money", "cash", "bank", "market", "shop", "store", "business", "economy",
  "food", "restaurant", "kitchen", "car", "bus", "train", "bike", "vehicle",
  "technology", "science", "research", "study", "report", "news", "media",
  "government", "official", "policy", "protest", "rally", "sign", "symbol",
  "generic", "stock", "illustration", "concept", "abstract", "background",
]);

const tokens = (str) =>
  [...new Set(bare(str).split(/[^a-z0-9]+/).filter((w) => w.length >= 3))];

/**
 * Ảnh phải thật sự liên quan tới ĐỐI TƯỢNG của bài, không chỉ tới loại cảnh.
 *
 * Hai điều kiện, phải đạt cả hai:
 *   1. khớp ít nhất 60% số từ trong truy vấn — khớp một từ trong ba là ăn may;
 *   2. trong số từ khớp phải có ít nhất một từ KHÔNG chung chung, tức một cái
 *      tên: địa danh, tổ chức, sản phẩm, nhân vật.
 *
 * Nhờ điều kiện 2 mà "school hallway" không còn lấy được bất kỳ hành lang
 * trường học nào trên đời, còn "hanoi metro" thì vẫn lấy đúng ảnh metro Hà Nội.
 */
function relevant(title, query) {
  const wanted = tokens(query);
  if (!wanted.length) return true;

  const haystack = bare(title);
  const matched = wanted.filter((w) => haystack.includes(w));
  if (matched.length / wanted.length < 0.6) return false;
  return matched.some((w) => !GENERIC_SCENE.has(w));
}

const tidy = (t) => String(t).replace(/\s+/g, " ").trim();

function die(msg) {
  console.error(`[fetch-image] ${msg}`);
  process.exit(2);
}

async function json(url) {
  const res = await fetch(url, { headers: { "User-Agent": UA } });
  if (!res.ok) throw new Error(`${new URL(url).hostname} trả ${res.status}`);
  return res.json();
}

/**
 * Ứng viên chuẩn hoá từ cả hai kho:
 *   { src, title, artist, licence, page }
 */
async function fromCommons(query) {
  const params = new URLSearchParams({
    format: "json",
    origin: "*",
    action: "query",
    generator: "search",
    gsrnamespace: "6", // không gian tên File:
    gsrsearch: query,
    gsrlimit: "20",
    prop: "imageinfo",
    iiprop: "url|extmetadata|mime|size",
    iiurlwidth: "1600",
  });

  const data = await json(`${COMMONS}?${params}`);
  const pages = Object.values(data?.query?.pages ?? {});

  return pages.flatMap((page) => {
    const info = page.imageinfo?.[0];
    if (!info || !/^image\//.test(info.mime ?? "")) return [];
    const meta = info.extmetadata ?? {};
    return [
      {
        // Bản đã co nhỏ cho nhẹ; không có thì lấy bản gốc.
        src: info.thumburl || info.url,
        title: String(page.title ?? "").replace(/^File:/, ""),
        artist: tidy(String(meta.Artist?.value ?? "").replace(/<[^>]+>/g, "")),
        licence: tidy(meta.LicenseShortName?.value ?? meta.License?.value ?? ""),
        page: info.descriptionurl ?? info.url,
        outlet: "Wikimedia Commons",
      },
    ];
  });
}

async function fromOpenverse(query) {
  const params = new URLSearchParams({
    q: query,
    page_size: "20",
    // Openverse phân nhóm sẵn: "commercial" (được dùng cho mục đích thương
    // mại) và "modification" (được sửa/cắt cúp). Một trang tin cần cả hai.
    license_type: "commercial,modification",
  });

  const data = await json(`${OPENVERSE}?${params}`);
  return (data?.results ?? []).map((r) => ({
    src: r.url,
    title: String(r.title ?? ""),
    artist: tidy(r.creator ?? ""),
    licence: tidy(
      [r.license, r.license_version].filter(Boolean).join(" ").toUpperCase(),
    ),
    page: r.foreign_landing_url ?? r.url,
    outlet: tidy(r.source ?? "Openverse"),
  }));
}

async function login() {
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

/** Tải ảnh về rồi đẩy qua đúng đường upload của app. Trả về url kho, hoặc null. */
async function reupload(candidate, cookie) {
  const src = candidate.src;
  const ext = (src.split("?")[0].split(".").pop() ?? "").toLowerCase();
  const contentType = ALLOWED_EXT[ext];
  if (!contentType) return null;

  const bin = await fetch(src, { headers: { "User-Agent": UA } });
  if (!bin.ok) return null;
  const buf = Buffer.from(await bin.arrayBuffer());
  if (buf.length > 9 * 1024 * 1024) return null; // /api/upload chặn ảnh > 10MB
  if (buf.length < 4 * 1024) return null; // ảnh bé tí thường là icon

  const form = new FormData();
  form.append("file", new Blob([buf], { type: contentType }), `anh.${ext}`);
  const up = await fetch(`${APP_URL}/api/upload`, {
    method: "POST",
    headers: { Cookie: cookie },
    body: form,
  });
  if (!up.ok) return null;
  const { url } = await up.json();
  return url;
}

/** Ghi công: bắt buộc với ảnh CC, và cũng là thứ hiện dưới ảnh trong bài. */
function captionFor(c) {
  return tidy(
    `Ảnh: ${c.artist || "không rõ tác giả"} — ${c.licence || "xem trang gốc"}, qua ${c.outlet}` +
      (c.title ? ` (${c.title})` : ""),
  );
}

const escapeHtml = (s) =>
  String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

async function main() {
  const args = process.argv.slice(2);
  const wantHtml = args.includes("--html");
  const countArg = args.find((a) => a.startsWith("--count="));
  const count = Math.min(Math.max(Number(countArg?.slice(8)) || 1, 1), 5);
  const query = args.filter((a) => !a.startsWith("--")).join(" ").trim();

  if (!query) die('thiếu từ khoá. Ví dụ: genz-news-fetch-image "đường sắt cao tốc"');
  if (!USER || !PASS) die("thiếu NEWSROOM_USER / NEWSROOM_PASS");

  // Hỏi cả hai kho rồi trộn. Commons đứng trước vì phần ghi công của nó đầy đủ
  // nhất, nhưng kho ảnh thời sự thì Openverse rộng hơn hẳn.
  const [commons, openverse] = await Promise.all([
    fromCommons(query).catch(() => []),
    fromOpenverse(query).catch(() => []),
  ]);

  const candidates = [...commons, ...openverse].filter((c) => {
    if (!c.src) return false;
    if (BAD_LICENCE.test(c.licence)) return false;
    if (BAD_KIND.test(c.title)) return false;
    return relevant(c.title, query);
  });

  if (!candidates.length) {
    die(
      `không tìm được ảnh dùng lại được cho "${query}". ` +
        "Thử từ khoá tiếng Anh khác, hoặc bỏ ảnh và dùng gradient.",
    );
  }

  const cookie = await login();
  const picked = [];
  const seen = new Set();

  for (const c of candidates) {
    if (picked.length >= count) break;
    // Cùng một tấm ảnh xuất hiện ở cả hai kho là chuyện thường — Openverse có
    // gom cả Wikimedia. So bằng tên tệp chứ không bằng URL: Commons trả link
    // bản co nhỏ ("1600px-Ten_Anh.jpg") còn Openverse trả link bản gốc.
    const key = c.src
      .split("?")[0]
      .split("/")
      .pop()
      .replace(/^\d+px-/, "")
      .toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);

    let url = null;
    try {
      url = await reupload(c, cookie);
    } catch {
      continue; // một tấm hỏng thì bỏ qua, đừng làm chết cả lượt
    }
    if (!url) continue;

    picked.push({
      url,
      caption: captionFor(c),
      licence: c.licence || "",
      source: c.page,
    });
  }

  if (!picked.length) {
    die(`tìm thấy ảnh cho "${query}" nhưng không tải lên được tấm nào.`);
  }

  if (wantHtml) {
    // Dán thẳng vào thân bài được: đã có figcaption ghi công sẵn.
    for (const p of picked) {
      console.log(
        `<figure><img src="${escapeHtml(p.url)}" alt="${escapeHtml(query)}">` +
          `<figcaption>${escapeHtml(p.caption)}</figcaption></figure>`,
      );
    }
    return;
  }

  // Một ảnh thì in object cho gọn (giữ nguyên cách gọi cũ), nhiều thì in mảng.
  console.log(JSON.stringify(count === 1 ? picked[0] : picked));
}

main().catch((err) => {
  console.error("[fetch-image]", err.message);
  process.exitCode = 1;
});
