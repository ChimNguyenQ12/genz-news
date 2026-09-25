import type { Article } from "@/lib/types";

export const PLATFORMS = ["facebook", "threads"] as const;
export type Platform = (typeof PLATFORMS)[number];

export const isPlatform = (x: string): x is Platform => (PLATFORMS as readonly string[]).includes(x);

/** skipped: người biên tập loại bài khỏi danh sách tự chọn (chỉ có ý nghĩa với nền tảng autoPick). */
export type SocialPostStatus = "scheduled" | "publishing" | "published" | "failed" | "skipped";

/** Phần bài viết mà caption / bình luận cần. */
export type ArticleView = Pick<Article, "title" | "dek" | "category" | "tags" | "slug">;

export interface PublishResult {
  remotePostId: string;
  remoteMediaId?: string | null;
  remoteCommentId?: string | null;
  permalink?: string | null;
  /** Bài đã lên nhưng bình luận link hỏng: không làm hỏng cả lượt, chỉ ghi lại. */
  commentError?: string | null;
}

export interface RemoteRef {
  remotePostId: string | null;
  remoteMediaId: string | null;
  remoteCommentId: string | null;
}

/** Phần riêng của từng nền tảng. Hàng đợi, giờ vàng, khoá chống trùng nằm ở core. */
export interface SocialDriver {
  platform: Platform;
  label: string;
  /** Tên tài khoản hiện trong khung xem trước. */
  accountName: string;
  /** Giới hạn ký tự của bài (Threads: 500). */
  maxCaption: number | null;
  /** Nền tảng có cho sửa bài đã đăng không (Threads: không). */
  canEditPublished: boolean;
  /** Tới giờ vàng mà trống thì tự chọn bài nóng nhất để đăng (Facebook: có; Threads: không, người tự đặt lịch). */
  autoPick: boolean;
  /** Nền tảng có thẻ chủ đề riêng (Threads topic_tag): mặc định, gợi ý, và kiểm tra. */
  topicTag?: {
    default(a: ArticleView): string;
    suggestions(a: ArticleView): string[];
    /** Trả về thẻ đã chuẩn hoá; ném lỗi nếu nền tảng không nhận. "" = không gắn thẻ. */
    normalize(tag: string): string;
  };
  configured(): boolean;
  formatCaption(a: ArticleView): string;
  formatComment(a: ArticleView): string;
  create(article: Article, caption: string, comment: string, opts?: { topicTag?: string | null }): Promise<PublishResult>;
  /** Sửa bài đã đăng; trả về id bình luận (có thể mới tạo). */
  update?(ref: RemoteRef, next: { caption?: string; comment?: string }): Promise<{ remoteCommentId: string | null }>;
  remove(ref: RemoteRef): Promise<void>;
  /** Việc định kỳ, chạy cùng cron đăng bài (Threads: gia hạn token). */
  maintenance?(): Promise<void>;
}
