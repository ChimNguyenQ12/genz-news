import type { Article } from "@/lib/types";
import { getCategory } from "@/lib/data";

const BASE_URL =
  process.env.NEXT_PUBLIC_BASE_URL ?? "https://genz-news.site";

const FB_GRAPH_VERSION = "v20.0";

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
    // Tránh để nhiều dòng trống liên tiếp
    if (line === "" && arr[i - 1] === "") return false;
    return true;
  });

  return lines.join("\n").trim();
}

/**
 * Tự động đăng bài lên Facebook Fanpage và chèn link bài báo vào Comment đầu tiên.
 */
export async function postArticleToFacebook(article: Article): Promise<{
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

  const caption = formatFacebookCaption(article);
  const articleUrl = `${BASE_URL}/bai-viet/${article.slug}`;

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
          message: `👉 Đọc đầy đủ bài viết tại: ${articleUrl}`,
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

    return { success: true, postId, commentId };
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.error(`[Facebook AutoPost] ❌ Đăng bài thất bại: ${errorMsg}`);
    return { success: false, error: errorMsg };
  }
}
