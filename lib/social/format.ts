import sharp from "sharp";
import { getCategory } from "@/lib/data";
import type { Article } from "@/lib/types";

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL ?? "https://genz-news.site";

export const articleUrl = (slug: string) => `${BASE_URL}/bai-viet/${slug}`;

export const hashtag = (text: string) => `#${text.normalize("NFC").replace(/[^\p{L}\p{N}]+/gu, "")}`;

export const categoryTag = (category: string) => {
  const c = getCategory(category);
  return c ? hashtag(c.name) : "";
};

/**
 * Ảnh bìa đổi sang JPEG. Kho ảnh giờ là WebP; Facebook không nhận WebP chắc
 * chắn, Threads thì chỉ nhận JPEG/PNG.
 */
export async function coverAsJpeg(article: Article): Promise<Buffer | null> {
  if (!article.coverImage) return null;
  try {
    const res = await fetch(article.coverImage, { signal: AbortSignal.timeout(30_000) });
    if (!res.ok) return null;
    const input = Buffer.from(await res.arrayBuffer());
    return await sharp(input)
      .rotate()
      .resize({ width: 2048, height: 2048, fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 88 })
      .toBuffer();
  } catch {
    return null;
  }
}
