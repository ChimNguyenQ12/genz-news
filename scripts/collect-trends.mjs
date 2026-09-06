#!/usr/bin/env node
/**
 * Thu thập xu hướng hằng ngày → ghi vào hàng đợi đề tài của toà soạn.
 *
 *   npm run collect-trends
 *
 * Nguồn (đều hợp pháp, không scrape nền tảng cấm bot):
 *   1. Google Trends VN  — feed RSS công khai, không cần key
 *   2. YouTube Trending VN — API chính thức, cần YOUTUBE_API_KEY
 *   3. RSS báo quốc tế   — feed công khai do chính các hãng cung cấp
 *
 * Kết quả:
 *   - bảng research_requests    ← thêm đề tài mới, trạng thái "pending"
 *   - data/trends-digest.json   ← ảnh chụp toàn bộ dữ liệu thô hôm nay
 *
 * Biến môi trường (tùy chọn):
 *   YOUTUBE_API_KEY      bật nguồn YouTube Trending
 *   TRENDS_MAX_GOOGLE    số đề tài lấy từ Google Trends (mặc định 8)
 *   TRENDS_MAX_YOUTUBE   số đề tài lấy từ YouTube (mặc định 6)
 *   TRENDS_DEDUPE_DAYS   bỏ qua đề tài đã có trong N ngày (mặc định 7)
 *   TRENDS_DRY_RUN=1     chỉ in ra, không ghi file
 */

import fs from "fs/promises";
import path from "path";
import { XMLParser } from "fast-xml-parser";
import { execFileSync } from "child_process";
import { randomUUID } from "crypto";

const ROOT = process.cwd();
const DATA_DIR = process.env.DATA_DIR ?? path.join(ROOT, "data");
const DB = process.env.DATABASE_PATH ?? path.join(DATA_DIR, "app.db");
const DIGEST_FILE = path.join(DATA_DIR, "trends-digest.json");

const quote = (v) => "'" + String(v).replace(/'/g, "''") + "'";

/**
 * Kho dữ liệu lưu DateTime ở dạng "2026-09-04T11:08:40.049+00:00", trong khi
 * cột createdAt có DEFAULT CURRENT_TIMESTAMP cho ra "2026-09-04 11:08:40" —
 * thiếu chữ T, thiếu mili giây, thiếu múi giờ. Nên INSERT thô phải TỰ điền cả
 * hai cột thời gian, đừng trông vào giá trị mặc định.
 */
function nowStamp() {
  return new Date().toISOString().replace("Z", "+00:00");
}

/**
 * Chạy SQL bằng lệnh sqlite3 của máy chủ — script không cần thư viện ORM.
 * Cần sqlite3 >= 3.33 (bản có tuỳ chọn -json). Máy Windows hay kèm bản cũ hơn,
 * khi đó chạy trên máy chủ hoặc chỉ dùng TRENDS_DRY_RUN để xem nguồn.
 */
function sql(query, { json = false } = {}) {
  const args = ["-cmd", ".timeout 5000"];
  if (json) args.push("-json");
  const out = execFileSync("sqlite3", [...args, DB, query], {
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  }).trim();
  if (!json) return out;
  return out ? JSON.parse(out) : [];
}

const MAX_GOOGLE = Number(process.env.TRENDS_MAX_GOOGLE ?? 8);
const MAX_YOUTUBE = Number(process.env.TRENDS_MAX_YOUTUBE ?? 6);
const MAX_HEADLINES = Number(process.env.TRENDS_MAX_HEADLINES ?? 12);
const DEDUPE_DAYS = Number(process.env.TRENDS_DEDUPE_DAYS ?? 7);
const DRY_RUN = process.env.TRENDS_DRY_RUN === "1";
const UA = "GenZNewsBot/1.0 (+editorial trend collector)";

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  textNodeName: "#text",
  // Vài báo Việt nhét thực thể HTML vào tít RSS ("qu&ecirc;" thay vì "quê").
  // Không bật cái này thì đề tài lưu xuống còn nguyên mã, đọc không ra chữ.
  htmlEntities: true,
});

