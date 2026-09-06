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
import prismaPkg from "@prisma/client";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";

const { PrismaClient } = prismaPkg;

const ROOT = process.cwd();
const DATA_DIR = process.env.DATA_DIR ?? path.join(ROOT, "data");
const DB_PATH = process.env.DATABASE_PATH ?? path.join(DATA_DIR, "app.db");
const DIGEST_FILE = path.join(DATA_DIR, "trends-digest.json");

// Đường dẫn THUẦN, không có tiền tố "file:" — xem lib/prisma.ts.
const prisma = new PrismaClient({
  adapter: new PrismaBetterSqlite3({ url: DB_PATH }),
});

const MAX_GOOGLE = Number(process.env.TRENDS_MAX_GOOGLE ?? 8);
const MAX_YOUTUBE = Number(process.env.TRENDS_MAX_YOUTUBE ?? 6);
const MAX_HEADLINES = Number(process.env.TRENDS_MAX_HEADLINES ?? 8);
const DEDUPE_DAYS = Number(process.env.TRENDS_DEDUPE_DAYS ?? 7);
const DRY_RUN = process.env.TRENDS_DRY_RUN === "1";
const UA = "GenZNewsBot/1.0 (+editorial trend collector)";

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  textNodeName: "#text",
});

// Giữ đồng bộ thủ công với lib/sources/rss.ts (script chạy độc lập bằng Node
// nên không import trực tiếp file TypeScript của app).
const RSS_FEEDS = [
  { name: "BBC World", url: "https://feeds.bbci.co.uk/news/world/rss.xml" },
  { name: "The Guardian World", url: "https://www.theguardian.com/world/rss" },
  { name: "Al Jazeera", url: "https://www.aljazeera.com/xml/rss/all.xml" },
  { name: "NYT World", url: "https://rss.nytimes.com/services/xml/rss/nyt/World.xml" },
  { name: "BBC Tiếng Việt", url: "https://feeds.bbci.co.uk/vietnamese/rss.xml" },
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
  /lịch thi đấu|kết quả bóng đá hôm nay/i,
];

/** Bỏ từ khoá quá ngắn/mơ hồ như "đất", "đâm" — không đủ thành đề tài. */
function isTooVague(keyword) {
  const words = keyword.trim().split(/\s+/);
  return words.length < 2 && keyword.trim().length < 6;
}

function isNoise(keyword) {
  return NOISE_PATTERNS.some((re) => re.test(keyword)) || isTooVague(keyword);
}

const toArray = (v) => (v === undefined ? [] : Array.isArray(v) ? v : [v]);

function textOf(v) {
  if (v === undefined || v === null) return "";
  if (typeof v === "string") return v;
  if (typeof v === "object" && "#text" in v) return String(v["#text"] ?? "");
  return String(v);
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
async function readRecentTopics(sinceMs) {
  const rows = await prisma.researchRequest.findMany({
    where: { createdAt: { gte: new Date(sinceMs) } },
    select: { topic: true },
  });
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
  const lists = [...byFeed.values()];
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
  const seen = new Set((await readRecentTopics(cutoff)).map(normalize));

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
    await prisma.researchRequest.createMany({
      data: fresh.map((r) => ({
        topic: r.topic,
        // SQLite không có kiểu mảng: cột urls giữ chuỗi JSON, giống lib/queue.ts.
        urls: JSON.stringify(r.urls ?? []),
        notes: r.notes,
        status: "pending",
      })),
    });
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

main()
  .catch((err) => {
    console.error("[collect-trends] LỖI KHÔNG BẮT ĐƯỢC:", err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
