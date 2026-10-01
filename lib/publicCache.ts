import { unstable_cache } from "next/cache";
import { listPublishedInCategory, listPublishedSummaries } from "@/lib/store";

/**
 * Dữ liệu của các trang công khai, cache trong bộ nhớ đệm của Next.
 *
 * Trang chủ và trang chuyên mục vẫn dựng theo từng lượt xem (dựng một trang
 * React chỉ vài mili-giây), nhưng KHÔNG truy vấn SQLite mỗi lượt: bài lên top
 * Facebook là vài trăm lượt/phút, đều đọc đúng một danh sách bài.
 *
 * Hết hạn sau 60 giây, và bị xoá NGAY khi bài/bố cục trang chủ đổi
 * (revalidateTag(ARTICLES_TAG) trong lib/revalidate.ts) — người đọc không phải
 * chờ mới thấy bài vừa đăng.
 */
export const ARTICLES_TAG = "articles";

export const cachedPublishedSummaries = unstable_cache(
  () => listPublishedSummaries(),
  ["published-summaries"],
  { revalidate: 60, tags: [ARTICLES_TAG] },
);

export const cachedCategoryPage = unstable_cache(
  (category: string, page: number, perPage: number) => listPublishedInCategory(category, page, perPage),
  ["category-page"],
  { revalidate: 60, tags: [ARTICLES_TAG] },
);