// Giữ đồng bộ thủ công với lib/sources/rss.ts (script chạy độc lập bằng Node
// nên không import trực tiếp file TypeScript của app).
const RSS_FEEDS = [
  // --- Quốc tế: tin thế giới
  { name: "BBC World", url: "https://feeds.bbci.co.uk/news/world/rss.xml" },
  { name: "The Guardian World", url: "https://www.theguardian.com/world/rss" },
  { name: "Al Jazeera", url: "https://www.aljazeera.com/xml/rss/all.xml" },
  { name: "NYT World", url: "https://rss.nytimes.com/services/xml/rss/nyt/World.xml" },
  // --- Quốc tế: công nghệ và văn hoá mạng, mảng Gen Z đọc nhiều nhất
  { name: "BBC Technology", url: "https://feeds.bbci.co.uk/news/technology/rss.xml" },
  { name: "TechCrunch", url: "https://techcrunch.com/feed/" },
  { name: "Ars Technica", url: "https://feeds.arstechnica.com/arstechnica/index" },
  { name: "WIRED", url: "https://www.wired.com/feed/rss" },
  // --- Việt Nam
  { name: "BBC Tiếng Việt", url: "https://feeds.bbci.co.uk/vietnamese/rss.xml" },
  { name: "VnExpress Thế giới", url: "https://vnexpress.net/rss/the-gioi.rss" },
  { name: "VnExpress Số hoá", url: "https://vnexpress.net/rss/so-hoa.rss" },
  { name: "VnExpress Giải trí", url: "https://vnexpress.net/rss/giai-tri.rss" },
  { name: "Thanh Niên Giới trẻ", url: "https://thanhnien.vn/rss/gioi-tre.rss" },
  { name: "Thanh Niên Công nghệ", url: "https://thanhnien.vn/rss/cong-nghe.rss" },
  { name: "Tuổi Trẻ Nhịp sống trẻ", url: "https://tuoitre.vn/rss/nhip-song-tre.rss" },
  { name: "Kênh14 Star", url: "https://kenh14.vn/star.rss" },
  { name: "Znews Công nghệ", url: "https://znews.vn/rss/cong-nghe.rss" },
];

/**
 * Từ khoá rác của Google Trends VN — tra cứu tiện ích hằng ngày, không phải
 * đề tài báo chí. Sửa danh sách này nếu thấy lọt/lọc nhầm.
 */
const NOISE_PATTERNS = [
  /xổ số|xsmb|xsmn|xsmt|kết quả xs|kqxs/i,
  /giá vàng|giá xăng|giá heo|giá lợn|giá bạc|giá cà phê|giá tiêu/i,
  /tỷ giá|đô la mỹ|usd hôm nay|euro hôm nay/i,
  /lịch âm|ngày tốt|tử vi|xem bói/i,
  /dự báo thời tiết|thời tiết hôm nay/i,
  /lich thi dau|ket qua bong da hom nay/i,
  // Tra lịch/bảng xếp hạng giải đấu — tiện ích, không phải tin.
  /lich (ngoai hang anh|la liga|serie a|c1|cup)|bang xep hang|bxh/i,
  // Tra cứu tiện ích — người ta gõ để dùng, không phải để đọc tin.
  /lịch cúp điện|cắt điện|tra cứu|số điện thoại|mã vùng|bảng giá|tra điểm/i,
  // Từ khoá là tên miền: "edu.vn", "abc.com" — không thành đề tài được.
  /^[\w-]+\.(vn|com|net|org|edu|gov)$/i,
];

/**
 * Danh từ chung trần trụi. Google Trends VN hay đẩy lên những từ như "phường",
 * "bệnh viện", "máy móc" — đúng là đang hot nhưng không nói lên chuyện gì.
 */
const GENERIC_WORDS = new Set(
  [
    "phường", "xã", "huyện", "tỉnh", "quận", "thành phố",
    "bệnh viện", "trường học", "công ty", "ngân hàng", "máy móc",
    "học sinh", "sinh viên", "giáo viên", "bác sĩ", "công an",
    "thời tiết", "bóng đá", "điện thoại", "xe máy", "ô tô",
  ].map((w) => stripDiacritics(w)),
);

