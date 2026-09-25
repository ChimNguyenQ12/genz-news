import crypto from "crypto";
import fs from "fs";
import path from "path";
import type { Article } from "@/lib/types";
import { uploadToS3 } from "@/lib/storage";
import { getCategory } from "@/lib/data";
import { articleUrl, coverAsJpeg } from "./format";
import type { ArticleView, RemoteRef, SocialDriver } from "./types";

/**
 * Threads (tài khoản genznews.hi).
 *
 * Khác Facebook ở mấy chỗ quyết định cách làm:
 * - Bài tối đa 500 ký tự, và chỉ MỘT hashtag (thẻ chủ đề) có tác dụng.
 * - Đăng hai bước: tạo "container" → chờ Threads xử lý xong → publish.
 * - Ảnh phải là URL công khai JPEG/PNG (Threads tự tải về), không gửi tệp
 *   được, và kho ảnh của mình là WebP → đổi JPEG, đẩy lên S3 social/.
 * - KHÔNG sửa được bài đã đăng; chỉ xoá (cần quyền threads_delete).
 * - Token sống 60 ngày, gia hạn được bằng API → xem phần token bên dưới.
 */

const API = "https://graph.threads.net/v1.0";
export const THREADS_MAX = 500;

/**
 * Thẻ chủ đề (topic tag): mỗi bài MỘT thẻ, gửi qua tham số topic_tag — bài hiện
 * trong luồng của thẻ đó. Đã thử trên API thật: nhận tiếng Việt có dấu và dấu
 * cách ("Tin nóng"); thẻ có "." hoặc "&" bị từ chối ("Topic Tag Not Permitted").
 */
const TOPIC_MAX = 50;
/** Thẻ hay dùng, bày sẵn cho người biên tập bấm. */
const POPULAR_TOPICS = ["Viral", "Tin nóng", "GenZ", "Tin tức", "Drama", "Xu hướng"];

