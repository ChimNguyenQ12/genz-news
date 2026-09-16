#!/usr/bin/env node
/**
 * Thu thập xu hướng hằng ngày → ghi vào hàng đợi đề tài của toà soạn.
 *
 *   npm run collect-trends
 *
 * Săn ĐỀ TÀI ĐANG NÓNG, không phải quét đều mặt báo. Vòng cũ lấy tin luân
 * phiên đều tay giữa các feed RSS, nên tin nội bộ ngành ("CEO Automattic quay
 * lại ghế") hay tin nghi lễ ở nước xa ("đám tang vua Oyo ở Uganda") vào hàng
 * đợi ngang hàng với chuyện cả nước đang bàn. Giờ mọi ứng viên đều bị chấm
 * điểm ở scripts/lib/topic-filter.mjs rồi mới chọn, và đề tài Việt Nam chiếm
 * hạn ngạch 70%.
 *
 * Nguồn (đều hợp pháp, không scrape nền tảng cấm bot):
 *   1. Google Trends VN     — lượt tìm kiếm thật của người Việt hôm nay
 *   2. Google Trends toàn cầu — cùng feed đó, geo khác, cho phần quốc tế
 *   3. YouTube Trending VN  — API chính thức, cần YOUTUBE_API_KEY
 *   4. Reddit hot           — JSON công khai; r/popular và r/VietNam là hai
 *                             chỗ đo "đang được bàn" tốt nhất mà không cần key
 *   5. Google News search   — mọi bài báo nước ngoài có nhắc Việt Nam
 *   6. RSS báo Việt + quốc tế — feed công khai do chính các hãng cung cấp
 *
 * Facebook/TikTok/X không có API công khai cho phần trending, mà cào thì trái
 * điều khoản của họ và trái hiến chương — nên không lấy trực tiếp. Phần lớn
 * thứ nóng trên các nền tảng đó vẫn hiện ra ở Google Trends VN (người ta search
 * sau khi thấy trên phây) và ở tin giải trí của báo Việt, nên vẫn bắt được.
 *
 * Kết quả:
 *   - bảng research_requests    ← thêm đề tài mới, trạng thái "pending"
 *   - data/trends-digest.json   ← ảnh chụp toàn bộ dữ liệu thô hôm nay
 *
 * Biến môi trường (tùy chọn):
 *   YOUTUBE_API_KEY      bật nguồn YouTube Trending
 *   TRENDS_MAX_TOPICS    tổng số đề tài ghi vào hàng đợi (mặc định 18)
 *   TRENDS_VN_SHARE      tỷ lệ đề tài Việt Nam (mặc định 0.7)
 *   TRENDS_MIN_SCORE     điểm nóng tối thiểu để được nhận (mặc định 0)
 *   TRENDS_MIN_SCORE_INTL  ngưỡng riêng, cao hơn, cho đề tài quốc tế (mặc định 20)
 *   TRENDS_GLOBAL_GEO    geo cho Google Trends quốc tế (mặc định US)
 *   REDDIT_CLIENT_ID     khoá "script app" miễn phí ở reddit.com/prefs/apps —
 *   REDDIT_CLIENT_SECRET không có thì lối ẩn danh hay bị chặn bot
 *   TRENDS_REDDIT=0      tắt hẳn nguồn Reddit
 *   TRENDS_DEDUPE_DAYS   bỏ qua đề tài đã có trong N ngày (mặc định 7)
 *   TRENDS_DRY_RUN=1     chỉ in ra, không ghi file
 *   TRENDS_EXPLAIN=1     in cả những đề tài bị loại và lý do
 */

import fs from "fs/promises";
import path from "path";
import { XMLParser } from "fast-xml-parser";
import { execFileSync } from "child_process";
import { randomUUID } from "crypto";
import {
  dedupeKey,
  isNoise,
  pickWithQuota,
  sameStory,
  scoreTopic,
  volumeBonus,
} from "./lib/topic-filter.mjs";

const ROOT = process.cwd();
const DATA_DIR = process.env.DATA_DIR ?? path.join(ROOT, "data");
const DB = process.env.DATABASE_PATH ?? path.join(DATA_DIR, "app.db");
const DIGEST_FILE = path.join(DATA_DIR, "trends-digest.json");

