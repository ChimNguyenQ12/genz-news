/**
 * Tiện ích SEO dùng chung cho metadata (title, description, ảnh chia sẻ).
 *
 * Vì sao cần: tít bài của toà soạn thường 60–75 ký tự, cộng thêm hậu tố
 * " | GenZ News" là vượt ngưỡng hiển thị của Google (~60–65 ký tự) nên bị cắt
 * giữa chừng; `dek` cũng hay dài 180–200 ký tự trong khi Google chỉ hiện
 * khoảng 155. Cắt gọn ngay ở tầng metadata, không đụng tới nội dung bài.
 */

export const SITE_NAME = "GenZ News";

export const BRAND_SUFFIX = ` | ${SITE_NAME}`;

export const SITE_DESC =
  "Tin tức quốc tế được chắt lọc, biên tập lại và trích dẫn nguồn rõ ràng — đọc nhanh, hiểu sâu.";

/**
 * Ảnh chia sẻ mặc định (Facebook, Zalo, X…).
 *
 * Tệp nằm trong public/ nên phục vụ được ở /genz-news-banner.png — để trong
 * app/ thì Next KHÔNG phục vụ tĩnh và thẻ og:image sẽ trỏ vào 404.
 * Next resolve đường dẫn này thành URL tuyệt đối nhờ metadataBase.
 */
export const DEFAULT_OG_IMAGE = {
  url: "/genz-news-banner.png",
  width: 1376,
  height: 768,
  alt: `${SITE_NAME} — Tin thế giới, gọn cho Gen Z`,
};

/**
 * Cắt chuỗi theo ranh giới từ, thêm "…" nếu có cắt. Kết quả không dài hơn
 * `max` ký tự.
 */
export function truncateAtWord(text: string, max: number): string {
  const t = (text ?? "").replace(/\s+/g, " ").trim();
  if (t.length <= max) return t;

  const cut = t.slice(0, max - 1).trimEnd();
  const atSpace = cut.lastIndexOf(" ");
  // Chỉ lùi về ranh giới từ khi không làm mất quá nhiều chữ; từ tiếng Việt
  // dài (có dấu) mà lùi sâu quá thì câu cụt mất nghĩa.
  const base = atSpace > cut.length * 0.6 ? cut.slice(0, atSpace) : cut;
  return `${base.replace(/[\s,;:.–—-]+$/, "")}…`;
}

/**
 * Tiêu đề hiển thị trên Google, tối đa `max` ký tự.
 *
 * Ưu tiên giữ TRỌN tít bài vì đó mới là thứ người đọc bấm vào: chỉ gắn thêm
 * thương hiệu khi còn đủ chỗ, còn không thì cắt tít và bỏ hậu tố. Dùng kèm
 * `title: { absolute: ... }` để Next không gắn template thêm lần nữa.
 */
export function serpTitle(raw: string, max = 62): string {
  const title = (raw ?? "").replace(/\s+/g, " ").trim();
  if (!title) return SITE_NAME;
  const withBrand = `${title}${BRAND_SUFFIX}`;
  if (withBrand.length <= max) return withBrand;
  return truncateAtWord(title, max);
}

/**
 * Meta description gọn, tối đa `max` ký tự (Google cắt quanh 155–160).
 * Trả về chuỗi rỗng nếu đầu vào rỗng để tầng gọi tự quyết định bỏ trường.
 */
export function serpDescription(text: string, max = 155): string {
  return truncateAtWord(text ?? "", max);
}
