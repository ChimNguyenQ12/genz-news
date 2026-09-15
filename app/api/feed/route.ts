import { NextResponse } from "next/server";
import { listArticles } from "@/lib/store";

const BASE_URL =
  process.env.NEXT_PUBLIC_BASE_URL ?? "https://genz-news.site";

const SITE_NAME = "GenZ News";
const SITE_DESC =
  "Tin tức quốc tế được chắt lọc, biên tập lại và trích dẫn nguồn rõ ràng — đọc nhanh, hiểu sâu.";

// escape ký tự XML đặc biệt trong chuỗi thuần
function escapeXml(str: string) {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export const dynamic = "force-dynamic";

export async function GET() {
  const articles = await listArticles({ status: "published" });
  const latest = articles.slice(0, 50);

  const items = latest
    .map((a) => {
      const url = `${BASE_URL}/bai-viet/${a.slug}`;
      const pubDate = new Date(a.publishedAt).toUTCString();
      return `
    <item>
      <title>${escapeXml(a.title)}</title>
      <link>${url}</link>
      <guid isPermaLink="true">${url}</guid>
      <description>${escapeXml(a.dek ?? "")}</description>
      <pubDate>${pubDate}</pubDate>
      <author>${escapeXml(a.author)}</author>
      <category>${escapeXml(a.category)}</category>
    </item>`;
    })
    .join("");

  const rss = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"
  xmlns:atom="http://www.w3.org/2005/Atom"
  xmlns:content="http://purl.org/rss/1.0/modules/content/"
  xmlns:dc="http://purl.org/dc/elements/1.1/"
  xmlns:media="http://search.yahoo.com/mrss/">
  <channel>
    <title>${escapeXml(SITE_NAME)}</title>
    <link>${BASE_URL}</link>
    <description>${escapeXml(SITE_DESC)}</description>
    <language>vi</language>
    <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>
    <atom:link href="${BASE_URL}/feed" rel="self" type="application/rss+xml"/>
    <image>
      <url>${BASE_URL}/logo.png</url>
      <title>${escapeXml(SITE_NAME)}</title>
      <link>${BASE_URL}</link>
    </image>
    ${items}
  </channel>
</rss>`;

  return new NextResponse(rss, {
    headers: {
      "Content-Type": "application/rss+xml; charset=utf-8",
      // Cache 5 phút ở CDN, stale-while-revalidate 1 giờ
      "Cache-Control": "public, max-age=300, stale-while-revalidate=3600",
    },
  });
}
