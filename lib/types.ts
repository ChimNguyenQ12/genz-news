export type CategorySlug =
  | "viet-nam"
  | "the-gioi"
  | "cong-nghe"
  | "giai-tri"
  | "doi-song"
  | "kinh-doanh"
  | "the-thao"
  | "thread-city";

export interface Category {
  slug: CategorySlug;
  name: string;
  color: string; // tailwind color token e.g. "blue"
}

export interface SourceRef {
  name: string;
  url: string;
}

/**
 * Vòng đời bài viết:
 *   draft     — tác giả đang viết, chỉ mình tác giả thấy
 *   pending   — đã gửi duyệt, nằm trong hàng chờ của toà soạn
 *   published — đã đăng, độc giả thấy
 *   rejected  — bị trả lại kèm góp ý, tác giả sửa rồi gửi lại
 */
export type ArticleStatus = "draft" | "pending" | "published" | "rejected";

/** Ngôn ngữ gốc của bài viết. Trang mặc định tiếng Việt. */
export type ArticleLanguage = "vi" | "en";

/**
 * Ghi công ảnh bìa — bắt buộc phải có `sourceUrl` thật để "(nguồn)" render
 * thành một link, không phải chữ suông. Dùng cho cả hai loại ảnh bìa:
 *   - Ảnh báo chí (genz-news-fetch-image --from-article): author = tên báo,
 *     license bỏ trống — không có giấy phép mở, chỉ có chỗ lấy.
 *   - Ảnh CC/Commons/Openverse: license BẮT BUỘC ghi rõ (VD "CC BY-SA 4.0",
 *     "CC0") — đây là điều kiện của chính giấy phép, không phải tuỳ chọn.
 */
export interface ImageCredit {
  author: string;
  license?: string; // Bỏ trống cho ảnh báo chí; bắt buộc cho ảnh CC/Commons.
  sourceUrl: string; // trang gốc — bài báo, hoặc trang mô tả ảnh trên Commons
  sourceName?: string; // chữ hiện trên link, mặc định "nguồn"
}

/**
 * Nội dung bài viết theo dạng khối (block), giống Gutenberg/Notion.
 * Không lưu HTML thô để tránh XSS và giữ giao diện thống nhất.
 */
export type Block =
  | { type: "paragraph"; text: string }
  | { type: "heading"; text: string }
  | { type: "quote"; text: string; attribution?: string }
  | { type: "list"; ordered?: boolean; items: string[] }
  | {
    type: "image";
    url: string;
    caption?: string;
    credit?: ImageCredit;
  }
  | {
    /** Nhúng video bằng công cụ chính thức của nền tảng (hợp pháp),
     *  khác với tải video về rồi đăng lại. */
    type: "video";
    provider: "youtube" | "vimeo";
    videoId: string;
    caption?: string;
    sourceUrl?: string;
  };

export type BlockType = Block["type"];

export interface Article {
  id: string;
  slug: string;
  title: string;
  dek: string; // subheadline / one-line summary
  /** Chuyên mục chính — màu nhãn, breadcrumb. */
  category: CategorySlug;
  /** Chuyên mục phụ: bài cũng hiện ở trang của các chuyên mục này. Không chứa `category`. */
  extraCategories: CategorySlug[];
  tags: string[];
  coverGradient: [string, string]; // placeholder gradient instead of scraped images
  coverImage?: string; // ảnh bìa — chỉ dùng ảnh có giấy phép cho phép
  coverImageCredit?: ImageCredit;
  coverImageCaption?: string;
  author: string;
  publishedAt: string; // ISO date
  readingTimeMin: number;
  featured?: boolean;
  trending?: boolean;
  /** Vị trí trong slideshow hero (1 = đầu); null = không hiện. */
  featuredOrder?: number | null;
  /** Vị trí trong "Đang nóng" (1 = trên cùng); null = không hiện. */
  trendingOrder?: number | null;
  /** Vị trí trong "Tin Nóng" ở cột chính trang chủ; null = không hiện. */
  hotOrder?: number | null;
  /**
   * Lượt đánh giá của người đọc. Chỉ cộng dồn và KHÔNG gắn với tài khoản — khách
   * chưa đăng nhập vẫn bấm được, nên con số này là thăm dò ý kiến chứ không phải
   * dữ liệu chính xác (chống bấm lặp nằm ở phía trình duyệt).
   */
  likeCount?: number;
  dislikeCount?: number;
  status: ArticleStatus;
  /** Ngôn ngữ gốc — quyết định chiều dịch của nút trên trang bài. */
  language: ArticleLanguage;
  /** id tài khoản đã tạo bài — dùng để phân quyền sửa. */
  authorId?: string;
  /** thời điểm gửi duyệt gần nhất */
  submittedAt?: string;
  /** góp ý của biên tập khi trả bài về */
  reviewNote?: string;
  /** Nội dung bài dạng HTML (đã làm sạch) do trình soạn thảo tạo ra. */
  body: string;
  sources: SourceRef[]; // attribution to foreign outlets
  createdAt: string;
  updatedAt: string;
}

/** Kết quả AI nghiên cứu trả về cho biên tập viên xem trước khi tạo bài. */
export interface ResearchSource {
  title: string;
  url: string;
  outlet: string;
  snippet: string;
}

export interface ResearchMedia {
  type: "image" | "video";
  url: string;
  pageUrl: string;
  /** Ảnh/video thuộc bản quyền nguồn gốc — chỉ dùng để tham khảo, không tự động đăng. */
  caption?: string;
}

export interface ResearchDraft {
  title: string;
  dek: string;
  category: CategorySlug;
  tags: string[];
  body: string[];
  readingTimeMin: number;
  sources: SourceRef[];
}

export interface ResearchResult {
  query: string;
  findings: string;
  sources: ResearchSource[];
  media: ResearchMedia[];
  draft: ResearchDraft | null;
  warnings: string[];
}