/** Bỏ từ khoá quá ngắn/mơ hồ như "đất", "đâm" — không đủ thành đề tài. */
function isTooVague(keyword) {
  // So khớp trên bản không dấu: Google Trends trả về cả "phường" lẫn "phuong".
  const k = stripDiacritics(keyword.trim().toLowerCase());
  if (GENERIC_WORDS.has(k)) return true;
  const words = k.split(/\s+/);
  // Một chữ thì phải đủ dài mới mong là tên riêng; ngưỡng cũ (6) lọt cả
  // "phường", "edu.vn".
  if (words.length < 2 && k.length < 10) return true;
  // Hai chữ mà cả hai đều là danh từ chung thì cũng chẳng thành đề tài.
  if (words.length === 2 && words.every((w) => GENERIC_WORDS.has(w))) return true;
  return false;
}

/** Bỏ dấu tiếng Việt để so khớp. Google Trends VN trả về cả có dấu lẫn không. */
function stripDiacritics(str) {
  return str
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D");
}

function isNoise(keyword) {
  const bare = stripDiacritics(keyword);
  const hit = (re) => re.test(keyword) || re.test(bare);
  return NOISE_PATTERNS.some(hit) || isTooVague(keyword);
}

const toArray = (v) => (v === undefined ? [] : Array.isArray(v) ? v : [v]);

/**
 * Bảng thực thể HTML có tên, dải Latin-1 (mã 160–255) theo đúng thứ tự chuẩn.
 * Tuỳ chọn htmlEntities của trình phân tích không phủ hết bộ này, mà báo Việt
 * lại hay nhét "qu&ecirc;" vào tít RSS. Ký tự tiếng Việt ngoài dải Latin-1
 * (ơ, ư, ạ, ấ...) không có tên riêng, chúng đi ở dạng số nên đã xử lý sẵn.
 */
const LATIN1_ENTITIES = (
  "nbsp iexcl cent pound curren yen brvbar sect uml copy ordf laquo not shy " +
  "reg macr deg plusmn sup2 sup3 acute micro para middot cedil sup1 ordm " +
  "raquo frac14 frac12 frac34 iquest Agrave Aacute Acirc Atilde Auml Aring " +
  "AElig Ccedil Egrave Eacute Ecirc Euml Igrave Iacute Icirc Iuml ETH Ntilde " +
  "Ograve Oacute Ocirc Otilde Ouml times Oslash Ugrave Uacute Ucirc Uuml " +
  "Yacute THORN szlig agrave aacute acirc atilde auml aring aelig ccedil " +
  "egrave eacute ecirc euml igrave iacute icirc iuml eth ntilde ograve oacute " +
  "ocirc otilde ouml divide oslash ugrave uacute ucirc uuml yacute thorn yuml"
).split(" ").reduce((map, name, i) => map.set(name, String.fromCharCode(160 + i)), new Map());

function decodeEntities(str) {
  return (
    str
      .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(Number(d)))
      .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCharCode(parseInt(h, 16)))
      .replace(/&([A-Za-z]+);/g, (whole, name) => {
        if (LATIN1_ENTITIES.has(name)) return LATIN1_ENTITIES.get(name);
        const extra = { quot: '"', apos: "'", lt: "<", gt: ">", amp: "&" };
        return name in extra ? extra[name] : whole;
      })
      // &amp; gỡ sau cùng, nếu không "&amp;lt;" thành "<" một cách sai.
      .replace(/&amp;/g, "&")
  );
}

function textOf(v) {
  if (v === undefined || v === null) return "";
  let raw;
  if (typeof v === "string") raw = v;
  else if (typeof v === "object" && "#text" in v) raw = String(v["#text"] ?? "");
  else raw = String(v);
  return decodeEntities(raw).trim();
}

async function fetchWithTimeout(url, ms = 20000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": UA },
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res;
  } finally {
    clearTimeout(timer);
  }
}

// ---------------------------------------------------------------- nguồn 1
async function fetchGoogleTrendsVN() {
  const res = await fetchWithTimeout("https://trends.google.com/trending/rss?geo=VN");
  const parsed = parser.parse(await res.text());
  return toArray(parsed?.rss?.channel?.item).map((item) => ({
    keyword: textOf(item.title),
    approxTraffic: textOf(item["ht:approx_traffic"]),
    articles: toArray(item["ht:news_item"]).map((n) => ({
      title: textOf(n["ht:news_item_title"]),
      url: textOf(n["ht:news_item_url"]),
      source: textOf(n["ht:news_item_source"]),
    })),
  }));
}

