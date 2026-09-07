/**
 * Tìm một tấm ảnh CÓ GIẤY PHÉP TỰ DO trên Wikimedia Commons, tải về rồi đẩy
 * lên S3 của mình. In ra JSON: {url, caption}.
 *
 *   node scripts/fetch-image.mjs "đường sắt cao tốc Việt Nam"
 *
 * Vì sao Wikimedia Commons: mọi tệp ở đó đều phải khai giấy phép, và API trả
 * về giấy phép đó dưới dạng máy đọc được. Ảnh trên báo thì không — ghi nguồn
 * không thay được giấy phép, nên tuyệt đối không lấy.
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
// Header HTTP chỉ nhận latin-1: chữ tiếng Việt có dấu trong User-Agent làm
// fetch ném "Cannot convert argument to a ByteString". Giữ thuần ASCII.
const UA = "GenZNewsBot/1.0 (+https://genz-news.site; editorial use)";

/** Chỉ nhận những giấy phép cho dùng lại kèm ghi công. Nghi ngờ thì bỏ. */
const OK_LICENCE = /^(cc0|cc[- ]by([- ]sa)?([- ][0-9.]+)?|public domain|pd-|no restrictions)/i;
/** Loại rõ ràng không được dùng. */
const BAD_LICENCE = /(non[- ]?commercial|nc\b|nd\b|fair use|copyright|all rights reserved)/i;

const ALLOWED_EXT = { jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp" };

function die(msg) {
  console.error(`[fetch-image] ${msg}`);
  process.exit(2);
}

async function api(params) {
  const url = `${COMMONS}?${new URLSearchParams({ format: "json", origin: "*", ...params })}`;
  const res = await fetch(url, { headers: { "User-Agent": UA } });
  if (!res.ok) throw new Error(`Commons trả ${res.status}`);
  return res.json();
}

async function main() {
  const query = process.argv.slice(2).join(" ").trim();
  if (!query) die('thiếu từ khoá. Ví dụ: genz-news-fetch-image "đường sắt cao tốc"');
  if (!USER || !PASS) die("thiếu NEWSROOM_USER / NEWSROOM_PASS");

  const search = await api({
    action: "query",
    generator: "search",
    gsrnamespace: "6", // không gian tên File:
    gsrsearch: query,
    gsrlimit: "12",
    prop: "imageinfo",
    iiprop: "url|extmetadata|mime|size",
    iiurlwidth: "1600",
  });

  const pages = Object.values(search?.query?.pages ?? {});
  if (!pages.length) die(`Commons không có ảnh nào cho "${query}"`);

  for (const page of pages) {
    const info = page.imageinfo?.[0];
    if (!info) continue;

    const meta = info.extmetadata ?? {};
    const licence = String(meta.LicenseShortName?.value ?? meta.License?.value ?? "").trim();
    const artist = String(meta.Artist?.value ?? "").replace(/<[^>]+>/g, "").trim();

    if (!licence || BAD_LICENCE.test(licence) || !OK_LICENCE.test(licence)) continue;
    if (!/^image\//.test(info.mime ?? "")) continue;

    // Bản đã co nhỏ (thumburl) cho nhẹ; không có thì lấy bản gốc.
    const src = info.thumburl || info.url;
    const ext = (src.split("?")[0].split(".").pop() ?? "").toLowerCase();
    const contentType = ALLOWED_EXT[ext];
    if (!contentType) continue;

    const bin = await fetch(src, { headers: { "User-Agent": UA } });
    if (!bin.ok) continue;
    const buf = Buffer.from(await bin.arrayBuffer());
    if (buf.length > 9 * 1024 * 1024) continue; // /api/upload chặn ảnh > 10MB

    // Đăng nhập bằng tài khoản bot rồi đẩy qua đúng đường upload của app.
    const login = await fetch(`${APP_URL}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: USER, password: PASS }),
    });
    if (!login.ok) die(`đăng nhập hỏng (${login.status})`);
    const cookie = (login.headers.getSetCookie?.() ?? [])
      .map((c) => c.split(";")[0])
      .join("; ");

    const form = new FormData();
    form.append("file", new Blob([buf], { type: contentType }), `commons.${ext}`);
    const up = await fetch(`${APP_URL}/api/upload`, {
      method: "POST",
      headers: { Cookie: cookie },
      body: form,
    });
    if (!up.ok) die(`đẩy lên hỏng (${up.status}): ${(await up.text()).slice(0, 200)}`);
    const { url } = await up.json();

    const title = String(page.title ?? "").replace(/^File:/, "");
    const caption =
      `Ảnh: ${artist || "không rõ tác giả"} — ${licence}, qua Wikimedia Commons ` +
      `(${title})`;

    console.log(JSON.stringify({ url, caption, licence, source: info.descriptionurl ?? src }));
    return;
  }

  die(
    `tìm thấy ảnh cho "${query}" nhưng không cái nào có giấy phép dùng lại được. ` +
      "Bỏ ảnh, dùng gradient.",
  );
}

main().catch((err) => {
  console.error("[fetch-image]", err.message);
  process.exitCode = 1;
});
