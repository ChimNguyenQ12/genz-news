import { XMLParser } from "fast-xml-parser";
import type { TrendingTopic } from "./types";

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  textNodeName: "#text",
});

function toArray<T>(value: T | T[] | undefined): T[] {
  if (value === undefined) return [];
  return Array.isArray(value) ? value : [value];
}

function textOf(value: unknown): string {
  if (value === undefined || value === null) return "";
  if (typeof value === "string") return value;
  if (typeof value === "object" && "#text" in (value as Record<string, unknown>)) {
    return String((value as Record<string, unknown>)["#text"] ?? "");
  }
  return String(value);
}

// Google cung cấp công khai feed "xu hướng tìm kiếm hằng ngày" theo quốc gia,
// kèm sẵn các bài báo trong nước đang đưa tin về từ khóa đó.
// Tài liệu: https://trends.google.com/trending/rss?geo=VN
export async function fetchGoogleTrendsVN(): Promise<TrendingTopic[]> {
  const res = await fetch("https://trends.google.com/trending/rss?geo=VN", {
    headers: { "User-Agent": "Mozilla/5.0 (compatible; GenZNewsBot/1.0)" },
    next: { revalidate: 900 },
  });
  if (!res.ok) throw new Error(`Google Trends fetch failed: ${res.status}`);

  const xml = await res.text();
  const parsed = parser.parse(xml);
  const items = toArray(parsed?.rss?.channel?.item);

  return items.map((item) => {
    const newsItems = toArray(item["ht:news_item"]);
    return {
      keyword: textOf(item.title),
      approxTraffic: textOf(item["ht:approx_traffic"]),
      relatedArticles: newsItems.map((n) => ({
        title: textOf(n["ht:news_item_title"]),
        url: textOf(n["ht:news_item_url"]),
        source: textOf(n["ht:news_item_source"]),
      })),
    };
  });
}
