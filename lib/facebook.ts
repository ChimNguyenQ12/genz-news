import sharp from "sharp";
import type { Article } from "@/lib/types";
import { getCategory } from "@/lib/data";
import { prisma } from "@/lib/prisma";
import { getArticleById } from "@/lib/store";

/**
 * Đăng bài lên Facebook Page của toà soạn.
 *
 * Chiến lược tương tác, dựng thẳng vào cách đăng:
 * - Đăng theo KHUNG GIỜ VÀNG (giờ Việt Nam), tối đa POSTS_PER_DAY bài/ngày.
 *   Đổ 17 bài một lúc thì Facebook chỉ đẩy vài bài đầu, còn lại chìm hết.
 * - Link bài viết nằm ở BÌNH LUẬN ĐẦU TIÊN, không ở caption: bài có link ngoài
 *   bị Facebook hạ tiếp cận.
 * - Đăng dạng ẢNH (ảnh bìa của bài), vì bài ảnh được tiếp cận nhiều hơn bài chữ.
 * - Caption viết như người biên tập đăng: tít, một câu tóm tắt, hashtag.
 *   Không nhắc gì tới cách bài được đăng.
 */

const GRAPH = "https://graph.facebook.com/v20.0";
const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL ?? "https://genz-news.site";

/** Giờ Việt Nam. */
export const GOLDEN_HOURS = ["07:00", "11:30", "17:30", "20:30"];
export const POSTS_PER_DAY = 4;

/** Bài quá hạn lâu hơn mức này (cron chết, máy tắt) thì dời sang giờ vàng kế tiếp thay vì đăng dồn. */
const MAX_LATE_MS = 2 * 60 * 60 * 1000;
/** Kẹt ở "publishing" lâu hơn mức này là tiến trình đăng đã chết giữa chừng. */
const STUCK_MS = 15 * 60 * 1000;

export type FacebookPostStatus = "scheduled" | "publishing" | "published" | "failed";

// ---------- nội dung ----------

const hashtag = (text: string) => `#${text.normalize("NFC").replace(/[^\p{L}\p{N}]+/gu, "")}`;

export function formatFacebookCaption(article: Pick<Article, "title" | "dek" | "category" | "tags">): string {
  const category = getCategory(article.category);
  const tags = [
    "#GenZNews",
    category ? hashtag(category.name) : "",
    ...article.tags.slice(0, 3).map(hashtag),
  ].filter((t) => t.length > 1);

  return [
    `⚡ ${article.title.toUpperCase()}`,
    article.dek ? `\n📌 ${article.dek}` : "",
    "\n👇 Chi tiết và nguồn trích dẫn ở bình luận bên dưới!",
    `\n${[...new Set(tags)].join(" ")}`,
  ]
    .join("\n")
    .trim();
}

export function formatFacebookComment(article: Pick<Article, "slug">): string {
  return `👉 Đọc đầy đủ bài viết tại: ${BASE_URL}/bai-viet/${article.slug}`;
}

// ---------- giờ vàng ----------

/** Ngày theo giờ Việt Nam, dạng YYYY-MM-DD. */
export function vnDateKey(d: Date): string {
  return new Date(d.getTime() + 7 * 3600 * 1000).toISOString().slice(0, 10);
}

function slotAt(dateKey: string, hhmm: string) {
  return new Date(`${dateKey}T${hhmm}:00+07:00`);
}