const quote = (v) => "'" + String(v).replace(/'/g, "''") + "'";

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

const MAX_TOPICS = Number(process.env.TRENDS_MAX_TOPICS ?? 18);
const VN_SHARE = Number(process.env.TRENDS_VN_SHARE ?? 0.7);
const MIN_SCORE = Number(process.env.TRENDS_MIN_SCORE ?? 0);
const MIN_SCORE_INTL = Number(process.env.TRENDS_MIN_SCORE_INTL ?? 20);
const GLOBAL_GEO = process.env.TRENDS_GLOBAL_GEO ?? "US";
const USE_REDDIT = process.env.TRENDS_REDDIT !== "0";
const DEDUPE_DAYS = Number(process.env.TRENDS_DEDUPE_DAYS ?? 7);
const DRY_RUN = process.env.TRENDS_DRY_RUN === "1";
const EXPLAIN = process.env.TRENDS_EXPLAIN === "1";
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36";

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  textNodeName: "#text",
  // Vài báo Việt nhét thực thể HTML vào tít RSS ("qu&ecirc;" thay vì "quê").
  // Không bật cái này thì đề tài lưu xuống còn nguyên mã, đọc không ra chữ.
  htmlEntities: true,
});

/**
 * Giữ đồng bộ thủ công với lib/sources/rss.ts (script chạy độc lập bằng Node
 * nên không import trực tiếp file TypeScript của app).
 *
 * `origin` quyết định điểm khởi đầu khi chấm: feed Việt vào thẳng rổ 70%, feed
 * quốc tế phải tự kiếm điểm bằng nội dung của nó.
 */
const RSS_FEEDS = [
  // --- Quốc tế: tin thế giới & Châu Á
  { name: "BBC World", url: "https://feeds.bbci.co.uk/news/world/rss.xml", origin: "rss-intl" },
  { name: "The Guardian World", url: "https://www.theguardian.com/world/rss", origin: "rss-intl" },
  { name: "Al Jazeera", url: "https://www.aljazeera.com/xml/rss/all.xml", origin: "rss-intl" },
  { name: "NYT World", url: "https://rss.nytimes.com/services/xml/rss/nyt/World.xml", origin: "rss-intl" },
  { name: "SCMP Asia", url: "https://www.scmp.com/rss/91/feed", origin: "rss-intl" },
  // --- Quốc tế: công nghệ, AI, Game, Văn hoá mạng Gen Z
  { name: "The Verge", url: "https://www.theverge.com/rss/index.xml", origin: "rss-intl" },
  { name: "TechCrunch", url: "https://techcrunch.com/feed/", origin: "rss-intl" },
  { name: "WIRED", url: "https://www.wired.com/feed/rss", origin: "rss-intl" },
  { name: "Ars Technica", url: "https://feeds.arstechnica.com/arstechnica/index", origin: "rss-intl" },
  { name: "Dexerto (Gaming & Culture)", url: "https://www.dexerto.com/feed/", origin: "rss-intl" },
  // --- Việt Nam
  { name: "BBC Tiếng Việt", url: "https://feeds.bbci.co.uk/vietnamese/rss.xml", origin: "rss-vn" },
  { name: "VnExpress Tin Mới", url: "https://vnexpress.net/rss/tin-moi-nhat.rss", origin: "rss-vn" },
  { name: "VnExpress Thế giới", url: "https://vnexpress.net/rss/the-gioi.rss", origin: "rss-vn" },
  { name: "VnExpress Số hoá", url: "https://vnexpress.net/rss/so-hoa.rss", origin: "rss-vn" },
  { name: "VnExpress Giải trí", url: "https://vnexpress.net/rss/giai-tri.rss", origin: "rss-vn" },
  { name: "Thanh Niên Giới trẻ", url: "https://thanhnien.vn/rss/gioi-tre.rss", origin: "rss-vn" },
  { name: "Thanh Niên Công nghệ", url: "https://thanhnien.vn/rss/cong-nghe.rss", origin: "rss-vn" },
  { name: "Tuổi Trẻ Nhịp sống trẻ", url: "https://tuoitre.vn/rss/nhip-song-tre.rss", origin: "rss-vn" },
  { name: "Kênh14 Star", url: "https://kenh14.vn/star.rss", origin: "rss-vn" },
  { name: "Znews Công nghệ", url: "https://znews.vn/rss/cong-nghe.rss", origin: "rss-vn" },
];

/**
 * Reddit: JSON công khai, không cần khoá, chỉ cần User-Agent tử tế. Đây là chỗ
 * đo "đang được bàn" rẻ nhất hiện có — số upvote là phiếu thật của người đọc,
 * khác hẳn feed RSS vốn chỉ nói toà soạn vừa đăng gì.
 *
 * r/VietNam và r/TroChuyenLinhTinh là hai diễn đàn tiếng Việt/về Việt Nam đông
 * nhất trên nền tảng này.
 */
const SUBREDDITS = [
  { sub: "popular", minUps: 5000 },
  { sub: "worldnews", minUps: 3000 },
  { sub: "technology", minUps: 2000 },
  { sub: "todayilearned", minUps: 3000 },
  { sub: "Damnthatsinteresting", minUps: 3000 },
  { sub: "VietNam", minUps: 150 },
  { sub: "TroChuyenLinhTinh", minUps: 150 },
];

