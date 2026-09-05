export type CategorySlug =
  | "the-gioi"
  | "cong-nghe"
  | "giai-tri"
  | "doi-song"
  | "kinh-doanh"
  | "the-thao";

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
 * Thông tin bản quyền ảnh. Bắt buộc khi dùng coverImage —
 * ảnh CC/Commons chỉ hợp lệ khi ghi công đúng tác giả và giấy phép.
 */
export interface ImageCredit {
  author: string;
  license: string; // VD: "CC BY-SA 4.0", "CC0", "Public domain"
  sourceUrl: string; // trang mô tả ảnh gốc
  sourceName?: string; // VD: "Wikimedia Commons"
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
  category: CategorySlug;
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