function addDays(dateKey: string, n: number) {
  const d = new Date(`${dateKey}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/**
 * `count` giờ vàng còn trống kể từ `from`: chưa có bài nào chiếm đúng giờ đó,
 * và ngày đó chưa đủ `perDay` bài (tính cả bài đã đăng lẫn đã lên lịch).
 */
export async function nextFreeSlots(count: number, from = new Date(), perDay = POSTS_PER_DAY) {
  const horizon = 30;
  const today = vnDateKey(from);
  const rows = await prisma.facebookPost.findMany({
    where: {
      status: { in: ["scheduled", "publishing", "published"] },
      OR: [
        { scheduledAt: { gte: slotAt(today, "00:00") } },
        { postedAt: { gte: slotAt(today, "00:00") } },
      ],
    },
    select: { scheduledAt: true, postedAt: true, status: true },
  });

  const taken = new Set<number>();
  const perDayCount = new Map<string, number>();
  for (const r of rows) {
    const at = r.status === "published" ? (r.postedAt ?? r.scheduledAt) : r.scheduledAt;
    if (!at) continue;
    if (r.scheduledAt) taken.add(r.scheduledAt.getTime());
    const key = vnDateKey(at);
    perDayCount.set(key, (perDayCount.get(key) ?? 0) + 1);
  }

  const slots: Date[] = [];
  const earliest = from.getTime() + 5 * 60 * 1000;
  for (let day = 0; day < horizon && slots.length < count; day++) {
    const key = addDays(today, day);
    for (const hhmm of GOLDEN_HOURS) {
      if (slots.length >= count) break;
      const at = slotAt(key, hhmm);
      if (at.getTime() < earliest || taken.has(at.getTime())) continue;
      if ((perDayCount.get(key) ?? 0) >= perDay) break;
      slots.push(at);
      perDayCount.set(key, (perDayCount.get(key) ?? 0) + 1);
    }
  }
  return slots;
}

// ---------- Graph API ----------

export function facebookConfigured() {
  return Boolean(process.env.FB_PAGE_ID && process.env.FB_PAGE_ACCESS_TOKEN);
}

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
  if (!res.ok || data.error) {
    throw new Error(data.error?.message ?? `Facebook trả HTTP ${res.status}`);
  }
  return data;
}

/**
 * Ảnh bìa đổi sang JPEG rồi gửi thẳng tệp lên Facebook.
 * Ảnh trong kho giờ là WebP, mà Graph API không nhận WebP chắc chắn; gửi tệp
 * cũng khỏi phụ thuộc chuyện máy chủ Facebook có tải được URL của mình không.
 */
async function coverAsJpeg(article: Article): Promise<Buffer | null> {
  if (!article.coverImage) return null;
  try {
    const res = await fetch(article.coverImage, { signal: AbortSignal.timeout(30_000) });
    if (!res.ok) return null;
    const input = Buffer.from(await res.arrayBuffer());
    return await sharp(input)
      .rotate()
      .resize({ width: 2048, height: 2048, fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 88 })
      .toBuffer();
  } catch {
    return null;
  }
}

async function createOnFacebook(article: Article, caption: string, comment: string) {
  const { pageId } = credentials();
  let fbPostId: string;
  let fbPhotoId: string | null = null;

  const jpeg = await coverAsJpeg(article);
  if (jpeg) {
    const form = new FormData();
    form.set("source", new Blob([new Uint8Array(jpeg)], { type: "image/jpeg" }), "cover.jpg");
    form.set("caption", caption);
    form.set("published", "true");
    const data = await graph<{ id: string; post_id?: string }>(`${pageId}/photos`, "POST", form);
    fbPhotoId = data.id;
    fbPostId = data.post_id ?? `${pageId}_${data.id}`;
  } else {
    const data = await graph<{ id: string }>(`${pageId}/feed`, "POST", { message: caption });
    fbPostId = data.id;
  }

  // Bình luận hỏng không làm hỏng cả bài: bài đã lên Page rồi. Ghi lại để sửa tay.
  let fbCommentId: string | null = null;
  let commentError: string | null = null;
  try {
    const c = await graph<{ id: string }>(`${fbPostId}/comments`, "POST", { message: comment });
    fbCommentId = c.id;
  } catch (err) {
    commentError = `Đã đăng bài nhưng chưa đăng được bình luận link: ${(err as Error).message}`;
  }
  return { fbPostId, fbPhotoId, fbCommentId, commentError };
}

// ---------- thao tác trên bản ghi ----------

async function loadArticle(articleId: string) {
  const article = await getArticleById(articleId);
  if (!article) throw new Error("Không tìm thấy bài viết");
  if (article.status !== "published") throw new Error("Bài chưa đăng trên web, chưa đưa lên Facebook được");
  return article;
}

/** Lên lịch (hoặc dời lịch) một bài. Không đụng tới bài đã lên Page. */
export async function scheduleFacebookPost(
  articleId: string,
  input: { caption?: string; comment?: string; scheduledAt?: Date },
) {
  const article = await loadArticle(articleId);
  const existing = await prisma.facebookPost.findUnique({ where: { articleId } });
  if (existing && (existing.status === "published" || existing.status === "publishing")) {
    throw new Error("Bài này đã lên Facebook. Dùng Sửa để đổi nội dung.");
  }
  const scheduledAt = input.scheduledAt ?? (await nextFreeSlots(1))[0];
  if (!scheduledAt) throw new Error("Không còn giờ vàng trống trong 30 ngày tới");

  const data = {
    status: "scheduled",
    caption: input.caption?.trim() || existing?.caption || formatFacebookCaption(article),
    comment: input.comment?.trim() || existing?.comment || formatFacebookComment(article),
    scheduledAt,
    lastError: null,
  };
  return prisma.facebookPost.upsert({
    where: { articleId },
    create: { articleId, ...data },
    update: data,
  });
}

/**
 * Đăng một bản ghi ngay. Chỉ đăng khi "giành" được bản ghi: đổi trạng thái sang
 * publishing thành công — hai lượt chạy chồng nhau thì chỉ một lượt đăng.
 */
async function publishRecord(id: string, from: FacebookPostStatus[]) {
  const claimed = await prisma.facebookPost.updateMany({
    where: { id, status: { in: from } },
    data: { status: "publishing", lastError: null },
  });
  if (claimed.count !== 1) throw new Error("Bài đang được đăng ở một lượt khác");

  const rec = await prisma.facebookPost.findUniqueOrThrow({ where: { id } });
  try {
    const article = await loadArticle(rec.articleId);
    const out = await createOnFacebook(article, rec.caption, rec.comment);
    return await prisma.facebookPost.update({
      where: { id },
      data: {
        status: "published",
        fbPostId: out.fbPostId,
        fbPhotoId: out.fbPhotoId,
        fbCommentId: out.fbCommentId,
        postedAt: new Date(),
        lastError: out.commentError,
      },
    });
  } catch (err) {
    await prisma.facebookPost.update({
      where: { id },
      data: { status: "failed", lastError: (err as Error).message },
    });
    throw err;
  }
}

/** Gọi khi bài vừa lên web: xếp vào giờ vàng kế tiếp, trừ khi đã có lịch / đã đăng. */
export async function autoScheduleOnPublish(articleId: string) {
  if (!facebookConfigured()) return null;
  const existing = await prisma.facebookPost.findUnique({ where: { articleId } });
  if (existing) return existing;
  return scheduleFacebookPost(articleId, {});
}

/**
 * Đưa các bài vào hàng đợi "đăng ngay" (scheduledAt = bây giờ) rồi trả về luôn;
 * việc đăng chạy nền (route gọi runDueFacebookPosts sau khi trả lời, cron
 * 5 phút cũng nhặt). Bài đã lên Page thì bỏ qua. Caption/bình luận chỉ áp khi
 * đưa MỘT bài (từ khung soạn).
 */
export async function queueFacebookPostsNow(
  articleIds: string[],
  input: { caption?: string; comment?: string } = {},
) {
  const queued: string[] = [];
  const skipped: { articleId: string; reason: string }[] = [];
  const now = new Date();
  for (const articleId of articleIds) {
    try {
      await scheduleFacebookPost(articleId, {
        ...(articleIds.length === 1 ? input : {}),
        scheduledAt: now,
      });
      queued.push(articleId);
    } catch (err) {
      skipped.push({ articleId, reason: (err as Error).message });
    }
  }
  return { queued, skipped };
}

/** Xếp nhiều bài vào các giờ vàng trống kế tiếp, mỗi bài một giờ. */
export async function scheduleFacebookPostsGolden(articleIds: string[], perDay = POSTS_PER_DAY) {
  const queued: { articleId: string; scheduledAt: Date }[] = [];
  const skipped: { articleId: string; reason: string }[] = [];
  for (const articleId of articleIds) {
    // Tính lại giờ trống sau mỗi bài: bài vừa xếp đã chiếm một giờ.
    const [slot] = await nextFreeSlots(1, new Date(), perDay);
    if (!slot) {
      skipped.push({ articleId, reason: "Hết giờ vàng trống trong 30 ngày tới" });
      continue;
    }
    try {
      await scheduleFacebookPost(articleId, { scheduledAt: slot });
      queued.push({ articleId, scheduledAt: slot });
    } catch (err) {
      skipped.push({ articleId, reason: (err as Error).message });
    }
  }
  return { queued, skipped };
}

/** Sửa caption / bình luận. Bài đã lên Page thì sửa luôn trên Facebook. */
export async function updateFacebookPost(
  articleId: string,
  input: { caption?: string; comment?: string; scheduledAt?: Date },
) {
  const rec = await prisma.facebookPost.findUnique({ where: { articleId } });
  if (!rec) throw new Error("Bài này chưa có trên Facebook hay trong lịch đăng");
  const caption = input.caption?.trim() || rec.caption;
  const comment = input.comment?.trim() || rec.comment;

  if (rec.status !== "published") {
    return scheduleFacebookPost(articleId, {
      caption,
      comment,
      scheduledAt: input.scheduledAt ?? rec.scheduledAt ?? undefined,
    });
  }

  if (caption !== rec.caption && rec.fbPostId) {
    // Bài ảnh: caption là thuộc tính của tấm ảnh; bài chữ: message của post.
    try {
      await graph(rec.fbPostId, "POST", { message: caption });
    } catch (err) {
      if (!rec.fbPhotoId) throw err;
      await graph(rec.fbPhotoId, "POST", { name: caption });
    }
  }

  let fbCommentId = rec.fbCommentId;
  if (comment !== rec.comment || !fbCommentId) {
    if (fbCommentId) {
      await graph(fbCommentId, "POST", { message: comment });
    } else if (rec.fbPostId) {
      fbCommentId = (await graph<{ id: string }>(`${rec.fbPostId}/comments`, "POST", { message: comment })).id;
    }
  }

  return prisma.facebookPost.update({
    where: { id: rec.id },
    data: { caption, comment, fbCommentId, lastError: null },
  });
}

/** Gỡ bài khỏi Page (nếu đã đăng) hoặc huỷ lịch. */
export async function removeFacebookPost(articleId: string, opts: { onlyUnpublished?: boolean } = {}) {
  const rec = await prisma.facebookPost.findUnique({ where: { articleId } });
  if (!rec) return;
  if (opts.onlyUnpublished && rec.status === "published") {
    throw new Error("Bài đã lên Page, gỡ riêng từng bài");
  }
  if (rec.status === "publishing") throw new Error("Bài đang được đăng, thử lại sau ít phút");
  if (rec.status === "published" && rec.fbPostId) {
    // Bài ảnh: có lúc chỉ xoá được qua id của tấm ảnh (đã thử trên Page thật).
    try {
      await graph(rec.fbPostId, "DELETE");
    } catch (err) {
      if (!rec.fbPhotoId) throw err;
      await graph(rec.fbPhotoId, "DELETE");
    }
  }
  await prisma.facebookPost.delete({ where: { id: rec.id } });
}

/** Xếp các bài đăng web hôm nay (giờ VN) mà chưa có trên Facebook vào giờ vàng còn trống. */
export async function scheduleTodayArticles(perDay = POSTS_PER_DAY) {
  const today = vnDateKey(new Date());
  const articles = await prisma.article.findMany({
    where: { status: "published", publishedAt: today, facebookPost: { is: null } },
    orderBy: { createdAt: "asc" },
    select: { id: true, title: true },
  });
  const slots = await nextFreeSlots(articles.length, new Date(), perDay);
  const done: { articleId: string; title: string; scheduledAt: Date }[] = [];
  for (const [i, a] of articles.entries()) {
    const at = slots[i];
    if (!at) break;
    await scheduleFacebookPost(a.id, { scheduledAt: at });
    done.push({ articleId: a.id, title: a.title, scheduledAt: at });
  }
  return { scheduled: done, total: articles.length };
}

/**
 * Chạy theo cron (scripts/facebook-run-due.mjs, 5 phút một lần): đăng các bài
 * tới giờ. Bài trễ quá MAX_LATE_MS thì dời sang giờ vàng kế tiếp.
 */
let running: Promise<{ articleId: string; outcome: string }[]> | null = null;

export function runDueFacebookPosts(now = new Date()) {
  // Nhiều request cùng gọi (mỗi lần bấm "đăng ngay" + cron): chờ chung một lượt.
  // Bài vừa được đưa vào sau khi lượt đang chạy đã đọc danh sách thì lượt kế
  // tiếp (hoặc cron 5 phút) sẽ nhặt; khoá "claim" ở publishRecord vẫn chặn đăng trùng.
  if (!running) {
    running = runDueOnce(now).finally(() => {
      running = null;
    });
  }
  return running;
}

async function runDueOnce(now: Date) {
  const results: { articleId: string; outcome: string }[] = [];

  // Tiến trình chết giữa lúc đăng: không biết bài đã lên Page hay chưa, nên
  // KHÔNG tự đăng lại — đánh dấu hỏng để người kiểm tra Page rồi quyết.
  await prisma.facebookPost.updateMany({
    where: { status: "publishing", updatedAt: { lt: new Date(now.getTime() - STUCK_MS) } },
    data: {
      status: "failed",
      lastError: "Lượt đăng bị ngắt giữa chừng. Kiểm tra trên Page trước khi đăng lại.",
    },
  });

  const due = await prisma.facebookPost.findMany({
    where: { status: "scheduled", scheduledAt: { lte: now } },
    orderBy: { scheduledAt: "asc" },
  });

  for (const rec of due) {
    if (rec.scheduledAt && now.getTime() - rec.scheduledAt.getTime() > MAX_LATE_MS) {
      const [slot] = await nextFreeSlots(1, now);
      if (slot) {
        await prisma.facebookPost.update({ where: { id: rec.id }, data: { scheduledAt: slot } });
        results.push({ articleId: rec.articleId, outcome: `dời sang ${slot.toISOString()}` });
        continue;
      }
    }
    try {
      const out = await publishRecord(rec.id, ["scheduled"]);
      results.push({ articleId: rec.articleId, outcome: `đã đăng ${out.fbPostId}` });
    } catch (err) {
      results.push({ articleId: rec.articleId, outcome: `lỗi: ${(err as Error).message}` });
    }
  }
  return results;
}