/**
 * Google News search: cách duy nhất bắt được "báo nước ngoài nào vừa viết gì
 * có chữ Việt Nam" mà không phải đăng ký từng hãng một.
 *
 * Link trả về là link chuyển hướng của news.google.com. Nó dùng để LẦN RA bài
 * gốc, không được tính là nguồn — newsroom-save.mjs đã xếp news.google.com vào
 * nhóm trang tổng hợp, nên nó không đếm vào mức tối thiểu 1 nguồn.
 */
/**
 * Mỗi truy vấn nhắm một mảng đề tài khác nhau. Trước đây chỉ có 4 truy vấn mà
 * 2 trong số đó là Trung Quốc/Biển Đông, nên rổ ứng viên đã lệch sẵn từ gốc —
 * chấm điểm xong lại cộng thêm ưu tiên cho đúng nhóm ấy, thành ra hàng đợi
 * gần như chỉ còn tin Việt - Trung. Trần theo mảng ở topic-filter.mjs chặn
 * phía sau, nhưng chặn cũng vô nghĩa nếu rổ không có gì khác để chọn.
 *
 * Dùng hl=vi cho mấy truy vấn tiếng Việt: Google News trả về báo trong nước,
 * bổ sung cho phần RSS vốn chỉ có vài tờ.
 */
const GOOGLE_NEWS_QUERIES = [
  // --- nhóm ưu tiên
  { label: "Việt Nam – Trung Quốc", q: "Vietnam China when:3d" },
  { label: "Biển Đông", q: '"South China Sea" when:3d' },
  // --- Việt Nam nói chung, trên báo nước ngoài
  { label: "Việt Nam trên báo nước ngoài", q: "Vietnam when:2d" },
  // --- các mảng đời sống, để hàng đợi không chỉ có chuyện biển đảo
  { label: "Kinh tế Việt Nam", q: "Vietnam economy OR investment OR export when:3d" },
  { label: "Lao động, việc làm", q: "Vietnam jobs OR wages OR workers when:4d" },
  {
    label: "Giao thông, hạ tầng",
    q: "Vietnam metro OR railway OR airport OR expressway when:4d",
  },
  {
    label: "Chính sách, chính trị",
    q: "Vietnam policy OR government OR reform when:3d",
  },
  { label: "Giáo dục, du học", q: "Vietnam education OR students OR university when:4d" },
  { label: "Du lịch", q: "Vietnam tourism OR travel OR tourists when:4d" },
  { label: "Công nghệ Việt Nam", q: "Vietnam technology OR startup OR AI when:3d" },
  // --- báo trong nước, tiếng Việt
  { label: "Kinh tế trong nước", q: "kinh tế Việt Nam when:2d", hl: "vi" },
  { label: "Giao thông trong nước", q: "giao thông hạ tầng when:2d", hl: "vi" },
  { label: "Giáo dục trong nước", q: "giáo dục học phí tuyển sinh when:2d", hl: "vi" },
  { label: "Đời sống giới trẻ", q: "giới trẻ việc làm lương when:3d", hl: "vi" },
];

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

// ---------------------------------------------------------------- nguồn 1+2
async function fetchGoogleTrends(geo) {
  const res = await fetchWithTimeout(
    `https://trends.google.com/trending/rss?geo=${encodeURIComponent(geo)}`,
  );
  const parsed = parser.parse(await res.text());
  return toArray(parsed?.rss?.channel?.item).map((item) => ({
    geo,
    keyword: textOf(item.title),
    approxTraffic: textOf(item["ht:approx_traffic"]),
    articles: toArray(item["ht:news_item"]).map((n) => ({
      title: textOf(n["ht:news_item_title"]),
      url: textOf(n["ht:news_item_url"]),
      source: textOf(n["ht:news_item_source"]),
    })),
  }));
}

// ---------------------------------------------------------------- nguồn 3
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

// ---------------------------------------------------------------- nguồn 4
/**
 * Vé vào cửa Reddit.
 *
 * Endpoint .json ẩn danh giờ hay trả về trang HTML "Welcome to Reddit" kèm mã
 * 200 thay vì JSON — chặn bot mềm, và nó chặn theo địa chỉ IP nên chạy được ở
 * máy này không có nghĩa là chạy được ở máy chủ. Đường chính thức là đăng ký
 * một "script app" miễn phí ở https://www.reddit.com/prefs/apps rồi đặt
 * REDDIT_CLIENT_ID / REDDIT_CLIENT_SECRET. Có khoá thì đi lối oauth.reddit.com,
 * không có thì vẫn thử lối ẩn danh và chịu rủi ro bị chặn.
 *
 * Lấy một lần rồi dùng chung cho mọi subreddit — mỗi lần xin vé là một lần gọi.
 */