// ---------------------------------------------------------------- nguồn 2
async function fetchYouTubeTrendingVN() {
  const key = process.env.YOUTUBE_API_KEY;
  if (!key) return { skipped: "chưa đặt YOUTUBE_API_KEY", videos: [] };

  const url =
    "https://www.googleapis.com/youtube/v3/videos" +
    "?part=snippet,statistics&chart=mostPopular&regionCode=VN" +
    `&maxResults=25&key=${encodeURIComponent(key)}`;
  const res = await fetchWithTimeout(url);
  const data = await res.json();
  const videos = (data.items ?? []).map((v) => ({
    videoId: v.id,
    title: v.snippet?.title ?? "",
    channel: v.snippet?.channelTitle ?? "",
    publishedAt: v.snippet?.publishedAt ?? "",
    views: Number(v.statistics?.viewCount ?? 0),
    url: `https://www.youtube.com/watch?v=${v.id}`,
  }));
  return { skipped: null, videos };
}

// ---------------------------------------------------------------- nguồn 3
async function fetchRssFeed(feed) {
  const res = await fetchWithTimeout(feed.url);
  const parsed = parser.parse(await res.text());
  return toArray(parsed?.rss?.channel?.item)
    .slice(0, 40)
    .map((item) => ({
      title: textOf(item.title),
      url: textOf(item.link),
      source: feed.name,
      pubDate: textOf(item.pubDate),
    }));
}

// ---------------------------------------------------------------- hàng đợi
/** Đề tài đã có trong DB ở N ngày gần nhất — để lọc trùng. */
function readRecentTopics(sinceMs) {
  const since = new Date(sinceMs).toISOString().replace("Z", "+00:00");
  const rows = sql(
    `SELECT topic FROM research_requests WHERE createdAt >= ${quote(since)};`,
    { json: true },
  );
  return rows.map((r) => r.topic);
}

const normalize = (s) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();

function makeRequest(topic, urls, notes) {
  return { topic, urls, notes };
}

