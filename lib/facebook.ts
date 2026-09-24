import type { Article } from "@/lib/types";
import { getCategory } from "@/lib/data";
import { prisma } from "@/lib/prisma";

const BASE_URL =
  process.env.NEXT_PUBLIC_BASE_URL ?? "https://genz-news.site";

const FB_GRAPH_VERSION = "v20.0";

export interface FacebookPostRecord {
  id: string;
  articleId: string;
  fbPostId: string;
  fbCommentId?: string | null;
  customCaption?: string | null;
  customComment?: string | null;
  postedAt: Date;
  updatedAt: Date;
}

/**
 * Mẫu khung thời gian vàng tối ưu tương tác Facebook:
 * - 07:00 (Buổi sáng đọc tin)
 * - 11:30 (Nghỉ trưa)
 * - 17:30 (Tan làm)
 * - 20:30 (Giải trí buổi tối)
 */
export const FB_GOLDEN_HOURS = ["07:00", "11:30", "17:30", "20:30"];

/**
 * Tạo caption Facebook chuẩn phong cách Gen Z và tối ưu tương tác.
 */
export function formatFacebookCaption(article: Article): string {
  const category = getCategory(article.category);
  const categoryName = category?.name ? `#${category.name.replace(/\s+/g, "")}` : "#TinTuc";

  const hashtags = [
    "#GenZNews",
    categoryName,
    ...article.tags.slice(0, 4).map((t) => `#${t.replace(/[\s-]+/g, "")}`),
  ]
    .filter(Boolean)
    .join(" ");

  const lines = [
    `⚡ ${article.title.toUpperCase()}`,
    "",
    article.dek ? `📌 ${article.dek}` : "",
    "",
    "👇 Chi tiết bài viết và nguồn trích dẫn được cập nhật ở bình luận bên dưới!",
    "",
    hashtags,
  ].filter((line, i, arr) => {
    if (line === "" && arr[i - 1] === "") return false;
    return true;
  });

  return lines.join("\n").trim();
}

/**
 * Tạo bình luận mặc định chứa link bài viết để tránh penalty giảm reach của Facebook.
 */
export function formatFacebookComment(article: Article): string {
  const articleUrl = `${BASE_URL}/bai-viet/${article.slug}`;
  return `👉 Đọc đầy đủ bài viết và thảo luận thêm tại: ${articleUrl}`;
}

/**
 * Tự động/Biên tập đăng bài lên Facebook Fanpage và chèn link bài báo vào Comment đầu tiên.
 */
export async function postArticleToFacebook(
  article: Article,
  customCaption?: string,
  customComment?: string,
): Promise<{
  success: boolean;
  postId?: string;
  commentId?: string;
  error?: string;
}> {
  const pageId = process.env.FB_PAGE_ID;
  const accessToken = process.env.FB_PAGE_ACCESS_TOKEN;

  if (!pageId || !accessToken) {
    console.log(
      "[Facebook AutoPost] Bỏ qua vì chưa cấu hình FB_PAGE_ID hoặc FB_PAGE_ACCESS_TOKEN.",
    );
    return {
      success: false,
      error: "Chưa cấu hình FB_PAGE_ID hoặc FB_PAGE_ACCESS_TOKEN",
    };
  }

  const caption = customCaption?.trim() || formatFacebookCaption(article);
  const commentText = customComment?.trim() || formatFacebookComment(article);

  try {
    let postId: string | null = null;

    // 1. Đăng bài kèm ảnh bìa nếu có (ưu tiên vì post ảnh tương tác cao nhất)
    if (article.coverImage) {
      const photoUrl = `https://graph.facebook.com/${FB_GRAPH_VERSION}/${encodeURIComponent(pageId)}/photos`;
      const res = await fetch(photoUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: article.coverImage,
          caption,
          access_token: accessToken,
        }),
      });

      const data = (await res.json()) as { id?: string; post_id?: string; error?: { message?: string } };
      if (!res.ok || data.error) {
        throw new Error(data.error?.message || `HTTP ${res.status}`);
      }
      postId = data.post_id || data.id || null;
    } else {
      // 2. Không có ảnh bìa -> Đăng post dạng text thông thường
      const feedUrl = `https://graph.facebook.com/${FB_GRAPH_VERSION}/${encodeURIComponent(pageId)}/feed`;
      const res = await fetch(feedUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: caption,
          access_token: accessToken,
        }),
      });

      const data = (await res.json()) as { id?: string; error?: { message?: string } };
      if (!res.ok || data.error) {
        throw new Error(data.error?.message || `HTTP ${res.status}`);
      }
      postId = data.id || null;
    }

    if (!postId) {
      throw new Error("Không nhận được post_id từ Facebook Graph API");
    }

    console.log(`[Facebook AutoPost] ✅ Đã đăng bài lên Fanpage: Post ID ${postId}`);

    // 3. Tự động comment link bài viết vào bình luận đầu tiên
    let commentId: string | undefined;
    try {
      const commentUrl = `https://graph.facebook.com/${FB_GRAPH_VERSION}/${encodeURIComponent(postId)}/comments`;
      const commentRes = await fetch(commentUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: commentText,
          access_token: accessToken,
        }),
      });

      const commentData = (await commentRes.json()) as { id?: string };
      if (commentRes.ok && commentData.id) {
        commentId = commentData.id;
        console.log(`[Facebook AutoPost] ✅ Đã comment link bài viết: Comment ID ${commentId}`);
      }
    } catch (err: unknown) {
      console.error("[Facebook AutoPost] Lỗi khi tạo comment link:", err);
    }

    // 4. Lưu lại lịch sử đăng vào CSDL SQLite qua Prisma
    try {
      await prisma.facebookPost.upsert({
        where: { articleId: article.id },
        create: {
          articleId: article.id,
          fbPostId: postId,
          fbCommentId: commentId || null,
          customCaption: caption,
          customComment: commentText,
        },
        update: {
          fbPostId: postId,
          fbCommentId: commentId || null,
          customCaption: caption,
          customComment: commentText,
          updatedAt: new Date(),
        },
      });
    } catch (dbErr) {
      console.error("[Facebook AutoPost] Lỗi khi lưu bản ghi FacebookPost vào DB:", dbErr);
    }

    return { success: true, postId, commentId };
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.error(`[Facebook AutoPost] ❌ Đăng bài thất bại: ${errorMsg}`);
    return { success: false, error: errorMsg };
  }
}

/**
 * Lấy lịch sử đăng Facebook của một bài viết
 */
export async function getFacebookPost(articleId: string) {
  try {
    return await prisma.facebookPost.findUnique({
      where: { articleId },
    });
  } catch {
    return null;
  }
}

/**
 * Lấy toàn bộ danh sách các bài đăng Facebook đã được ghi nhận trong DB
 */
export async function listFacebookPosts() {
  try {
    return await prisma.facebookPost.findMany({
      orderBy: { postedAt: "desc" },
    });
  } catch {
    return [];
  }
}