let redditTokenPromise = null;
function redditToken() {
  const id = process.env.REDDIT_CLIENT_ID;
  const secret = process.env.REDDIT_CLIENT_SECRET;
  if (!id || !secret) return Promise.resolve(null);
  if (!redditTokenPromise) {
    redditTokenPromise = (async () => {
      const res = await fetch("https://www.reddit.com/api/v1/access_token", {
        method: "POST",
        headers: {
          Authorization: "Basic " + Buffer.from(`${id}:${secret}`).toString("base64"),
          "Content-Type": "application/x-www-form-urlencoded",
          "User-Agent": UA,
        },
        body: "grant_type=client_credentials",
      });
      if (!res.ok) throw new Error(`xin token hỏng: HTTP ${res.status}`);
      const data = await res.json();
      if (!data.access_token) throw new Error("phản hồi token không có access_token");
      return data.access_token;
    })();
  }
  return redditTokenPromise;
}

/**
 * Bài hot của một subreddit. Bỏ bài ghim (thông báo nội quy, không phải tin),
 * bỏ bài NSFW, và bỏ bài dưới ngưỡng upvote — dưới ngưỡng thì "hot" chỉ là
 * hot trong vài chục người.
 */
async function fetchRedditHot({ sub, minUps }) {
  const token = await redditToken();
  const url = token
    ? `https://oauth.reddit.com/r/${sub}/hot?limit=30&raw_json=1`
    // old.reddit.com chứ không phải www: cùng một JSON, nhưng chứng chỉ TLS của
    // www.reddit.com hỏng trên vài máy (Node báo "certificate has expired").
    : `https://old.reddit.com/r/${sub}/hot.json?limit=30&raw_json=1`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20000);
  let res;
  try {
    res = await fetch(url, {
      headers: token
        ? { Authorization: `Bearer ${token}`, "User-Agent": UA }
        : { "User-Agent": UA },
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
  if (!res.ok) throw new Error(`HTTP ${res.status}`);

  // Trang chặn bot về với mã 200 và content-type text/html. Bắt ở đây để báo
  // đúng bệnh, thay vì để JSON.parse chết với "Unexpected token '<'".
  if (!String(res.headers.get("content-type") ?? "").includes("json")) {
    throw new Error(
      "Reddit trả về HTML chứ không phải JSON (chặn bot ẩn danh) — " +
      "đặt REDDIT_CLIENT_ID/REDDIT_CLIENT_SECRET hoặc TRENDS_REDDIT=0",
    );
  }

  const data = await res.json();
  return (data?.data?.children ?? [])
    .map((c) => c.data ?? {})
    .filter((p) => p.title && !p.stickied && !p.over_18 && (p.score ?? 0) >= minUps)
    .map((p) => ({
      sub,
      title: p.title,
      ups: p.score ?? 0,
      comments: p.num_comments ?? 0,
      // Bài dẫn link ngoài thì lấy link gốc; bài tự viết thì lấy link thảo luận.
      url: p.is_self ? `https://www.reddit.com${p.permalink}` : p.url_overridden_by_dest || p.url,
      permalink: `https://www.reddit.com${p.permalink}`,
    }));
}

// ---------------------------------------------------------------- nguồn 5
/**
 * Google News RSS. Tít về dạng "Tít bài - Tên báo" và tên báo lặp lại ở thẻ
 * <source>; cắt đuôi đó đi để đề tài trong hàng đợi đọc cho sạch.
 */
async function fetchGoogleNews({ label, q, hl }) {
  // hl="vi" cho ra báo trong nước, mặc định cho ra báo tiếng Anh. Cùng một
  // truy vấn ở hai thứ tiếng trả về hai rổ bài gần như không giao nhau.
  const locale =
    hl === "vi" ? "hl=vi&gl=VN&ceid=VN:vi" : "hl=en-US&gl=US&ceid=US:en";
  const url =
    "https://news.google.com/rss/search?q=" + encodeURIComponent(q) + "&" + locale;
  const res = await fetchWithTimeout(url);
  const parsed = parser.parse(await res.text());
  return toArray(parsed?.rss?.channel?.item)
    .slice(0, 25)
    .map((item) => {
      const publisher = textOf(item.source);
      let title = textOf(item.title);
      if (publisher && title.endsWith(` - ${publisher}`)) {
        title = title.slice(0, -(publisher.length + 3)).trim();
      }
      return {
        query: label,
        title,
        publisher,
        url: textOf(item.link),
        pubDate: textOf(item.pubDate),
      };
    })
    .filter((h) => h.title && h.url);
}

// ---------------------------------------------------------------- nguồn 6
async function fetchRssFeed(feed) {
  const res = await fetchWithTimeout(feed.url);
  const parsed = parser.parse(await res.text());
  return toArray(parsed?.rss?.channel?.item)
    .slice(0, 40)
    .map((item) => ({
      title: textOf(item.title),
      url: textOf(item.link),
      source: feed.name,
      origin: feed.origin,
      pubDate: textOf(item.pubDate),
    }));
}

// ---------------------------------------------------------------- nguồn 7: Hacker News (Tin AI & Công nghệ nóng toàn cầu)
async function fetchHackerNewsTop() {
  try {
    const res = await fetchWithTimeout(
      "https://hacker-news.firebaseio.com/v0/topstories.json",
      10000,
    );
    const ids = (await res.json()).slice(0, 15);
    const settled = await Promise.allSettled(
      ids.map(async (id) => {
        const itemRes = await fetchWithTimeout(
          `https://hacker-news.firebaseio.com/v0/item/${id}.json`,
          6000,
        );
        return itemRes.json();
      }),
    );
    return settled
      .filter(
        (r) =>
          r.status === "fulfilled" &&
          r.value?.title &&
          (r.value?.score ?? 0) >= 80,
      )
      .map((r) => ({
        title: r.value.title,
        url: r.value.url || `https://news.ycombinator.com/item?id=${r.value.id}`,
        source: "Hacker News",
        origin: "rss-intl",
        pubDate: new Date((r.value.time ?? 0) * 1000).toISOString(),
      }));
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------- hàng đợi
/**
 * Đề tài đã có trong DB ở N ngày gần nhất — để lọc trùng.
 *
 * Ở chế độ DRY_RUN, đọc hỏng thì chỉ cảnh báo rồi đi tiếp: máy Windows hay kèm
 * sqlite3 cũ không có tuỳ chọn -json, mà dry run vốn chỉ để xem nguồn chấm
 * điểm ra sao. Lượt ghi thật thì vẫn phải hỏng to — bỏ lọc trùng lúc đó nghĩa
 * là đổ lại cả hàng đợi hôm qua vào hôm nay.
 */
function readRecentTopics(sinceMs) {
  const since = new Date(sinceMs).toISOString().replace("Z", "+00:00");
  try {
    const rows = sql(
      `SELECT topic FROM research_requests WHERE createdAt >= ${quote(since)};`,
      { json: true },
    );
    return rows.map((r) => r.topic);
  } catch (err) {
    if (!DRY_RUN) throw err;
    console.warn(
      `  ! không đọc được hàng đợi cũ (${err.message.split("\n")[0]}) — ` +
      "dry run bỏ qua bước lọc trùng",
    );
    return [];
  }
}

/** Nhãn tiếng Việt cho mảng đề tài, để dòng [xếp loại] đọc được ngay. */
const CATEGORY_LABEL = {
  // Gom cả chủ quyền lẫn "Trung Quốc làm gì ảnh hưởng tới Việt Nam", nên nhãn phải
  // nói đúng cả hai: một tin nhập ethanol từ SDIC không phải tin chủ quyền.
  "chu-quyen": "Việt–Trung / chủ quyền",
  "kinh-te": "kinh tế",
  "giao-thong": "giao thông",
  "chinh-tri": "chính trị",
  "giao-duc": "giáo dục",
  "cong-nghe": "công nghệ",
  "giai-tri": "giải trí",
  "the-thao": "thể thao",
  "doi-song": "đời sống",
  khac: "khác",
};

/**
 * Dựng một ứng viên đã kèm điểm. Điểm và lý do được ghi luôn vào `notes` để
 * tổng biên tập mở /admin/research là thấy vì sao đề tài này lọt vào, và để
 * phóng viên AI biết góc nào đang được quan tâm.
 */
function candidate({
  topic,
  urls = [],
  notes = "",
  extra = "",
  origin,
  bonus = 0,
  spreadKey,
}) {
  const verdict = scoreTopic({ topic, extra, origin, bonus });
  const tags = [
    `điểm nóng ${verdict.score}`,
    verdict.vietnam ? "Việt Nam" : "quốc tế",
    CATEGORY_LABEL[verdict.category] ?? verdict.category,
    verdict.priority ? "ƯU TIÊN" : null,
  ].filter(Boolean);
  return {
    topic,
    urls: urls.filter(Boolean),
    notes: [notes, `[xếp loại] ${tags.join(" · ")}`, verdict.reasons.length ? `Vì sao: ${verdict.reasons.join("; ")}` : null]
      .filter(Boolean)
      .join("\n"),
    origin,
    // Khoá dàn trải, tách hẳn khỏi `origin`. `origin` quyết định ĐIỂM nên phải
    // thô; khoá này quyết định TRẦN SUẤT nên phải mịn.
    //
    // Cả  14 truy vấn Google News cùng một `origin`, nên chúng tranh nhau đúng
    // 6 suất — mà 6 suất ấy luôn bị nhóm Việt–Trung 96 điểm thắng sạch.
    // Mọi truy vấn kinh tế, giao thông, chính trị thêm vào đều bị khoá ngoài
    // cửa dù điểm đủ cao. Tách ra thì mỗi truy vấn, mỗi tờ báo có phần riêng.
    spreadKey: spreadKey ?? origin,
    ...verdict,
  };
}

// ---------------------------------------------------------------- main
async function main() {
  const startedAt = new Date();
  console.log(`[collect-trends] bắt đầu ${startedAt.toISOString()}`);

  const redditJobs = USE_REDDIT ? SUBREDDITS : [];
  const [gVnRes, gGlobalRes, ytRes, hnRes, ...rest] = await Promise.allSettled([
    fetchGoogleTrends("VN"),
    fetchGoogleTrends(GLOBAL_GEO),
    fetchYouTubeTrendingVN(),
    fetchHackerNewsTop(),
    ...redditJobs.map(fetchRedditHot),
    ...GOOGLE_NEWS_QUERIES.map(fetchGoogleNews),
    ...RSS_FEEDS.map(fetchRssFeed),
  ]);
  const redditResults = rest.slice(0, redditJobs.length);
  const gnewsResults = rest.slice(redditJobs.length, redditJobs.length + GOOGLE_NEWS_QUERIES.length);
  const rssResults = rest.slice(redditJobs.length + GOOGLE_NEWS_QUERIES.length);

  const settled = (res, label, onOk) => {
    if (res.status === "fulfilled") return onOk(res.value);
    console.error(`  ✗ ${label} thất bại: ${res.reason?.message ?? res.reason}`);
    return undefined;
  };

  // --- Google Trends VN + toàn cầu
  let googleTrendsVN = [];
  settled(gVnRes, "Google Trends VN", (v) => {
    googleTrendsVN = v;
    console.log(`  ✓ Google Trends VN: ${v.length} từ khoá`);
  });

  let googleTrendsGlobal = [];
  settled(gGlobalRes, `Google Trends ${GLOBAL_GEO}`, (v) => {
    googleTrendsGlobal = v;
    console.log(`  ✓ Google Trends ${GLOBAL_GEO}: ${v.length} từ khoá`);
  });

  // --- YouTube
  let youtube = [];
  settled(ytRes, "YouTube Trending VN", (v) => {
    if (v.skipped) {
      console.log(`  – YouTube Trending VN: bỏ qua (${v.skipped})`);
      return;
    }
    youtube = v.videos;
    console.log(`  ✓ YouTube Trending VN: ${v.videos.length} video`);
  });

  // --- RSS & Headlines
  const headlines = [];

  // --- Hacker News
  settled(hnRes, "Hacker News Top Stories", (v) => {
    if (v && v.length) {
      headlines.push(...v);
      console.log(`  ✓ Hacker News (Tech/AI): ${v.length} tin`);
    }
  });

  // --- Reddit
  const reddit = [];
  redditResults.forEach((r, i) => {
    const { sub } = redditJobs[i];
    settled(r, `Reddit r/${sub}`, (v) => {
      reddit.push(...v);
      console.log(`  ✓ Reddit r/${sub}: ${v.length} bài nóng`);
    });
  });
  if (!USE_REDDIT) console.log("  – Reddit: tắt (TRENDS_REDDIT=0)");

  // --- Google News
  const gnews = [];
  gnewsResults.forEach((r, i) => {
    const { label } = GOOGLE_NEWS_QUERIES[i];
    settled(r, `Google News "${label}"`, (v) => {
      gnews.push(...v);
      console.log(`  ✓ Google News "${label}": ${v.length} tin`);
    });
  });

  // --- RSS
  rssResults.forEach((r, i) => {
    const feed = RSS_FEEDS[i];
    settled(r, feed.name, (v) => {
      headlines.push(...v);
      console.log(`  ✓ ${feed.name}: ${v.length} tin`);
    });
  });

  if (!googleTrendsVN.length && !youtube.length && !headlines.length &&
    !reddit.length && !gnews.length) {
    console.error("[collect-trends] LỖI: không lấy được dữ liệu từ bất kỳ nguồn nào.");
    process.exitCode = 1;
    return;
  }

  // --- dựng đề tài ứng viên, ai cũng bị chấm điểm như nhau
  const pool = [];

  let skippedNoise = 0;
  const trendCandidates = [
    ...googleTrendsVN.map((t) => ({ t, origin: "google-trends-vn", geo: "VN" })),
    ...googleTrendsGlobal.map((t) => ({ t, origin: "google-trends-global", geo: GLOBAL_GEO })),
  ];
  for (const { t, origin, geo } of trendCandidates) {
    if (!t.keyword) continue;
    if (isNoise(t.keyword)) {
      skippedNoise++;
      continue;
    }
    pool.push(
      candidate({
        topic: t.keyword,
        urls: t.articles.map((a) => a.url),
        origin,
        // Lượt tìm kiếm là thước đo độ nóng thật nhất trong cả mớ nguồn này.
        bonus: volumeBonus(t.approxTraffic, { cap: 25, floor: 1000 }),
        // Từ khoá Google Trends thường chỉ là một cái tên ("90 phút"), không
        // đủ để chấm. Tít các bài đang đưa tin về nó mới nói ra chuyện gì.
        extra: t.articles.map((a) => a.title).join("\n"),
        notes: [
          `[Google Trends ${geo}] lượt tìm kiếm: ${t.approxTraffic || "n/a"}`,
          ...t.articles.map((a) => `• ${a.title} (${a.source})`),
        ].join("\n"),
      }),
    );
  }
  if (skippedNoise) {
    console.log(`  · lọc bỏ ${skippedNoise} từ khoá rác (xổ số, giá vàng, quá ngắn...)`);
  }

  for (const v of youtube) {
    if (!v.title) continue;
    pool.push(
      candidate({
        topic: v.title,
        urls: [v.url],
        origin: "youtube-vn",
        bonus: volumeBonus(v.views, { cap: 15, floor: 100000 }),
        notes: [
          `[YouTube Trending VN] kênh: ${v.channel}`,
          `Lượt xem: ${v.views.toLocaleString("vi-VN")}`,
        ].join("\n"),
      }),
    );
  }

  for (const p of reddit) {
    pool.push(
      candidate({
        topic: p.title,
        urls: [p.url, p.permalink],
        origin: "reddit",
        spreadKey: `reddit:${p.sub}`,
        bonus: volumeBonus(p.ups, { cap: 20, floor: 500 }),
        notes: [
          `[Reddit r/${p.sub}] ${p.ups.toLocaleString("vi-VN")} upvote · ${p.comments} bình luận`,
          "Reddit chỉ là chỉ dấu đang được bàn — phải tìm nguồn tin chính thống trước khi viết.",
        ].join("\n"),
      }),
    );
  }

  for (const h of gnews) {
    pool.push(
      candidate({
        topic: h.title,
        urls: [h.url],
        origin: "google-news-vn",
        spreadKey: `gnews:${h.query}`,
        notes: [
          `[Google News · ${h.query}] báo gốc: ${h.publisher || "không rõ"}` +
          (h.pubDate ? ` · ${h.pubDate}` : ""),
          "Link trên là link chuyển hướng của Google News — mở ra rồi lấy URL bài gốc, " +
          "news.google.com KHÔNG tính là nguồn độc lập.",
        ].join("\n"),
      }),
    );
  }

  for (const h of headlines) {
    if (!h.title || !h.url) continue;
    pool.push(
      candidate({
        topic: h.title,
        urls: [h.url],
        origin: h.origin,
        spreadKey: `rss:${h.source}`,
        notes: `[${h.source}]${h.pubDate ? ` · ${h.pubDate}` : ""}`,
      }),
    );
  }

  // --- lọc trùng: trong chính mẻ này, và với những gì đã vào hàng đợi N ngày qua
  const cutoff = Date.now() - DEDUPE_DAYS * 24 * 60 * 60 * 1000;
  const recent = readRecentTopics(cutoff);
  const seen = new Set(recent.map(dedupeKey));
  const deduped = [];
  // Giữ riêng danh sách tít để so trùng GẦN ĐÚ NG. Xếp ứng viên theo điểm
  // giảm dần trước, để trong một chùm trùng thì bản điểm cao nhất được giữ lại.
  const titles = [...recent];
  let nearDupes = 0;
  for (const c of [...pool].sort((a, b) => b.score - a.score)) {
    const key = dedupeKey(c.topic);
    if (!key || seen.has(key)) continue;
    if (titles.some((t) => sameStory(c.topic, t))) {
      nearDupes++;
      continue;
    }
    seen.add(key);
    titles.push(c.topic);
    deduped.push(c);
  }
  if (nearDupes) {
    console.log(`  · gộp ${nearDupes} tít kể lại cùng một sự việc`);
  }

  // --- chọn theo điểm nóng + hạn ngạch 70/30
  const { picked, stats } = pickWithQuota(deduped, {
    max: MAX_TOPICS,
    vnShare: VN_SHARE,
    minScore: MIN_SCORE,
    minScoreIntl: MIN_SCORE_INTL,
  });

  console.log(
    `\n[collect-trends] ${pool.length} ứng viên → ${deduped.length} không trùng → ` +
    `${picked.length} được chọn`,
  );
  console.log(
    `  hạn ngạch: Việt Nam ${stats.vnTake}/${stats.vnAvailable} · ` +
    `quốc tế ${stats.intlTake}/${stats.intlAvailable} · ` +
    `${stats.belowMinScore} dưới ngưỡng (${MIN_SCORE} điểm, quốc tế ${MIN_SCORE_INTL}) · ` +
    `trần ${Math.round(stats.perOriginShare * 100)}% mỗi nguồn, ` +
    `${Math.round(stats.perCategoryShare * 100)}% mỗi mảng`,
  );
  console.log(
    "  mảng đề tài: " +
    Object.entries(stats.byCategory)
      .sort((x, y) => y[1] - x[1])
      .map(([k, n]) => `${CATEGORY_LABEL[k] ?? k} ${n}`)
      .join(" · "),
  );
  for (const c of picked) {
    console.log(
      `   + [${String(c.score).padStart(3)}] ${c.vietnam ? "VN " : "QT "}` +
      `${c.priority ? "★ " : "  "}${c.topic}  ` +
      `(${CATEGORY_LABEL[c.category] ?? c.category} · ${c.origin})`,
    );
  }

  if (EXPLAIN) {
    console.log("\n[collect-trends] đề tài BỊ LOẠI (điểm thấp nhất trước):");
    const pickedSet = new Set(picked.map((c) => c.topic));
    for (const c of deduped.filter((c) => !pickedSet.has(c.topic)).sort((a, b) => a.score - b.score)) {
      console.log(`   − [${String(c.score).padStart(4)}] ${c.topic}`);
      if (c.reasons.length) console.log(`          ${c.reasons.join("; ")}`);
    }
  }

  if (DRY_RUN) {
    console.log("\n[collect-trends] DRY RUN — không ghi gì.");
    return;
  }

  if (picked.length > 0) {
    // Đóng dấu thời gian GIÃN RA THEO THỨ HẠNG, đề tài điểm cao nhất là mới
    // nhất. Đây là chỗ duy nhất truyền được thứ hạng sang cho máy viết:
    // newsroom-next.mjs lấy đề tài bằng "ORDER BY createdAt DESC", mà cột
    // createdAt không có gì khác để phân biệt.
    //
    // Trước đây cả mẻ dùng CHUNG một mốc thời gian. Cột bằng nhau hết thì
    // SQLite đi ngược chỉ mục và trả về hàng chèn SAU CÙNG trước — tức đề tài
    // ĐIỂM THẤP NHẤT. Toàn bộ công chấm điểm bị lật ngược đúng ở bước giao
    // việc: lượt 14/09/2026 nhặt trúng bài quỹ đầu tư 33 điểm, đứng chót bảng,
    // trong khi sáu đề tài Việt - Trung 96 điểm nằm ngay trên nó.
    //
    // Lùi một giây mỗi bậc: đủ để sắp thứ tự, mà cả mẻ vẫn mới hơn hẳn hàng
    // đợi hôm trước.
    //
    // Định dạng phải là "2026-09-04T11:08:40.049+00:00" cho khớp với cách kho
    // dữ liệu ghi DateTime. Giá trị mặc định của cột cho ra "2026-09-04
    // 11:08:40" — thiếu chữ T, thiếu mili giây, thiếu múi giờ — mà dấu cách
    // xếp trước chữ "T" nên trộn hai dạng là sắp xếp theo thời gian sai hết.
    const base = Date.now();
    const stampAt = (rank) =>
      new Date(base - rank * 1000).toISOString().replace("Z", "+00:00");
    const values = picked
      .map((r, rank) =>
        "(" +
        [
          quote(randomUUID()),
          quote(r.topic),
          // SQLite không có kiểu mảng: cột urls giữ chuỗi JSON, như lib/queue.ts.
          quote(JSON.stringify(r.urls ?? [])),
          quote(r.notes ?? ""),
          "'pending'",
          "'[]'",
          quote(stampAt(rank)),
          quote(stampAt(rank)),
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
        googleTrendsVN,
        googleTrendsGlobal,
        youtubeTrendingVN: youtube,
        redditHot: reddit,
        googleNewsVietnam: gnews,
        internationalHeadlines: headlines,
        picked: picked.map((c) => ({
          topic: c.topic,
          score: c.score,
          vietnam: c.vietnam,
          priority: c.priority,
          origin: c.origin,
          reasons: c.reasons,
        })),
      },
      null,
      2,
    ),
    "utf8",
  );

  // Dịch tít sang tiếng Việt ngay sau khi ghi, để tổng biên tập mở
  // /admin/research là đọc được liền. Hỏng thì cột để trống và màn hình rơi về
  // tít gốc — không được làm hỏng cả lượt thu thập chỉ vì việc dịch.
  if (!DRY_RUN) {
    try {
      execFileSync(
        process.execPath,
        [path.join(ROOT, "scripts", "translate-topics.mjs")],
        { stdio: "inherit", env: process.env },
      );
    } catch (err) {
      console.warn(`[collect-trends] dịch tít không xong: ${err.message}`);
    }
  }

  console.log(`\n[collect-trends] đã ghi ${picked.length} đề tài vào database`);
  console.log(`[collect-trends] ảnh chụp dữ liệu thô: ${DIGEST_FILE}`);
  console.log("[collect-trends] mở /admin/research để duyệt.");
}

main().catch((err) => {
  console.error("[collect-trends] LỖI KHÔNG BẮT ĐƯỢC:", err);
  process.exitCode = 1;
});
