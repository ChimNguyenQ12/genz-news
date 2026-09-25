import { prisma } from "@/lib/prisma";
import { getArticleById } from "@/lib/store";
import { facebookDriver } from "./facebook";
import { threadsDriver } from "./threads";
import { PLATFORMS, type Platform, type SocialDriver, type SocialPostStatus } from "./types";

/**
 * Hàng đợi đăng bài lên mạng xã hội, dùng chung cho mọi nền tảng.
 *
 * Chiến lược tương tác:
 * - Đăng theo KHUNG GIỜ VÀNG (giờ Việt Nam), tối đa POSTS_PER_DAY bài/ngày
 *   trên MỖI nền tảng. Đổ nhiều bài một lúc thì chỉ vài bài đầu được đẩy.
 * - Link bài ở bình luận / reply đầu tiên (xem từng driver).
 * - Nền tảng autoPick (Facebook): tới giờ vàng mà người biên tập chưa đặt bài
 *   nào, tự chọn bài có ĐIỂM NÓNG cao nhất trong 2 ngày gần đây chưa lên. Chọn
 *   lúc tới giờ chứ không xếp trước, nên bài hot viết lúc 18:00 vẫn giành được
 *   khung 20:30 thay vì kẹt sau các bài xếp từ sáng. Mỗi ngày tối đa
 *   POSTS_PER_DAY bài; bài không lọt top thì không lên.
 * - Nền tảng không autoPick (Threads): chỉ đăng bài người biên tập tự đặt lịch.
 */

/** 6 khung: sáng đi học/đi làm, giữa buổi sáng, trưa, tan tầm, tối, trước khi ngủ. */
export const GOLDEN_HOURS = ["07:00", "09:30", "11:30", "17:30", "20:30", "22:00"];
export const POSTS_PER_DAY = 6;

/** Tới giờ vàng thì còn bao lâu để tự chọn bài; trễ hơn (cron chết) thì bỏ khung đó. */
const AUTO_PICK_WINDOW_MS = 30 * 60 * 1000;
/** Điểm cho bài không gắn với đề tài nào có điểm (bài người biên tập tự viết). */
const DEFAULT_SCORE = 50;

/** Trễ quá mức này (cron chết, máy tắt) thì dời sang giờ vàng kế tiếp, không đăng dồn. */
const MAX_LATE_MS = 2 * 60 * 60 * 1000;
/** Kẹt ở "publishing" lâu hơn mức này là lượt đăng đã chết giữa chừng. */
const STUCK_MS = 15 * 60 * 1000;

const DRIVERS: Record<Platform, SocialDriver> = {
  facebook: facebookDriver,
  threads: threadsDriver,
};

export const driverFor = (p: Platform) => DRIVERS[p];

// ---------- giờ vàng ----------

/** Ngày theo giờ Việt Nam, dạng YYYY-MM-DD. */
export function vnDateKey(d: Date): string {
  return new Date(d.getTime() + 7 * 3600 * 1000).toISOString().slice(0, 10);
}

const slotAt = (dateKey: string, hhmm: string) => new Date(`${dateKey}T${hhmm}:00+07:00`);

