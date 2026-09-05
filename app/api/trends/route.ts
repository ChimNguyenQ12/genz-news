import { NextResponse } from "next/server";
import { fetchGoogleTrendsVN } from "@/lib/sources/googleTrends";
import {
  fetchMultipleFeeds,
  INTERNATIONAL_FEEDS,
  VIETNAMESE_INTL_FEEDS,
} from "@/lib/sources/rss";

export async function GET() {
  const [trends, international, vietnameseIntl] = await Promise.allSettled([
    fetchGoogleTrendsVN(),
    fetchMultipleFeeds(INTERNATIONAL_FEEDS),
    fetchMultipleFeeds(VIETNAMESE_INTL_FEEDS),
  ]);

  return NextResponse.json({
    fetchedAt: new Date().toISOString(),
    googleTrendsVN: trends.status === "fulfilled" ? trends.value : [],
    internationalHeadlines: international.status === "fulfilled" ? international.value : [],
    vietnameseInternationalHeadlines:
      vietnameseIntl.status === "fulfilled" ? vietnameseIntl.value : [],
  });
}
