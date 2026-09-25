import sharp from "sharp";
import { getCategory } from "@/lib/data";
import { S3_UPLOADS_BASE } from "@/lib/media";
import type { Article } from "@/lib/types";
import { MAX_IMAGES, type MediaItem } from "./types";

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL ?? "https://genz-news.site";

export const articleUrl = (slug: string) => `${BASE_URL}/bai-viet/${slug}`;

export const hashtag = (text: string) => `#${text.normalize("NFC").replace(/[^\p{L}\p{N}]+/gu, "")}`;

export const categoryTag = (category: string) => {
  const c = getCategory(category);
  return c ? hashtag(c.name) : "";
};

/**
 * Media sẽ đăng: `stored` là cột social_posts.media. NULL = ảnh bìa của bài
 * (mặc định); "[]" = chỉ chữ; còn lại là danh sách người biên tập tự chọn.
 */
export function resolveMedia(article: Article, stored: string | null): MediaItem[] {
  if (stored === null) return article.coverImage ? [{ type: "image", url: article.coverImage }] : [];
  try {
    return parseMedia(JSON.parse(stored));
  } catch {
    return [];
  }
}

/**
 * Kiểm tra danh sách media người dùng gửi lên. Chỉ nhận URL trên kho S3 của
 * mình (đã qua /api/upload), tối đa MAX_IMAGES ảnh HOẶC đúng 1 video.
 */
export function parseMedia(raw: unknown): MediaItem[] {
  if (!Array.isArray(raw)) throw new Error("Media must be a list");
  const items = raw.map((m) => {
    const type = (m as MediaItem)?.type;
    const url = String((m as MediaItem)?.url ?? "");
    if (type !== "image" && type !== "video") throw new Error("Media type must be image or video");
    if (!url.startsWith(S3_UPLOADS_BASE)) throw new Error("Media must be uploaded here first");
    return { type, url } as MediaItem;
  });
  const videos = items.filter((m) => m.type === "video").length;
  if (videos > 1 || (videos === 1 && items.length > 1)) throw new Error("Use either one video or images, not both");
  if (items.length > MAX_IMAGES) throw new Error(`At most ${MAX_IMAGES} images per post`);
  return items;
}

/**
 * Ảnh đổi sang JPEG. Kho ảnh giờ là WebP; Facebook không nhận WebP chắc chắn,
 * Threads thì chỉ nhận JPEG/PNG.
 */
export async function imageAsJpeg(url: string): Promise<Buffer | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(30_000) });
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
