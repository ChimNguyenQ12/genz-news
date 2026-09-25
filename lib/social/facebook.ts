import type { Article } from "@/lib/types";
import { articleUrl, categoryTag, coverAsJpeg, hashtag } from "./format";
import type { ArticleView, RemoteRef, SocialDriver } from "./types";

/**
 * Facebook Page.
 * - Đăng dạng ẢNH (ảnh bìa gửi thẳng tệp JPEG): bài ảnh được tiếp cận nhiều hơn.
 * - Link bài ở BÌNH LUẬN ĐẦU: bài có link ngoài trong caption bị hạ tiếp cận.
 * - Caption như người biên tập đăng: tít, câu tóm tắt, hashtag.
 */

const GRAPH = "https://graph.facebook.com/v20.0";

function credentials() {
  const pageId = process.env.FB_PAGE_ID;
  const token = process.env.FB_PAGE_ACCESS_TOKEN;
  if (!pageId || !token) throw new Error("Chưa cấu hình FB_PAGE_ID / FB_PAGE_ACCESS_TOKEN");
  return { pageId, token };
}

async function graph<T = Record<string, unknown>>(
  path: string,
  method: "GET" | "POST" | "DELETE",
  params: Record<string, string> | FormData = {},
): Promise<T> {
  const { token } = credentials();
  let url = `${GRAPH}/${path}`;
  let body: FormData | URLSearchParams | undefined;
  if (params instanceof FormData) {
    params.set("access_token", token);
    body = params;
  } else {
    const search = new URLSearchParams({ ...params, access_token: token });
    if (method === "POST") body = search;
    else url += `?${search}`;
  }
  const res = await fetch(url, { method, body, signal: AbortSignal.timeout(60_000) });
  const data = (await res.json().catch(() => ({}))) as T & { error?: { message?: string } };
  if (!res.ok || data.error) throw new Error(data.error?.message ?? `Facebook trả HTTP ${res.status}`);
  return data;
}

export const facebookDriver: SocialDriver = {
  platform: "facebook",
  label: "Facebook Page",
  accountName: "GenZ News",
  maxCaption: null,
  canEditPublished: true,
  autoPick: true,

  configured: () => Boolean(process.env.FB_PAGE_ID && process.env.FB_PAGE_ACCESS_TOKEN),

  formatCaption(a: ArticleView) {
    const tags = ["#GenZNews", categoryTag(a.category), ...a.tags.slice(0, 3).map(hashtag)].filter(
      (t) => t.length > 1,
    );
    return [
      `⚡ ${a.title.toUpperCase()}`,
      a.dek ? `\n📌 ${a.dek}` : "",
      "\n👇 Chi tiết và nguồn trích dẫn ở bình luận bên dưới!",
      `\n${[...new Set(tags)].join(" ")}`,
    ]
      .join("\n")
      .trim();
  },

  formatComment: (a: ArticleView) => `👉 Đọc đầy đủ bài viết tại: ${articleUrl(a.slug)}`,

  async create(article: Article, caption: string, comment: string) {
    const { pageId } = credentials();
    let remotePostId: string;
    let remoteMediaId: string | null = null;

    const jpeg = await coverAsJpeg(article);
    if (jpeg) {
      const form = new FormData();
      form.set("source", new Blob([new Uint8Array(jpeg)], { type: "image/jpeg" }), "cover.jpg");
      form.set("caption", caption);
      form.set("published", "true");
      const data = await graph<{ id: string; post_id?: string }>(`${pageId}/photos`, "POST", form);
      remoteMediaId = data.id;
      remotePostId = data.post_id ?? `${pageId}_${data.id}`;
    } else {
      remotePostId = (await graph<{ id: string }>(`${pageId}/feed`, "POST", { message: caption })).id;
    }

    let remoteCommentId: string | null = null;
    let commentError: string | null = null;
    try {
      remoteCommentId = (await graph<{ id: string }>(`${remotePostId}/comments`, "POST", { message: comment })).id;
    } catch (err) {
      commentError = `Đã đăng bài nhưng chưa đăng được bình luận link: ${(err as Error).message}`;
    }
    const [, postPart] = remotePostId.split("_");
    const permalink = postPart ? `https://www.facebook.com/${pageId}/posts/${postPart}` : null;
    return { remotePostId, remoteMediaId, remoteCommentId, permalink, commentError };
  },

  // Đã thử trên Page thật: sửa message qua id bài và sửa bình luận đều được.
  async update(ref: RemoteRef, next) {
    if (next.caption !== undefined && ref.remotePostId) {
      try {
        await graph(ref.remotePostId, "POST", { message: next.caption });
      } catch (err) {
        if (!ref.remoteMediaId) throw err;
        await graph(ref.remoteMediaId, "POST", { name: next.caption });
      }
    }
    let remoteCommentId = ref.remoteCommentId;
    if (next.comment !== undefined) {
      if (remoteCommentId) await graph(remoteCommentId, "POST", { message: next.comment });
      else if (ref.remotePostId) {
        remoteCommentId = (
          await graph<{ id: string }>(`${ref.remotePostId}/comments`, "POST", { message: next.comment })
        ).id;
      }
    }
    return { remoteCommentId };
  },

  // Bài ảnh: có lúc chỉ xoá được qua id tấm ảnh (đã thử trên Page thật).
  async remove(ref: RemoteRef) {
    if (!ref.remotePostId) return;
    try {
      await graph(ref.remotePostId, "DELETE");
    } catch (err) {
      if (!ref.remoteMediaId) throw err;
      await graph(ref.remoteMediaId, "DELETE");
    }
  },
};
