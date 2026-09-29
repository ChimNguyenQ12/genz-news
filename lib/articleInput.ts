import type { ImageCredit, SourceRef } from "./types";

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

/**
 * Mốc đăng bài: LUÔN là ISO CÓ GIỜ.
 *
 * Ô "Publish date" trong trình sửa bài là `<input type="date">` nên chỉ gửi
 * "YYYY-MM-DD". Ghi thẳng giá trị đó vào DB là mất phần giờ — đúng chuyện đã
 * xảy ra với cả 221 bài, khiến trang bài viết không còn gì để hiện ngoài ngày.
 *
 * Chỉ có ngày thì giữ lại phần GIỜ của mốc cũ (bài mới chưa có mốc cũ thì lấy
 * giờ hiện tại), để sửa ngày không xoá mất giờ đăng.
 */
export function publishedAt(raw: unknown, previous?: string): string {
  const value = String(raw ?? "").trim();
  if (!value) return previous ?? new Date().toISOString();
  if (value.includes("T")) {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? value : d.toISOString();
  }
  const tail = (previous ?? "").slice(10); // "T20:03:52.000+00:00"
  return tail.includes("T")
    ? `${value}${tail}`
    : `${value}${new Date().toISOString().slice(10)}`;
}

/**
 * Ghi công ảnh bìa. `author` + `sourceUrl` (http/https thật) là bắt buộc — nếu
 * không thì "(nguồn)" không có gì để trỏ tới. `license` không bắt buộc: ảnh
 * báo chí không có giấy phép mở nên để trống; ảnh CC/Commons thì bên gọi
 * (genz-news-fetch-image) đã tự điền, ở đây chỉ giữ nguyên nếu có.
 */
export function imageCredit(raw: unknown): ImageCredit | undefined {
  if (raw === null || raw === undefined) return undefined;
  const c = raw as Record<string, unknown>;
  const author = text(c.author, 200).trim();
  const sourceUrl = httpUrl(c.sourceUrl);
  if (!author || !sourceUrl) return undefined;
  const license = text(c.license, 100).trim();
  const sourceName = text(c.sourceName, 100).trim();
  return { author, sourceUrl, ...(license ? { license } : {}), ...(sourceName ? { sourceName } : {}) };
}