function normalizeTopicTag(raw: string) {
  const tag = raw.replace(/^#+/, "").replace(/\s+/g, " ").trim();
  if (!tag) return "";
  if (/[.&]/.test(tag)) throw new Error("Topic tags can’t contain “.” or “&”");
  if (tag.length > TOPIC_MAX) throw new Error(`Topic tag is ${tag.length} characters; the limit is ${TOPIC_MAX}`);
  return tag;
}

// ---------- token ----------
//
// THREAD_PAGE_ACCESS_TOKEN (biến CI) chỉ để nạp lần đầu. Token gia hạn được
// ghi vào data/threads-token.json: nếu chỉ dựa vào biến CI, mỗi lần deploy sẽ
// ghi đè token đã gia hạn bằng token gốc, và 60 ngày sau hỏng âm thầm.
// Đổi biến CI sang token KHÁC (tạo lại token) thì tệp được nạp lại từ đó.

const TOKEN_FILE = path.join(
  process.env.DATA_DIR ?? path.join(process.cwd(), "data"),
  "threads-token.json",
);
const REFRESH_EVERY_MS = 7 * 24 * 3600 * 1000;

interface StoredToken {
  token: string;
  /** sha256 của token trong biến môi trường lúc nạp — để biết biến đã đổi. */
  seededFrom: string;
  refreshedAt: number;
  expiresAt: number | null;
}

const sha = (s: string) => crypto.createHash("sha256").update(s).digest("hex");

function readStored(): StoredToken | null {
  try {
    return JSON.parse(fs.readFileSync(TOKEN_FILE, "utf8")) as StoredToken;
  } catch {
    return null;
  }
}

function writeStored(t: StoredToken) {
  fs.writeFileSync(TOKEN_FILE, JSON.stringify(t), { mode: 0o600 });
}

function currentToken(): string | null {
  const env = process.env.THREAD_PAGE_ACCESS_TOKEN?.trim();
  let stored = readStored();
  if (env && stored?.seededFrom !== sha(env)) {
    stored = { token: env, seededFrom: sha(env), refreshedAt: Date.now(), expiresAt: null };
    try {
      writeStored(stored);
    } catch {
      // không ghi được thư mục data (máy dev): vẫn dùng token trong biến
    }
  }
  return stored?.token ?? env ?? null;
}

/** Gia hạn token 7 ngày một lần (Threads chỉ cho gia hạn token đã được ≥ 24 giờ). */
async function refreshTokenIfDue() {
  const stored = readStored();
  if (!stored || Date.now() - stored.refreshedAt < REFRESH_EVERY_MS) return;
  const url = `https://graph.threads.net/refresh_access_token?${new URLSearchParams({
    grant_type: "th_refresh_token",
    access_token: stored.token,
  })}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(30_000) });
  const data = (await res.json().catch(() => ({}))) as {
    access_token?: string;
    expires_in?: number;
    error?: { message?: string };
  };
  if (!res.ok || !data.access_token) {
    throw new Error(`Could not refresh the Threads token: ${data.error?.message ?? `HTTP ${res.status}`}`);
  }
  writeStored({
    ...stored,
    token: data.access_token,
    refreshedAt: Date.now(),
    expiresAt: data.expires_in ? Date.now() + data.expires_in * 1000 : null,
  });
}

// ---------- API ----------

async function api<T = Record<string, unknown>>(
  pathPart: string,
  method: "GET" | "POST" | "DELETE",
  params: Record<string, string> = {},
): Promise<T> {
  const token = currentToken();
  if (!token) throw new Error("THREAD_PAGE_ACCESS_TOKEN not configured");
  const search = new URLSearchParams({ ...params, access_token: token });
  const url = method === "POST" ? `${API}/${pathPart}` : `${API}/${pathPart}?${search}`;
  const res = await fetch(url, {
    method,
    body: method === "POST" ? search : undefined,
    signal: AbortSignal.timeout(60_000),
  });
  const data = (await res.json().catch(() => ({}))) as T & { error?: { message?: string } };
  if (!res.ok || data.error) {
    const msg = data.error?.message ?? `Threads returned HTTP ${res.status}`;
    if (/permission/i.test(msg) && method === "DELETE") {
      throw new Error("The Threads token lacks the threads_delete permission. Generate a token with it and try again.");
    }
    throw new Error(msg);
  }
  return data;
}

let userIdCache: { token: string; id: string } | null = null;
async function userId() {
  const token = currentToken() ?? "";
  if (userIdCache?.token === token) return userIdCache.id;
  const me = await api<{ id: string }>("me", "GET", { fields: "id" });
  userIdCache = { token, id: me.id };
  return me.id;
}

/** Tạo container, chờ Threads xử lý xong (ảnh cần vài giây tới vài chục giây), rồi publish. */
async function createAndPublish(params: Record<string, string>) {
  const uid = await userId();
  const { id: containerId } = await api<{ id: string }>(`${uid}/threads`, "POST", params);
  for (let i = 0; i < 30; i++) {
    const st = await api<{ status?: string; error_message?: string }>(containerId, "GET", {
      fields: "status,error_message",
    });
    if (st.status === "FINISHED") break;
    if (st.status === "ERROR" || st.status === "EXPIRED") {
      throw new Error(`Threads could not process the post: ${st.error_message ?? st.status}`);
    }
    await new Promise((r) => setTimeout(r, 3000));
  }
  const { id } = await api<{ id: string }>(`${uid}/threads_publish`, "POST", { creation_id: containerId });
  return id;
}

export const threadsDriver: SocialDriver = {
  platform: "threads",
  label: "Threads",
  accountName: "genznews.hi",
  maxCaption: THREADS_MAX,
  canEditPublished: false,
  autoPick: false,
  topicTag: {
    default: (a: ArticleView) => getCategory(a.category)?.name ?? "",
    suggestions: (a: ArticleView) => {
      const out = [...POPULAR_TOPICS, getCategory(a.category)?.name ?? "", ...a.tags.slice(0, 4)];
      const seen = new Set<string>();
      return out.filter((t) => {
        const k = t.trim().toLowerCase();
        if (!k || /[.&]/.test(k) || k.length > TOPIC_MAX || seen.has(k)) return false;
        seen.add(k);
        return true;
      });
    },
    normalize: normalizeTopicTag,
  },

  configured: () => Boolean(process.env.THREAD_PAGE_ACCESS_TOKEN?.trim() || readStored()?.token),

  /** Tít, câu tóm tắt (cắt bớt cho vừa 500 ký tự), lời mời đọc tiếp. Thẻ chủ đề đi riêng (topic_tag). */
  formatCaption(a: ArticleView) {
    const cta = "👇 Link đọc đầy đủ ở bình luận";
    const build = (dek: string) => [a.title, dek, cta].filter(Boolean).join("\n\n");
    let dek = a.dek ?? "";
    let text = build(dek);
    while (text.length > THREADS_MAX && dek.length > 0) {
      dek = dek.slice(0, Math.max(0, dek.length - (text.length - THREADS_MAX) - 1)).trimEnd();
      text = build(dek ? `${dek}…` : "");
    }
    return text.slice(0, THREADS_MAX);
  },

  formatComment: (a: ArticleView) => `Đọc đầy đủ tại đây 👉 ${articleUrl(a.slug)}`,

  async create(article: Article, caption: string, comment: string, opts: { topicTag?: string | null } = {}) {
    if (caption.length > THREADS_MAX) {
      throw new Error(`Threads post is ${caption.length} characters; the limit is ${THREADS_MAX}`);
    }
    const jpeg = await coverAsJpeg(article);
    const params: Record<string, string> = jpeg
      ? { media_type: "IMAGE", image_url: (await uploadToS3(jpeg, "image/jpeg", "jpg", "social")).url, text: caption }
      : { media_type: "TEXT", text: caption };
    const topic = opts.topicTag ? normalizeTopicTag(opts.topicTag) : "";
    if (topic) params.topic_tag = topic;

    const remotePostId = await createAndPublish(params);

    let permalink: string | null = null;
    try {
      permalink = (await api<{ permalink?: string }>(remotePostId, "GET", { fields: "permalink" })).permalink ?? null;
    } catch {
      // không lấy được link thì thôi, bài vẫn đã lên
    }

    let remoteCommentId: string | null = null;
    let commentError: string | null = null;
    try {
      remoteCommentId = await createAndPublish({ media_type: "TEXT", text: comment, reply_to_id: remotePostId });
    } catch (err) {
      commentError = `Posted, but the link reply failed: ${(err as Error).message}`;
    }
    return { remotePostId, remoteMediaId: null, remoteCommentId, permalink, commentError };
  },

  async remove(ref: RemoteRef) {
    // Reply chứa link là một bài riêng; xoá nó trước để không sót lại lơ lửng.
    if (ref.remoteCommentId) await api(ref.remoteCommentId, "DELETE").catch(() => {});
    if (ref.remotePostId) await api(ref.remotePostId, "DELETE");
  },

  maintenance: refreshTokenIfDue,
};
