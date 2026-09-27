import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { fetchGoogleTrendsVN } from "@/lib/sources/googleTrends";
import {
  fetchMultipleFeeds,
  INTERNATIONAL_FEEDS,
  VIETNAMESE_INTL_FEEDS,
} from "@/lib/sources/rss";

/**
 * Chỉ admin: mỗi lần gọi là hàng chục request ra ngoài (Google Trends + RSS),
 * để công khai thì ai cũng dùng máy chủ mình làm bệ khuếch đại / làm nó quá tải.
 */
export async function GET() {
  if (!(await requireRole("admin"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
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
