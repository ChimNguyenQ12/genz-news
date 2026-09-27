import type { SourceRef } from "./types";

/**
 * Làm sạch các trường bài viết do người dùng gửi lên (POST/PUT /api/articles).
 * Thân bài đã qua sanitizeArticleHtml; mấy hàm này lo các trường còn lại —
 * những trường React/JSON-LD sẽ nhét vào href, src, style.
 */

export const LIMITS = { title: 300, dek: 1000, tags: 20, tag: 60, sources: 40, sourceName: 200, body: 1_000_000 };

/** Chỉ nhận URL http(s) tuyệt đối — chặn javascript:, data:, và rác. */
export function httpUrl(raw: unknown): string | null {
  try {
    const u = new URL(String(raw ?? "").trim());
    return u.protocol === "http:" || u.protocol === "https:" ? u.href : null;
  } catch {
    return null;
  }
}

/** Ảnh bìa: URL http(s), hoặc đường dẫn trong chính trang ("/media/…", KHÔNG phải "//host"). */
export function mediaRef(raw: unknown): string | undefined {
  const s = String(raw ?? "").trim();
  if (!s) return undefined;
  if (s.startsWith("/") && !s.startsWith("//") && !s.includes("\\")) return s;
  return httpUrl(s) ?? undefined;
}

const HEX = /^#[0-9a-f]{3,8}$/i;
/** Màu nền ảnh bìa đi thẳng vào style CSS — chỉ nhận mã màu hex. */
export function gradient(raw: unknown): [string, string] | undefined {
  if (!Array.isArray(raw) || raw.length !== 2) return undefined;
  const [a, b] = raw.map((c) => String(c).trim());
  return HEX.test(a) && HEX.test(b) ? [a, b] : undefined;
}

export function tags(raw: unknown): string[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  return raw
    .map((t) => String(t).trim().slice(0, LIMITS.tag))
    .filter(Boolean)
    .slice(0, LIMITS.tags);
}

/** Nguồn tham khảo: bỏ mục không có URL http(s) hợp lệ. */
export function sources(raw: unknown): SourceRef[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  return raw
    .map((s) => s as { name?: unknown; url?: unknown })
    .map((s) => ({ name: String(s?.name ?? "Nguồn").slice(0, LIMITS.sourceName), url: httpUrl(s?.url) }))
    .filter((s): s is SourceRef => !!s.url)
    .slice(0, LIMITS.sources);
}

export const text = (raw: unknown, max: number) => String(raw ?? "").slice(0, max);