function addDays(dateKey: string, n: number) {
  const d = new Date(`${dateKey}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/**
 * `count` giờ vàng còn trống trên `platform` kể từ `from`: chưa có bài nào
 * chiếm đúng giờ đó, và ngày đó chưa đủ `perDay` bài.
 */
export async function nextFreeSlots(
  platform: Platform,
  count: number,
  from = new Date(),
  perDay = POSTS_PER_DAY,
) {
  const today = vnDateKey(from);
  const rows = await prisma.socialPost.findMany({
    where: {
      platform,
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
    perDayCount.set(vnDateKey(at), (perDayCount.get(vnDateKey(at)) ?? 0) + 1);
  }

  const slots: Date[] = [];
  const earliest = from.getTime() + 5 * 60 * 1000;
  for (let day = 0; day < 30 && slots.length < count; day++) {
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

// ---------- điểm nóng ----------

/**
 * Điểm nóng của từng bài, lấy từ đề tài sinh ra nó: scripts/collect-trends.mjs
 * ghi "điểm nóng N" (và "ƯU TIÊN") vào notes của research_requests, còn
 * articleIds nối đề tài với bài. Không có thì DEFAULT_SCORE.
 */
export async function articleScores(): Promise<Map<string, number>> {
  const rows = await prisma.researchRequest.findMany({
    where: { articleIds: { not: "[]" } },
    select: { articleIds: true, notes: true },
  });
  const scores = new Map<string, number>();
  for (const r of rows) {
    const m = /điểm nóng (-?\d+)/.exec(r.notes);
    if (!m) continue;
    // ƯU TIÊN (chủ quyền, Việt–Trung) nhỉnh hơn một chút khi bằng điểm.
    const score = Number(m[1]) + (/ƯU TIÊN/.test(r.notes) ? 0.5 : 0);
    let ids: string[] = [];
    try {
      ids = JSON.parse(r.articleIds);
    } catch {
      continue;
    }
    for (const id of ids) scores.set(id, Math.max(scores.get(id) ?? -Infinity, score));
  }
  return scores;
}

const scoreOf = (scores: Map<string, number>, id: string) => scores.get(id) ?? DEFAULT_SCORE;

/** Bài đăng web hôm nay và hôm qua (giờ VN) chưa có gì trên nền tảng này, nóng nhất trước. */
async function hotCandidates(platform: Platform, now = new Date()) {
  const today = vnDateKey(now);
  const articles = await prisma.article.findMany({
    where: {
      status: "published",
      publishedAt: { in: [today, addDays(today, -1)] },
      socialPosts: { none: { platform } },
    },
    select: { id: true, title: true, createdAt: true },
  });
  const scores = await articleScores();
  return articles
    .map((a) => ({ ...a, score: scoreOf(scores, a.id) }))
    .sort((a, b) => b.score - a.score || b.createdAt.getTime() - a.createdAt.getTime());
}

/** Số bài đã lên / sắp lên trong ngày (giờ VN) của `now` trên nền tảng. */
async function countForDay(platform: Platform, now: Date) {
  const start = slotAt(vnDateKey(now), "00:00");
  const end = slotAt(addDays(vnDateKey(now), 1), "00:00");
  return prisma.socialPost.count({
    where: {
      platform,
      OR: [
        { status: "published", postedAt: { gte: start, lt: end } },
        { status: { in: ["scheduled", "publishing"] }, scheduledAt: { gte: start, lt: end } },
      ],
    },
  });
}

/**
 * Giờ vàng kế tiếp mà máy sẽ TỰ chọn bài (chưa ai đặt bài vào đó) và bài
 * đang đứng đầu danh sách lúc này — để trang quản trị cho người biên tập thấy trước.
 */
export async function autoPickPreview(platform: Platform, now = new Date()) {
  if (!driverFor(platform).autoPick) return null;
  const [slot] = await nextFreeSlots(platform, 1, new Date(now.getTime() - 5 * 60 * 1000));
  if (!slot || vnDateKey(slot) !== vnDateKey(now)) return { slot: slot ?? null, article: null };
  const [top] = await hotCandidates(platform, now);
  return { slot, article: top ? { id: top.id, title: top.title, score: top.score } : null };
}

/** Tới giờ vàng mà trống: chọn bài nóng nhất và đặt vào đúng giờ đó (vòng đăng ngay sau sẽ đăng). */
async function autoPick(platform: Platform, now: Date) {
  const today = vnDateKey(now);
  const out: { platform: string; articleId: string; outcome: string }[] = [];
  for (const hhmm of GOLDEN_HOURS) {
    const slot = slotAt(today, hhmm);
    const age = now.getTime() - slot.getTime();
    if (age < 0 || age > AUTO_PICK_WINDOW_MS) continue;
    // Khung đã có bài nếu có bài đặt / đã lên trong vòng ±30 phút — vừa bấm
    // "đăng ngay" lúc 9:25 thì đừng tự đăng thêm một bài nữa lúc 9:30.
    const near = { gte: new Date(slot.getTime() - AUTO_PICK_WINDOW_MS), lte: new Date(slot.getTime() + AUTO_PICK_WINDOW_MS) };
    const taken = await prisma.socialPost.count({
      where: {
        platform,
        OR: [
          { status: { in: ["scheduled", "publishing"] }, scheduledAt: near },
          { status: "published", postedAt: near },
        ],
      },
    });
    if (taken) continue;
    if ((await countForDay(platform, now)) >= POSTS_PER_DAY) continue;
    const [top] = await hotCandidates(platform, now);
    if (!top) continue;
    try {
      await schedulePost(platform, top.id, { scheduledAt: slot });
      out.push({ platform, articleId: top.id, outcome: `tự chọn cho ${hhmm} (điểm ${top.score})` });
    } catch (err) {
      out.push({ platform, articleId: top.id, outcome: `tự chọn lỗi: ${(err as Error).message}` });
    }
  }
  return out;
}

// ---------- thao tác ----------

async function loadArticle(articleId: string) {
  const article = await getArticleById(articleId);
  if (!article) throw new Error("Không tìm thấy bài viết");
  if (article.status !== "published") throw new Error("Bài chưa đăng trên web");
  return article;
}

const findPost = (platform: Platform, articleId: string) =>
  prisma.socialPost.findUnique({ where: { articleId_platform: { articleId, platform } } });

function checkLength(driver: SocialDriver, caption: string) {
  if (driver.maxCaption && caption.length > driver.maxCaption) {
    throw new Error(`Bài ${driver.label} dài ${caption.length} ký tự, tối đa ${driver.maxCaption}`);
  }
}

/** Lên lịch (hoặc dời lịch) một bài. Không đụng tới bài đã đăng. */
export async function schedulePost(
  platform: Platform,
  articleId: string,
  input: { caption?: string; comment?: string; scheduledAt?: Date },
) {
  const driver = driverFor(platform);
  if (!driver.configured()) throw new Error(`Chưa cấu hình ${driver.label}`);
  const article = await loadArticle(articleId);
  const existing = await findPost(platform, articleId);
  if (existing && (existing.status === "published" || existing.status === "publishing")) {
    throw new Error(`Bài này đã lên ${driver.label}.`);
  }
  const scheduledAt = input.scheduledAt ?? (await nextFreeSlots(platform, 1))[0];
  if (!scheduledAt) throw new Error("Không còn giờ vàng trống trong 30 ngày tới");

  const caption = input.caption?.trim() || existing?.caption || driver.formatCaption(article);
  checkLength(driver, caption);
  const data = {
    status: "scheduled",
    caption,
    comment: input.comment?.trim() || existing?.comment || driver.formatComment(article),
    scheduledAt,
    lastError: null,
  };
  return prisma.socialPost.upsert({
    where: { articleId_platform: { articleId, platform } },
    create: { articleId, platform, ...data },
    update: data,
  });
}

/** Loại bài khỏi danh sách tự chọn (nền tảng autoPick). Bài đã lên thì không đụng. */
export async function skipPost(platform: Platform, articleId: string) {
  const driver = driverFor(platform);
  const article = await loadArticle(articleId);
  const existing = await findPost(platform, articleId);
  if (existing && (existing.status === "published" || existing.status === "publishing")) {
    throw new Error(`Bài này đã lên ${driver.label}.`);
  }
  const data = {
    status: "skipped",
    caption: existing?.caption ?? driver.formatCaption(article),
    comment: existing?.comment ?? driver.formatComment(article),
    scheduledAt: null,
    lastError: null,
  };
  return prisma.socialPost.upsert({
    where: { articleId_platform: { articleId, platform } },
    create: { articleId, platform, ...data },
    update: data,
  });
}

/** Đưa bài vào hàng đợi đăng ngay (scheduledAt = bây giờ); việc đăng chạy nền. */
export async function queueNow(
  platform: Platform,
  articleIds: string[],
  input: { caption?: string; comment?: string } = {},
) {
  const queued: string[] = [];
  const skipped: { articleId: string; reason: string }[] = [];
  const now = new Date();
  for (const articleId of articleIds) {
    try {
      // Caption/bình luận riêng chỉ áp khi đưa MỘT bài (từ khung soạn).
      await schedulePost(platform, articleId, { ...(articleIds.length === 1 ? input : {}), scheduledAt: now });
      queued.push(articleId);
    } catch (err) {
      skipped.push({ articleId, reason: (err as Error).message });
    }
  }
  return { queued, skipped };
}

/** Xếp nhiều bài vào các giờ vàng trống kế tiếp, mỗi bài một giờ. */
export async function scheduleGolden(platform: Platform, articleIds: string[], perDay = POSTS_PER_DAY) {
  const queued: { articleId: string; scheduledAt: Date }[] = [];
  const skipped: { articleId: string; reason: string }[] = [];
  for (const articleId of articleIds) {
    const [slot] = await nextFreeSlots(platform, 1, new Date(), perDay);
    if (!slot) {
      skipped.push({ articleId, reason: "Hết giờ vàng trống trong 30 ngày tới" });
      continue;
    }
    try {
      await schedulePost(platform, articleId, { scheduledAt: slot });
      queued.push({ articleId, scheduledAt: slot });
    } catch (err) {
      skipped.push({ articleId, reason: (err as Error).message });
    }
  }
  return { queued, skipped };
}

/**
 * Lấp các giờ vàng CÒN TRỐNG HÔM NAY bằng những bài nóng nhất (hôm nay + hôm
 * qua) chưa lên nền tảng này. Không tràn sang ngày mai: bài không lọt top thì thôi.
 */
export async function scheduleToday(platform: Platform, perDay = POSTS_PER_DAY) {
  const now = new Date();
  const candidates = await hotCandidates(platform, now);
  const slots = (await nextFreeSlots(platform, perDay, now, perDay)).filter(
    (s) => vnDateKey(s) === vnDateKey(now),
  );
  const scheduled: { articleId: string; title: string; score: number; scheduledAt: Date }[] = [];
  for (const [i, slot] of slots.entries()) {
    const c = candidates[i];
    if (!c) break;
    await schedulePost(platform, c.id, { scheduledAt: slot });
    scheduled.push({ articleId: c.id, title: c.title, score: c.score, scheduledAt: slot });
  }
  return { scheduled, total: candidates.length, freeSlots: slots.length };
}

/** Sửa caption / bình luận / giờ đăng. Bài đã đăng thì sửa luôn trên nền tảng (nếu nền tảng cho). */
export async function updatePost(
  platform: Platform,
  articleId: string,
  input: { caption?: string; comment?: string; scheduledAt?: Date },
) {
  const driver = driverFor(platform);
  const rec = await findPost(platform, articleId);
  if (!rec) throw new Error(`Bài này chưa có trên ${driver.label} hay trong lịch đăng`);
  const caption = input.caption?.trim() || rec.caption;
  const comment = input.comment?.trim() || rec.comment;

  if (rec.status !== "published") {
    return schedulePost(platform, articleId, {
      caption,
      comment,
      scheduledAt: input.scheduledAt ?? rec.scheduledAt ?? undefined,
    });
  }
  if (!driver.canEditPublished || !driver.update) {
    throw new Error(`${driver.label} không cho sửa bài đã đăng. Gỡ bài rồi đăng lại nếu cần.`);
  }
  checkLength(driver, caption);
  const { remoteCommentId } = await driver.update(rec, {
    caption: caption !== rec.caption ? caption : undefined,
    comment: comment !== rec.comment || !rec.remoteCommentId ? comment : undefined,
  });
  return prisma.socialPost.update({
    where: { id: rec.id },
    data: { caption, comment, remoteCommentId, lastError: null },
  });
}

/** Gỡ bài khỏi nền tảng (nếu đã đăng) hoặc huỷ lịch. */
export async function removePost(
  platform: Platform,
  articleId: string,
  opts: { onlyUnpublished?: boolean } = {},
) {
  const driver = driverFor(platform);
  const rec = await findPost(platform, articleId);
  if (!rec) return;
  if (rec.status === "publishing") throw new Error("Bài đang được đăng, thử lại sau ít phút");
  if (rec.status === "published") {
    if (opts.onlyUnpublished) throw new Error("Bài đã lên, gỡ riêng từng bài");
    await driver.remove(rec);
  }
  await prisma.socialPost.delete({ where: { id: rec.id } });
}

/**
 * Đăng một bản ghi. Chỉ đăng khi "giành" được nó: đổi scheduled → publishing
 * thành công. Hai lượt chạy chồng nhau thì chỉ một lượt đăng.
 */
async function publishRecord(id: string) {
  const claimed = await prisma.socialPost.updateMany({
    where: { id, status: "scheduled" },
    data: { status: "publishing", lastError: null },
  });
  if (claimed.count !== 1) throw new Error("Bài đang được đăng ở một lượt khác");

  const rec = await prisma.socialPost.findUniqueOrThrow({ where: { id } });
  const driver = driverFor(rec.platform as Platform);
  try {
    const article = await loadArticle(rec.articleId);
    const out = await driver.create(article, rec.caption, rec.comment);
    return await prisma.socialPost.update({
      where: { id },
      data: {
        status: "published",
        remotePostId: out.remotePostId,
        remoteMediaId: out.remoteMediaId ?? null,
        remoteCommentId: out.remoteCommentId ?? null,
        permalink: out.permalink ?? null,
        postedAt: new Date(),
        lastError: out.commentError ?? null,
      },
    });
  } catch (err) {
    await prisma.socialPost.update({
      where: { id },
      data: { status: "failed" satisfies SocialPostStatus, lastError: (err as Error).message },
    });
    throw err;
  }
}

async function runDueOnce(now: Date) {
  const results: { platform: string; articleId: string; outcome: string }[] = [];

  for (const platform of PLATFORMS) {
    const driver = driverFor(platform);
    if (!driver.configured()) continue;
    try {
      await driver.maintenance?.();
    } catch (err) {
      results.push({ platform, articleId: "-", outcome: `bảo trì lỗi: ${(err as Error).message}` });
    }
  }

  // Lượt đăng chết giữa chừng: không biết bài đã lên hay chưa, nên KHÔNG tự
  // đăng lại — đánh dấu lỗi để người kiểm tra trên nền tảng rồi quyết.
  await prisma.socialPost.updateMany({
    where: { status: "publishing", updatedAt: { lt: new Date(now.getTime() - STUCK_MS) } },
    data: { status: "failed", lastError: "Lượt đăng bị ngắt giữa chừng. Kiểm tra trên nền tảng trước khi đăng lại." },
  });

  for (const platform of PLATFORMS) {
    const driver = driverFor(platform);
    if (driver.autoPick && driver.configured()) results.push(...(await autoPick(platform, now)));
  }

  const due = await prisma.socialPost.findMany({
    where: { status: "scheduled", scheduledAt: { lte: now } },
    orderBy: { scheduledAt: "asc" },
  });
  for (const rec of due) {
    const platform = rec.platform as Platform;
    if (rec.scheduledAt && now.getTime() - rec.scheduledAt.getTime() > MAX_LATE_MS) {
      const [slot] = await nextFreeSlots(platform, 1, now);
      if (slot) {
        await prisma.socialPost.update({ where: { id: rec.id }, data: { scheduledAt: slot } });
        results.push({ platform, articleId: rec.articleId, outcome: `dời sang ${slot.toISOString()}` });
        continue;
      }
    }
    try {
      const out = await publishRecord(rec.id);
      results.push({ platform, articleId: rec.articleId, outcome: `đã đăng ${out.remotePostId}` });
    } catch (err) {
      results.push({ platform, articleId: rec.articleId, outcome: `lỗi: ${(err as Error).message}` });
    }
  }
  return results;
}

let running: ReturnType<typeof runDueOnce> | null = null;

/**
 * Đăng các bài tới giờ trên mọi nền tảng. Gọi từ cron (scripts/social-run-due.mjs)
 * và sau mỗi lần bấm "đăng ngay". Nhiều lời gọi cùng lúc thì chờ chung một lượt;
 * bài vào sau khi lượt đang chạy đã đọc danh sách thì lượt kế tiếp (cron) nhặt.
 */
export function runDue(now = new Date()) {
  if (!running) {
    running = runDueOnce(now).finally(() => {
      running = null;
    });
  }
  return running;
}
