import type { Article } from "@/lib/types";
import { articleUrl, categoryTag, hashtag, imageAsJpeg } from "./format";
import type { ArticleView, MediaItem, RemoteRef, SocialDriver } from "./types";

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
  if (!pageId || !token) throw new Error("FB_PAGE_ID / FB_PAGE_ACCESS_TOKEN not configured");
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
  if (!res.ok || data.error) throw new Error(data.error?.message ?? `Facebook returned HTTP ${res.status}`);
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

  // Đã thử trên Page thật (ở chế độ ẩn rồi xoá): ảnh, album nhiều ảnh
  // (ảnh ẩn + attached_media), video qua file_url — tạo, sửa, xoá đều được.
  async create(_article: Article, caption: string, comment: string, opts: { media: MediaItem[] }) {
    const { pageId } = credentials();
    let remotePostId: string;
    let remoteMediaId: string | null = null;
    let permalink: string | null = null;

    const images = opts.media.filter((m) => m.type === "image");
    const video = opts.media.find((m) => m.type === "video");

    if (video) {
      const v = await graph<{ id: string }>(`${pageId}/videos`, "POST", {
        file_url: video.url,
        description: caption,
        published: "true",
      });
      remoteMediaId = v.id;
      // Video cần vài giây mới có post_id; không có thì bình luận thẳng vào video.
      let postId: string | undefined;
      for (let i = 0; i < 10 && !postId; i++) {
        await new Promise((r) => setTimeout(r, 3000));
        const info = await graph<{ post_id?: string }>(v.id, "GET", { fields: "post_id" }).catch(
          (): { post_id?: string } => ({}),
        );
        postId = info.post_id;
      }
      remotePostId = postId ? `${pageId}_${postId}` : v.id;
      permalink = `https://www.facebook.com/reel/${v.id}`;
    } else if (images.length === 1) {
      const jpeg = await imageAsJpeg(images[0].url);
      if (!jpeg) throw new Error("Could not load the image");
      const form = new FormData();
      form.set("source", new Blob([new Uint8Array(jpeg)], { type: "image/jpeg" }), "photo.jpg");
      form.set("caption", caption);
      form.set("published", "true");
      const data = await graph<{ id: string; post_id?: string }>(`${pageId}/photos`, "POST", form);
      remoteMediaId = data.id;
      remotePostId = data.post_id ?? `${pageId}_${data.id}`;
    } else if (images.length > 1) {
      // Album: tải từng ảnh ở chế độ ẩn, rồi một bài feed gắn tất cả.
      const ids: string[] = [];
      for (const img of images) {
        const jpeg = await imageAsJpeg(img.url);
        if (!jpeg) throw new Error("Could not load one of the images");
        const form = new FormData();
        form.set("source", new Blob([new Uint8Array(jpeg)], { type: "image/jpeg" }), "photo.jpg");
        form.set("published", "false");
        ids.push((await graph<{ id: string }>(`${pageId}/photos`, "POST", form)).id);
      }
      remotePostId = (
        await graph<{ id: string }>(`${pageId}/feed`, "POST", {
          message: caption,
          attached_media: JSON.stringify(ids.map((id) => ({ media_fbid: id }))),
        })
      ).id;
    } else {
      remotePostId = (await graph<{ id: string }>(`${pageId}/feed`, "POST", { message: caption })).id;
    }

    let remoteCommentId: string | null = null;
    let commentError: string | null = null;
    try {
      remoteCommentId = (await graph<{ id: string }>(`${remotePostId}/comments`, "POST", { message: comment })).id;
    } catch (err) {
      commentError = `Posted, but the link comment failed: ${(err as Error).message}`;
    }
    const [, postPart] = remotePostId.split("_");
    permalink ??= postPart ? `https://www.facebook.com/${pageId}/posts/${postPart}` : null;
    return { remotePostId, remoteMediaId, remoteCommentId, permalink, commentError };
  },

  // Đã thử trên Page thật: sửa message qua id bài và sửa bình luận đều được.
  async update(ref: RemoteRef, next) {
    if (next.caption !== undefined && ref.remotePostId) {
      try {
        await graph(ref.remotePostId, "POST", { message: next.caption });
      } catch (err) {
        const mediaId = ref.remoteMediaId;
        const caption = next.caption;
        if (!mediaId) throw err;
        // Ảnh: caption là "name"; video: "description".
        await graph(mediaId, "POST", { name: caption }).catch(() => graph(mediaId, "POST", { description: caption }));
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
