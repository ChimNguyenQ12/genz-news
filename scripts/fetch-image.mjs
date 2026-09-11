/**
 * Tìm ảnh DÙNG LẠI ĐƯỢC trên internet, tải về rồi đẩy lên kho ảnh của toà soạn.
 * In ra JSON: {url, caption, licence, source}.
 *
 *   node scripts/fetch-image.mjs "đường sắt cao tốc Việt Nam"
 *   node scripts/fetch-image.mjs --count=3 "hanoi metro"     # nhiều ảnh, in mảng
 *   node scripts/fetch-image.mjs --html "hanoi metro"        # in luôn <figure>
 *
 * Ba nguồn, hỏi song song rồi trộn theo thứ tự ưu tiên:
 *   1. Wikipedia — ảnh đại diện của CHÍNH thực thể được hỏi (doanh nghiệp, địa
 *      danh, nhân vật). Sát đề tài nhất nên xếp trước.
 *   2. Wikimedia Commons — mọi tệp đều khai giấy phép, API trả về dạng máy đọc.
 *   3. Openverse (openverse.org của WordPress) — gom ảnh CC và ảnh không còn
 *      bản quyền từ Flickr, các bảo tàng, thư viện ảnh. Không cần khoá API.
 *
 * Chỉ ba nguồn này vì cả ba đều nói rõ giấy phép của từng tấm. Ảnh trên báo thì
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
  /\b(map|diagram|chart|logo|wordmark|icon|flag|coat of arms|seal|scheme|plan|blueprint|graph|location of|locator|emblem|insignia|crest|silhouette|outline)\b/i;

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

/** Vài thực thể HTML hay gặp trong thẻ meta: "Tom&#039;s Guide", "VTV&amp;hellip". */
function decodeEntities(text) {
  return String(text)
    .replace(/&#0?39;|&apos;|&rsquo;/gi, "'")
    .replace(/&quot;/gi, '"')
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&amp;/gi, "&");
}

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

/**
 * Ảnh đại diện của chính THỰC THỂ được nhắc tới, lấy qua Wikipedia.
 *
 * Đây là nguồn sát đề tài nhất trong ba nguồn: hỏi "Grab" thì ra đúng ảnh của
 * Grab, hỏi "Thanh Hoa" thì ra đúng ảnh Thanh Hoá — thay vì một tấm ảnh "cùng
 * chủ đề" nhặt được ở đâu đó. Hỏi cả bản tiếng Việt lẫn tiếng Anh vì đề tài
 * trong nước nhiều khi chỉ có trang tiếng Việt.
 *
 * Cẩn thận chuyện giấy phép: Wikipedia tiếng Anh CÓ cho đăng ảnh không tự do
 * theo fair use (logo, bìa đĩa). Nên tên tệp lấy được phải đối chiếu lại với
 * Commons — Commons chỉ nhận tệp tự do, có ở đó mới dùng.
 */
