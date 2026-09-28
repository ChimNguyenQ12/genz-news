import type { MetadataRoute } from "next";
import { listArticles } from "@/lib/store";
import { categories } from "@/lib/data";

const BASE_URL =
  process.env.NEXT_PUBLIC_BASE_URL ?? "https://genz-news.site";

export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const articles = await listArticles({ status: "published" });

  const articleEntries: MetadataRoute.Sitemap = articles.map((a) => ({
    url: `${BASE_URL}/bai-viet/${a.slug}`,
    lastModified: a.updatedAt ? new Date(a.updatedAt) : new Date(a.publishedAt),
    changeFrequency: "weekly",
    priority: a.featured ? 0.9 : 0.7,
  }));

  const categoryEntries: MetadataRoute.Sitemap = categories.map((c) => ({
    url: `${BASE_URL}/chuyen-muc/${c.slug}`,
    lastModified: new Date(),
    changeFrequency: "daily",
    priority: 0.6,
  }));

  // Trang tĩnh về danh tính nhà xuất bản. Ít khi đổi nên ưu tiên thấp, nhưng
  // vẫn phải nằm trong sitemap: trang Giới thiệu / Nguyên tắc biên tập / Liên hệ
  // là tín hiệu tin cậy (E-E-A-T) mà Google dùng để đánh giá một trang tin.
  const infoEntries: MetadataRoute.Sitemap = [
    "gioi-thieu",
    "nguyen-tac-bien-tap",
    "lien-he",
    "dieu-khoan",
    "quyen-rieng-tu",
  ].map((slug) => ({
    url: `${BASE_URL}/${slug}`,
    lastModified: new Date(),
    changeFrequency: "monthly",
    priority: 0.4,
  }));

  return [
    {
      url: BASE_URL,
      lastModified: new Date(),
      changeFrequency: "hourly",
      priority: 1.0,
    },
    ...categoryEntries,
    ...infoEntries,
    ...articleEntries,
  ];
}
