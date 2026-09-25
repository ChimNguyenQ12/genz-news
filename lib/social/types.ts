import type { Article } from "@/lib/types";

export const PLATFORMS = ["facebook", "threads"] as const;
export type Platform = (typeof PLATFORMS)[number];

export const isPlatform = (x: string): x is Platform => (PLATFORMS as readonly string[]).includes(x);

export type SocialPostStatus = "scheduled" | "publishing" | "published" | "failed";

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
  configured(): boolean;
  formatCaption(a: ArticleView): string;
  formatComment(a: ArticleView): string;
  create(article: Article, caption: string, comment: string): Promise<PublishResult>;
  /** Sửa bài đã đăng; trả về id bình luận (có thể mới tạo). */
  update?(ref: RemoteRef, next: { caption?: string; comment?: string }): Promise<{ remoteCommentId: string | null }>;
  remove(ref: RemoteRef): Promise<void>;
  /** Việc định kỳ, chạy cùng cron đăng bài (Threads: gia hạn token). */
  maintenance?(): Promise<void>;
}