async function fromWikipedia(query) {
  const search = async (lang) => {
    const params = new URLSearchParams({
      format: "json",
      origin: "*",
      action: "query",
      generator: "search",
      gsrsearch: query,
      gsrlimit: "4",
      gsrnamespace: "0", // chỉ bài, bỏ trang thảo luận và trang phụ
      prop: "pageimages",
      piprop: "name",
      // Chỉ ảnh có giấy phép tự do. Wikipedia tiếng Anh có ảnh fair use, lọc
      // ngay từ đây cho khỏi phải loại về sau.
      pilicense: "free",
    });
    const data = await json(`https://${lang}.wikipedia.org/w/api.php?${params}`);
    return Object.values(data?.query?.pages ?? {})
      .filter((p) => p.pageimage)
      .map((p) => ({ page: String(p.title ?? ""), file: String(p.pageimage), lang }));
  };

  const hits = (
    await Promise.all([search("vi").catch(() => []), search("en").catch(() => [])])
  )
    .flat()
    // Tìm kiếm của Wikipedia rất rộng tay: hỏi "Thanh Hoa province" nó trả về
    // cả trang "Tây Tạng". Loại ngay ở đây theo đúng thước đo dùng cho mọi
    // nguồn, đỡ một lượt gọi Commons cho những trang chẳng liên quan.
    .filter((h) => relevant(h.page, query));
  if (!hits.length) return [];

  // Một lượt hỏi Commons cho tất cả tệp: tệp nào không có ở Commons thì rơi ra,
  // và đó chính là những tệp không tự do.
  const params = new URLSearchParams({
    format: "json",
    origin: "*",
    action: "query",
    titles: hits.map((h) => `File:${h.file}`).join("|"),
    prop: "imageinfo",
    iiprop: "url|extmetadata|mime",
    iiurlwidth: "1600",
  });
  const data = await json(`${COMMONS}?${params}`);
  const byFile = new Map();
  for (const page of Object.values(data?.query?.pages ?? {})) {
    const info = page.imageinfo?.[0];
    if (!info || page.missing !== undefined) continue;
    byFile.set(String(page.title ?? "").replace(/^File:/, ""), info);
  }

  return hits.flatMap((h) => {
    const info = byFile.get(h.file);
    if (!info || !/^image\//.test(info.mime ?? "")) return [];
    const meta = info.extmetadata ?? {};
    return [
      {
        src: info.thumburl || info.url,
        // Dùng tên BÀI làm tiêu đề: bộ lọc liên quan so với tên thực thể trong
        // truy vấn, mà tên tệp trên Commons thì hay đặt lung tung.
        title: h.page,
        artist: tidy(String(meta.Artist?.value ?? "").replace(/<[^>]+>/g, "")),
        licence: tidy(meta.LicenseShortName?.value ?? meta.License?.value ?? ""),
        page: info.descriptionurl ?? info.url,
        outlet: "Wikimedia Commons",
      },
    ];
  });
}

/**
 * Ảnh của CHÍNH bài báo nguồn, lấy qua thẻ og:image.
 *
 * Đây là tấm ảnh mà toà soạn kia tự chỉ định để hiện khi bài được chia sẻ —
 * cùng tấm mà Facebook, Zalo hay Google hiện trong ô xem trước. Nó luôn đúng
 * vụ việc, khác hẳn ảnh kho tự do vốn chỉ đúng chủ đề.
 *
 * ĐÂY LÀ ẢNH CÓ BẢN QUYỀN CỦA HÃNG TIN. Dùng nó là quyết định của tổng biên
 * tập, bật/tắt bằng công tắc "Photos from source articles" trong /admin/research.
 * Bù lại, luôn ghi rõ tên báo và dẫn link về bài gốc trong caption.
 */
/**
 * Ảnh nằm TRONG thân bài báo nguồn, không chỉ mỗi ảnh chia sẻ.
 *
 * Một bài tổng hợp cần 3–7 tấm, mà mỗi nguồn chỉ có một og:image. Khi cần
 * thêm thì bới tiếp các thẻ <img> của trang, bỏ những thứ không phải ảnh tin:
 * logo, avatar, biểu tượng, ảnh bé hơn 300px.
 */
function imagesInPage(html, pageUrl) {
  const junk = /(logo|icon|avatar|banner|sprite|placeholder|blank|pixel|ads?[-_/]|1x1)/i;
  const out = [];

  for (const tag of html.match(/<img[\s][^>]*>/gi) ?? []) {
    // Báo hay lazy-load: src thật nằm ở data-src, còn src là ảnh mờ tạm.
    const pick = (attr) => {
      const hit = tag.match(new RegExp(`\\s${attr}\\s*=\\s*["']([^"']+)["']`, "i"));
      return hit ? hit[1] : "";
    };
    let raw = pick("data-src") || pick("data-original") || pick("src");

    // srcset thì lấy bản rộng nhất.
    const srcset = pick("srcset") || pick("data-srcset");
    if (srcset) {
      const widest = srcset
        .split(",")
        .map((part) => part.trim().split(/\s+/))
        .map(([u, w]) => ({ u, w: parseInt(w ?? "0", 10) || 0 }))
        .sort((a, b) => b.w - a.w)[0];
      if (widest?.u) raw = widest.u;
    }
    if (!raw || raw.startsWith("data:")) continue;
    if (junk.test(raw)) continue;

    const width = parseInt(pick("width") || "0", 10);
    const height = parseInt(pick("height") || "0", 10);
    if ((width && width < 300) || (height && height < 200)) continue;

    try {
      out.push(new URL(raw.replace(/&amp;/g, "&"), pageUrl).href);
    } catch {
      // đường dẫn hỏng thì bỏ
    }
  }
  return [...new Set(out)];
}

async function fromArticle(url, { deep = false } = {}) {
  let page;
  try {
    page = await fetch(url, {
      headers: {
        "User-Agent": UA,
        // Vài báo trả 406 nếu không khai nhận HTML.
        Accept: "text/html,application/xhtml+xml",
      },
      redirect: "follow",
    });
  } catch {
    return [];
  }
  if (!page.ok) return [];

  // Chỉ đọc phần đầu: thẻ meta nằm trong <head>, tải cả trang là phí băng thông.
  const html = (await page.text()).slice(0, 300_000);

  // Giá trị content được bọc bằng " hoặc ', và bên trong có thể chứa dấu kia —
  // "Tom's Guide" từng bị cắt thành "Tom" vì so khớp không phân biệt hai loại
  // nháy. Bắt luôn ký tự mở rồi tham chiếu ngược để đóng đúng cặp.
  const meta = (property) => {
    const patterns = [
      new RegExp(
        `<meta[^>]+(?:property|name)=["']${property}["'][^>]+content=(["'])(.*?)\\1`,
        "i",
      ),
      new RegExp(
        `<meta[^>]+content=(["'])(.*?)\\1[^>]+(?:property|name)=["']${property}["']`,
        "i",
      ),
    ];
    for (const re of patterns) {
      const hit = html.match(re);
      if (hit) return decodeEntities(hit[2]);
    }
    return "";
  };

  const raw = meta("og:image:secure_url") || meta("og:image") || meta("twitter:image");
  if (!raw) return [];

  let src;
  try {
    src = new URL(raw.replace(/&amp;/g, "&"), url).href; // og:image có thể là đường dẫn tương đối
  } catch {
    return [];
  }

  const host = new URL(url).hostname.replace(/^www\./, "");
  // og:site_name đáng lẽ là tên báo, nhưng vài nơi nhét luôn địa chỉ trang vào
  // ("https://kenh14.vn"). Ghi công bằng một cái URL thì vừa xấu vừa vô nghĩa.
  const declared = tidy(meta("og:site_name"));
  const outlet =
    declared && !/^https?:\/\//i.test(declared) && !declared.includes("/")
      ? declared
      : host;

  const title = tidy(meta("og:title")) || host;
  const asCandidate = (imageUrl) => ({
    src: imageUrl,
    // Tiêu đề bài gốc để biết ảnh này đi kèm tin nào.
    title,
    artist: outlet,
    licence: "", // ảnh báo chí, không phải giấy phép mở
    page: url,
    outlet,
    fromPress: true,
  });

  const found = [asCandidate(src)];
  if (deep) {
    for (const extra of imagesInPage(html, url)) {
      if (extra !== src) found.push(asCandidate(extra));
    }
  }
  return found;
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

/** Kiểu ảnh suy từ header Content-Type, dùng khi URL không có đuôi rõ ràng. */
const EXT_OF_TYPE = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

/** Tải ảnh về rồi đẩy qua đúng đường upload của app. Trả về url kho, hoặc null. */
async function reupload(candidate, cookie) {
  const src = candidate.src;
  let ext = (src.split("?")[0].split(".").pop() ?? "").toLowerCase();
  let contentType = ALLOWED_EXT[ext];

  const bin = await fetch(src, {
    headers: { "User-Agent": UA, Referer: candidate.page ?? src },
  });
  if (!bin.ok) return null;

  // Ảnh trên báo hay nằm sau CDN cắt cúp, URL không có đuôi tệp nào cả
  // (".../photo/1234?w=1200"). Khi đó tin vào Content-Type của máy chủ.
  if (!contentType) {
    const declared = (bin.headers.get("content-type") ?? "").split(";")[0].trim();
    ext = EXT_OF_TYPE[declared];
    contentType = ext ? declared : undefined;
    if (!contentType) return null;
  }

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
  // Ảnh báo chí ghi theo lối nhà báo: tên báo, rồi dẫn link bài gốc. Không có
  // giấy phép mở để nêu, nên nêu chỗ lấy là tối thiểu phải làm.
  if (c.fromPress) {
    return tidy(`Ảnh: ${c.outlet}`);
  }
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
  // Bới thêm ảnh trong thân bài nguồn, không chỉ tấm og:image.
  const deep = args.includes("--deep");
  const countArg = args.find((a) => a.startsWith("--count="));
  const count = Math.min(Math.max(Number(countArg?.slice(8)) || 1, 1), 5);
  // Lấy ảnh của chính bài báo nguồn. Nhận nhiều lần để thử lần lượt từng nguồn.
  const articles = args
    .filter((a) => a.startsWith("--from-article="))
    .map((a) => a.slice(15))
    .filter(Boolean);
  const query = args.filter((a) => !a.startsWith("--")).join(" ").trim();

  if (!query && !articles.length) {
    die('thiếu từ khoá. Ví dụ: genz-news-fetch-image "đường sắt cao tốc"');
  }
  if (!USER || !PASS) die("thiếu NEWSROOM_USER / NEWSROOM_PASS");

  // Ảnh của chính bài nguồn xếp trước tất cả: nó là ảnh của ĐÚNG vụ việc, còn
  // ảnh kho tự do giỏi lắm cũng chỉ đúng chủ đề.
  const press = (
    await Promise.all(articles.map((u) => fromArticle(u, { deep }).catch(() => [])))
  ).flat();

  // Đã chỉ đích danh bài nguồn thì khỏi tìm kho ảnh, trừ khi không moi được gì.
  const needFallback = !press.length;
  const [wiki, commons, openverse] = needFallback && query
    ? await Promise.all([
        fromWikipedia(query).catch(() => []),
        fromCommons(query).catch(() => []),
        fromOpenverse(query).catch(() => []),
      ])
    : [[], [], []];

  const candidates = [...press, ...wiki, ...commons, ...openverse].filter((c) => {
    if (!c.src) return false;
    // Ảnh lấy thẳng từ bài nguồn thì khỏi đo độ liên quan: nó chính là ảnh mà
    // toà soạn kia gắn cho tin này, không thể sát hơn được nữa.
    if (c.fromPress) return true;
    if (BAD_LICENCE.test(c.licence)) return false;
    if (BAD_KIND.test(c.title)) return false;
    return relevant(c.title, query);
  });

  if (!candidates.length) {
    die(
      articles.length
        ? `không lấy được ảnh từ ${articles.join(", ")} (bài không khai og:image, ` +
            "hoặc báo chặn máy đọc). Thử nguồn khác, hoặc bỏ ảnh và dùng gradient."
        : `không tìm được ảnh dùng lại được cho "${query}". ` +
            "Thử từ khoá tiếng Anh khác, hoặc bỏ ảnh và dùng gradient.",
    );
  }

  // Ảnh chụp gần như luôn là JPEG, còn bản đồ/sơ đồ/ảnh chụp màn hình thì
  // PNG. Không loại PNG (có bài cần đúng ảnh chụp màn hình), chỉ xếp JPEG lên
  // trước — sắp xếp ổn định nên thứ tự ưu tiên giữa các nguồn vẫn giữ nguyên.
  const ranked = candidates
    .map((c, i) => {
      const ext = (c.src.split("?")[0].split(".").pop() ?? "").toLowerCase();
      return { c, i, photo: ext === "jpg" || ext === "jpeg" ? 0 : 1 };
    })
    .sort((a, b) => a.photo - b.photo || a.i - b.i)
    .map((x) => x.c);

  const cookie = await login();
  const picked = [];
  const seen = new Set();

  for (const c of ranked) {
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
      fromPress: Boolean(c.fromPress),
    });
  }

  if (!picked.length) {
    die(
      `tìm thấy ảnh cho "${query || articles.join(", ")}" nhưng không tải lên được tấm nào.`,
    );
  }

  if (wantHtml) {
    // Dán thẳng vào thân bài được: đã có figcaption ghi công sẵn. Ảnh báo chí
    // thì caption dẫn luôn link bài gốc — ghi công mà không chỉ được chỗ lấy
    // thì coi như chưa ghi.
    for (const p of picked) {
      const credit =
        p.fromPress && p.source
          ? `${escapeHtml(p.caption)} (<a href="${escapeHtml(p.source)}">nguồn</a>)`
          : escapeHtml(p.caption);
      console.log(
        `<figure><img src="${escapeHtml(p.url)}" alt="${escapeHtml(query || p.caption)}">` +
          `<figcaption>${credit}</figcaption></figure>`,
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
