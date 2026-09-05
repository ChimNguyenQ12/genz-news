import { XMLParser } from "fast-xml-parser";
import type { FeedItem } from "./types";

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  textNodeName: "#text",
});

export interface RssSource {
  name: string;
  url: string;
}

// Nguồn RSS công khai của các hãng tin quốc tế lớn. Đây là feed được
// chính các hãng cung cấp cho mục đích syndication tiêu đề/tóm tắt —
// khác với việc cào (scrape) toàn văn bài viết.
export const INTERNATIONAL_FEEDS: RssSource[] = [
  { name: "BBC World", url: "https://feeds.bbci.co.uk/news/world/rss.xml" },
  { name: "The Guardian World", url: "https://www.theguardian.com/world/rss" },
  { name: "Al Jazeera", url: "https://www.aljazeera.com/xml/rss/all.xml" },
  { name: "NYT World", url: "https://rss.nytimes.com/services/xml/rss/nyt/World.xml" },
];

export const VIETNAMESE_INTL_FEEDS: RssSource[] = [
  { name: "BBC Tiếng Việt", url: "https://feeds.bbci.co.uk/vietnamese/rss.xml" },
];

async function fetchText(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0 (compatible; GenZNewsBot/1.0)" },
    next: { revalidate: 300 },
  });
  if (!res.ok) throw new Error(`Fetch failed ${res.status} for ${url}`);
  return res.text();
}

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

export async function fetchRssFeed(source: RssSource): Promise<FeedItem[]> {
  const xml = await fetchText(source.url);
  const parsed = parser.parse(xml);
  const items = toArray(parsed?.rss?.channel?.item);

  return items.map((item) => ({
    title: textOf(item.title),
    link: textOf(item.link),
    description: textOf(item.description).replace(/<[^>]*>/g, "").trim(),
    pubDate: textOf(item.pubDate),
    sourceName: source.name,
  }));
}

export async function fetchMultipleFeeds(sources: RssSource[]): Promise<FeedItem[]> {
  const results = await Promise.allSettled(sources.map(fetchRssFeed));
  return results
    .filter((r): r is PromiseFulfilledResult<FeedItem[]> => r.status === "fulfilled")
    .flatMap((r) => r.value);
}