// ---------------------------------------------------------------- main
async function main() {
  const startedAt = new Date();
  console.log(`[collect-trends] bắt đầu ${startedAt.toISOString()}`);

  const [gRes, ytRes, ...rssResults] = await Promise.allSettled([
    fetchGoogleTrendsVN(),
    fetchYouTubeTrendingVN(),
    ...RSS_FEEDS.map(fetchRssFeed),
  ]);

  // --- Google Trends
  let googleTrends = [];
  if (gRes.status === "fulfilled") {
    googleTrends = gRes.value;
    console.log(`  ✓ Google Trends VN: ${googleTrends.length} từ khoá`);
  } else {
    console.error(`  ✗ Google Trends VN thất bại: ${gRes.reason?.message ?? gRes.reason}`);
  }

  // --- YouTube
  let youtube = [];
  if (ytRes.status === "fulfilled") {
    if (ytRes.value.skipped) {
      console.log(`  – YouTube Trending VN: bỏ qua (${ytRes.value.skipped})`);
    } else {
      youtube = ytRes.value.videos;
      console.log(`  ✓ YouTube Trending VN: ${youtube.length} video`);
    }
  } else {
    console.error(`  ✗ YouTube thất bại: ${ytRes.reason?.message ?? ytRes.reason}`);
  }

  // --- RSS
  const headlines = [];
  rssResults.forEach((r, i) => {
    const feed = RSS_FEEDS[i];
    if (r.status === "fulfilled") {
      headlines.push(...r.value);
      console.log(`  ✓ ${feed.name}: ${r.value.length} tin`);
    } else {
      console.error(`  ✗ ${feed.name} thất bại: ${r.reason?.message ?? r.reason}`);
    }
  });

  if (!googleTrends.length && !youtube.length && !headlines.length) {
    console.error("[collect-trends] LỖI: không lấy được dữ liệu từ bất kỳ nguồn nào.");
    process.exitCode = 1;
    return;
  }

  // --- dựng đề tài ứng viên
  const candidates = [];

  let skippedNoise = 0;
  const usableTrends = googleTrends.filter((t) => {
    if (!t.keyword) return false;
    if (isNoise(t.keyword)) {
      skippedNoise++;
      return false;
    }
    return true;
  });
  if (skippedNoise) {
    console.log(`  · lọc bỏ ${skippedNoise} từ khoá rác (xổ số, giá vàng, quá ngắn...)`);
  }

  for (const t of usableTrends.slice(0, MAX_GOOGLE)) {
    candidates.push(
      makeRequest(
        t.keyword,
        t.articles.map((a) => a.url).filter(Boolean),
        [
          `[Google Trends VN] lượt tìm kiếm: ${t.approxTraffic || "n/a"}`,
          ...t.articles.map((a) => `• ${a.title} (${a.source})`),
        ].join("\n"),
      ),
    );
  }

  for (const v of youtube.slice(0, MAX_YOUTUBE)) {
    if (!v.title) continue;
    candidates.push(
      makeRequest(v.title, [v.url], [
        `[YouTube Trending VN] kênh: ${v.channel}`,
        `Lượt xem: ${v.views.toLocaleString("vi-VN")}`,
      ].join("\n")),
    );
  }

  // Tin quốc tế — nguồn đề tài chính của trang. Lấy luân phiên giữa các hãng
  // để không hãng nào chiếm hết hàng đợi.
  const byFeed = new Map();
  for (const h of headlines) {
    if (!h.title || !h.url) continue;
    if (!byFeed.has(h.source)) byFeed.set(h.source, []);
    byFeed.get(h.source).push(h);
  }
  const roundRobin = [];
  // Đảo thứ tự nguồn: vòng round-robin luôn bắt đầu từ đầu danh sách, để
  // nguyên thì mấy nguồn cuối gần như không bao giờ được chọn.
  const lists = [...byFeed.values()].sort(() => Math.random() - 0.5);
  for (let i = 0; roundRobin.length < MAX_HEADLINES; i++) {
    let addedThisRound = false;
    for (const list of lists) {
      if (i < list.length) {
        roundRobin.push(list[i]);
        addedThisRound = true;
        if (roundRobin.length >= MAX_HEADLINES) break;
      }
    }
    if (!addedThisRound) break;
  }

  for (const h of roundRobin) {
    candidates.push(
      makeRequest(h.title, [h.url], `[${h.source}] tin quốc tế${h.pubDate ? ` · ${h.pubDate}` : ""}`),
    );
  }

  // --- lọc trùng
  const cutoff = Date.now() - DEDUPE_DAYS * 24 * 60 * 60 * 1000;
  const seen = new Set(readRecentTopics(cutoff).map(normalize));

  const fresh = [];
  for (const c of candidates) {
    const key = normalize(c.topic);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    fresh.push(c);
  }

  console.log(
    `\n[collect-trends] ${candidates.length} ứng viên → ${fresh.length} đề tài mới ` +
      `(${candidates.length - fresh.length} trùng, bỏ qua)`,
  );
  fresh.forEach((r) => console.log(`   + ${r.topic}`));

  if (DRY_RUN) {
    console.log("\n[collect-trends] DRY RUN — không ghi gì.");
    return;
  }

  if (fresh.length > 0) {
    const stamp = nowStamp();
    const values = fresh
      .map((r) =>
        "(" +
        [
          quote(randomUUID()),
          quote(r.topic),
          // SQLite không có kiểu mảng: cột urls giữ chuỗi JSON, như lib/queue.ts.
          quote(JSON.stringify(r.urls ?? [])),
          quote(r.notes ?? ""),
          "'pending'",
          "'[]'",
          quote(stamp),
          quote(stamp),
        ].join(", ") +
        ")",
      )
      .join(",");
    sql(
      "INSERT INTO research_requests " +
        "(id, topic, urls, notes, status, articleIds, createdAt, updatedAt) VALUES " +
        values +
        ";",
    );
  }

  // Dữ liệu thô vẫn ghi ra file để tra cứu khi viết bài.
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(
    DIGEST_FILE,
    JSON.stringify(
      {
        collectedAt: startedAt.toISOString(),
        googleTrendsVN: googleTrends,
        youtubeTrendingVN: youtube,
        internationalHeadlines: headlines,
      },
      null,
      2,
    ),
    "utf8",
  );

  console.log(`\n[collect-trends] đã ghi ${fresh.length} đề tài vào database`);
  console.log(`[collect-trends] ảnh chụp dữ liệu thô: ${DIGEST_FILE}`);
  console.log("[collect-trends] mở /admin/research để duyệt.");
}

main().catch((err) => {
  console.error("[collect-trends] LỖI KHÔNG BẮT ĐƯỢC:", err);
  process.exitCode = 1;
});
