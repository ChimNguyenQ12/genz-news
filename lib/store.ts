import crypto from "crypto";
import { prisma } from "./prisma";
import type { Article, ArticleLanguage, ArticleStatus, CategorySlug } from "./types";
import { normalizeArticleHtml } from "./html";
import { HERO_SLOTS, TRENDING_SLOTS } from "./placement";

export function makeId() {
  return crypto.randomUUID();
}

export function slugify(input: string) {
  return input
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 80);
}

/** SQLite không có kiểu mảng nên các danh sách lưu dưới dạng chuỗi JSON. */
function parseList(value: string | null | undefined, fallback: string[] = []): string[] {
  if (!value) return fallback;
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.map(String) : fallback;
  } catch {
    return fallback;
  }
}

const DEFAULT_GRADIENT: [string, string] = ["#7C3AED", "#22D3EE"];

function parseGradient(value: string | null | undefined): [string, string] {
  const list = parseList(value);
  return list.length === 2 ? [list[0], list[1]] : DEFAULT_GRADIENT;
}

/** Kiểu bản ghi Prisma trả về kèm quan hệ sources. */
type ArticleRow = Awaited<
  ReturnType<typeof prisma.article.findFirstOrThrow<{ include: { sources: true } }>>
>;

function toArticle(row: ArticleRow): Article {
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    dek: row.dek,
    category: row.category as CategorySlug,
    tags: parseList(row.tags),
    coverGradient: parseGradient(row.coverGradient),
    coverImage: row.coverImage ?? undefined,
    coverImageCaption: row.coverImageCaption ?? undefined,
    author: row.author,
    authorId: row.authorId ?? undefined,
    publishedAt: row.publishedAt,
    readingTimeMin: row.readingTimeMin,
    featured: row.featured,
    trending: row.trending,
    featuredOrder: row.featuredOrder,
    trendingOrder: row.trendingOrder,
    status: row.status as ArticleStatus,
    language: (row.language === "en" ? "en" : "vi") as ArticleLanguage,
    submittedAt: row.submittedAt?.toISOString(),
    reviewNote: row.reviewNote ?? undefined,
    body: row.body,
    sources: row.sources
      .sort((a, b) => a.position - b.position)
      .map((s) => ({ name: s.name, url: s.url })),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function listArticles(options?: {
  status?: ArticleStatus;
  category?: string;
  authorId?: string;
}): Promise<Article[]> {
  const rows = await prisma.article.findMany({
    where: {
      ...(options?.status ? { status: options.status } : {}),
      ...(options?.category ? { category: options.category } : {}),
      ...(options?.authorId ? { authorId: options.authorId } : {}),
    },
    include: { sources: true },
    orderBy: [{ publishedAt: "desc" }, { createdAt: "desc" }],
  });
  return rows.map(toArticle);
}

/**
 * Bản rút gọn của bài viết cho các màn hình danh sách.
 *
 * Khác biệt duy nhất mà lại là điểm mấu chốt: KHÔNG kèm `body`. Một bài tổng
 * hợp nặng 8–14KB HTML; danh sách 200 bài là gần 2MB thân bài phải đọc từ đĩa,
 * serialize rồi đẩy xuống trình duyệt để hiển thị đúng cái tít. Đó là lý do
 * chính khiến các tab trong /admin chuyển chậm.
 */
export interface ArticleSummary {
  id: string;
  slug: string;
  title: string;
  dek: string;
  category: CategorySlug;
  tags: string[];
  coverGradient: [string, string];
  coverImage?: string;
  author: string;
  authorId?: string;
  publishedAt: string;
  readingTimeMin: number;
  featured: boolean;
  trending: boolean;
  featuredOrder: number | null;
  trendingOrder: number | null;
  status: ArticleStatus;
  language: ArticleLanguage;
  submittedAt?: string;
  reviewNote?: string;
  /** Số nguồn tham khảo — danh sách chỉ cần con số, không cần từng link. */
  sourceCount: number;
  createdAt: string;
  updatedAt: string;
}

/** Đúng những cột mà danh sách cần. Cố tình bỏ `body`. */
const SUMMARY_SELECT = {
  id: true,
  slug: true,
  title: true,
  dek: true,
  category: true,
  tags: true,
  coverGradient: true,
  coverImage: true,
  author: true,
  authorId: true,
  publishedAt: true,
  readingTimeMin: true,
  featured: true,
  trending: true,
  featuredOrder: true,
  trendingOrder: true,
  status: true,
  language: true,
  submittedAt: true,
  reviewNote: true,
  createdAt: true,
  updatedAt: true,
  _count: { select: { sources: true } },
} as const;

type SummaryRow = Awaited<
  ReturnType<typeof prisma.article.findFirstOrThrow<{ select: typeof SUMMARY_SELECT }>>
>;

function toSummary(row: SummaryRow): ArticleSummary {
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    dek: row.dek,
    category: row.category as CategorySlug,
    tags: parseList(row.tags),
    coverGradient: parseGradient(row.coverGradient),
    coverImage: row.coverImage ?? undefined,
    author: row.author,
    authorId: row.authorId ?? undefined,
    publishedAt: row.publishedAt,
    readingTimeMin: row.readingTimeMin,
    featured: row.featured,
    trending: row.trending,
    featuredOrder: row.featuredOrder,
    trendingOrder: row.trendingOrder,
    status: row.status as ArticleStatus,
    language: (row.language === "en" ? "en" : "vi") as ArticleLanguage,
    submittedAt: row.submittedAt?.toISOString(),
    reviewNote: row.reviewNote ?? undefined,
    sourceCount: row._count.sources,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export interface ArticleQuery {
  status?: ArticleStatus | "all";
  category?: string;
  /** Lọc theo tài khoản đã tạo bài. */
  authorId?: string;
  /** Lọc theo tên tác giả hiển thị — bài cũ có thể không còn authorId. */
  author?: string;
  /** Ngày đăng, dạng YYYY-MM-DD, tính cả hai đầu. */
  from?: string;
  to?: string;
  /** Tìm trong tít và dek. */
  q?: string;
  page?: number;
  perPage?: number;
}

export interface ArticlePage {
  items: ArticleSummary[];
  total: number;
  page: number;
  perPage: number;
  /** Số bài theo từng trạng thái, tính trên bộ lọc hiện tại TRỪ trạng thái. */
  counts: Record<ArticleStatus | "all", number>;
  /** Danh sách tác giả để đổ vào ô lọc. */
  authors: string[];
}

export const ARTICLES_PER_PAGE = 20;

/** Điều kiện lọc dùng chung cho cả truy vấn danh sách lẫn các phép đếm. */
function articleWhere(query: ArticleQuery, includeStatus: boolean) {
  const q = query.q?.trim();
  return {
    ...(includeStatus && query.status && query.status !== "all"
      ? { status: query.status }
      : {}),
    ...(query.category && query.category !== "all" ? { category: query.category } : {}),
    ...(query.authorId ? { authorId: query.authorId } : {}),
    ...(query.author && query.author !== "all" ? { author: query.author } : {}),
    // publishedAt là chuỗi YYYY-MM-DD nên so sánh chuỗi cũng chính là so sánh
    // theo thời gian — dạng ISO được thiết kế đúng để làm được việc đó.
    ...(query.from || query.to
      ? {
          publishedAt: {
            ...(query.from ? { gte: query.from } : {}),
            ...(query.to ? { lte: query.to } : {}),
          },
        }
      : {}),
    ...(q ? { OR: [{ title: { contains: q } }, { dek: { contains: q } }] } : {}),
  };
}

/**
 * Một trang danh sách bài kèm số đếm cho mọi tab trạng thái.
 *
 * Số đếm bỏ qua bộ lọc trạng thái nhưng GIỮ các bộ lọc còn lại: đứng ở tab
 * "Đã đăng" vẫn phải thấy tab "Chờ duyệt" có bao nhiêu bài, nếu không thì bài
 * đang chờ trông như đã biến mất.
 */
export async function listArticlesPage(query: ArticleQuery = {}): Promise<ArticlePage> {
  const perPage = Math.min(Math.max(query.perPage ?? ARTICLES_PER_PAGE, 1), 100);
  const page = Math.max(query.page ?? 1, 1);

  const where = articleWhere(query, true);
  const whereNoStatus = articleWhere(query, false);

  const [rows, total, grouped, authorRows] = await Promise.all([
    prisma.article.findMany({
      where,
      select: SUMMARY_SELECT,
      orderBy: [{ publishedAt: "desc" }, { createdAt: "desc" }],
      skip: (page - 1) * perPage,
      take: perPage,
    }),
    prisma.article.count({ where }),
    prisma.article.groupBy({
      by: ["status"],
      where: whereNoStatus,
      _count: { _all: true },
    }),
    prisma.article.findMany({
      where: query.authorId ? { authorId: query.authorId } : {},
      distinct: ["author"],
      select: { author: true },
      orderBy: { author: "asc" },
    }),
  ]);

  const counts: Record<ArticleStatus | "all", number> = {
    all: 0,
    draft: 0,
    pending: 0,
    published: 0,
    rejected: 0,
  };
  for (const g of grouped) {
    const key = g.status as ArticleStatus;
    if (key in counts) counts[key] = g._count._all;
    counts.all += g._count._all;
  }

  return {
    items: rows.map(toSummary),
    total,
    page,
    perPage,
    counts,
    authors: authorRows.map((a) => a.author).filter(Boolean),
  };
}

/** Bỏ dấu + chữ thường, để "viet nam" khớp "Việt Nam" và "đà nẵng" khớp "Đà Nẵng". */
/**
 * Một trang bài đã đăng của một chuyên mục, cho trang /chuyen-muc/[slug].
 * Không kèm thân bài và không đếm theo trạng thái như listArticlesPage — trang
 * công khai chỉ cần đúng số thẻ đang hiện và tổng số để dựng phân trang.
 */
export async function listPublishedInCategory(
  category: string,
  page: number,
  perPage: number,
): Promise<{ items: ArticleSummary[]; total: number }> {
  const where = { status: "published", category };
  const [rows, total] = await Promise.all([
    prisma.article.findMany({
      where,
      select: SUMMARY_SELECT,
      orderBy: [{ publishedAt: "desc" }, { createdAt: "desc" }],
      skip: (page - 1) * perPage,
      take: perPage,
    }),
    prisma.article.count({ where }),
  ]);
  return { items: rows.map(toSummary), total };
}

/** Một bài trong danh sách hero / "Đang nóng", cho trang /admin/homepage. */
export interface HomepageSlotArticle {
  id: string;
  slug: string;
  title: string;
  category: CategorySlug;
  coverImage?: string;
  /** Bài chưa "published" vẫn xếp được vào đây (chờ sẵn chỗ), nhưng chưa hiện
   *  trên trang chủ — trang chủ tự lọc theo status khi đọc danh sách này. */
  status: ArticleStatus;
}

const HOMEPAGE_SLOT_SELECT = {
  id: true,
  slug: true,
  title: true,
  category: true,
  coverImage: true,
  status: true,
} as const;

function toHomepageSlotArticle(row: {
  id: string;
  slug: string;
  title: string;
  category: string;
  coverImage: string | null;
  status: string;
}): HomepageSlotArticle {
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    category: row.category as CategorySlug,
    coverImage: row.coverImage ?? undefined,
    status: row.status as ArticleStatus,
  };
}

/** Thứ tự hiện tại của hero / "Đang nóng" trên trang chủ — cho /admin/homepage. */
export async function getHomepageLayout(): Promise<{
  hero: HomepageSlotArticle[];
  trending: HomepageSlotArticle[];
}> {
  const [hero, trending] = await Promise.all([
    prisma.article.findMany({
      where: { featuredOrder: { not: null } },
      select: HOMEPAGE_SLOT_SELECT,
      orderBy: { featuredOrder: "asc" },
    }),
    prisma.article.findMany({
      where: { trendingOrder: { not: null } },
      select: HOMEPAGE_SLOT_SELECT,
      orderBy: { trendingOrder: "asc" },
    }),
  ]);
  return { hero: hero.map(toHomepageSlotArticle), trending: trending.map(toHomepageSlotArticle) };
}

/**
 * Ghi đè TOÀN BỘ thứ tự hero / "Đang nóng" theo đúng danh sách gửi lên.
 *
 * Khác `updateArticle` (đổi chỗ theo CẶP, dùng cho ô chọn vị trí cũ trong
 * trình sửa từng bài): ở đây /admin/homepage gửi nguyên danh sách đã sắp theo
 * ý người dùng (thêm/bớt/kéo thả), nên chỉ cần XOÁ hết thứ tự cũ rồi ĐÁNH SỐ
 * LẠI theo đúng mảng — chèn một bài vào giữa hay kéo lên đầu tự động đẩy các
 * bài khác dịch chỗ, không cần biết trước "chỗ này đang có ai".
 */
export async function setHomepageLayout(input: {
  hero: string[];
  trending: string[];
}): Promise<void> {
  const hero = [...new Set(input.hero)].slice(0, HERO_SLOTS);
  const trending = [...new Set(input.trending)].slice(0, TRENDING_SLOTS);

  const ids = [...new Set([...hero, ...trending])];
  if (ids.length) {
    const found = await prisma.article.findMany({
      where: { id: { in: ids } },
      select: { id: true },
    });
    const foundIds = new Set(found.map((r) => r.id));
    const missing = ids.filter((id) => !foundIds.has(id));
    if (missing.length) throw new Error(`Article not found: ${missing.join(", ")}`);
  }

  await prisma.$transaction([
    prisma.article.updateMany({
      where: { featuredOrder: { not: null } },
      data: { featuredOrder: null, featured: false },
    }),
    prisma.article.updateMany({
      where: { trendingOrder: { not: null } },
      data: { trendingOrder: null, trending: false },
    }),
    ...hero.map((id, i) =>
      prisma.article.update({ where: { id }, data: { featuredOrder: i + 1, featured: true } }),
    ),
    ...trending.map((id, i) =>
      prisma.article.update({ where: { id }, data: { trendingOrder: i + 1, trending: true } }),
    ),
  ]);
}

/** Bài đã đăng, KHÔNG kèm thân bài — đủ cho trang chủ (thẻ bài, hero, "Đang nóng"). */
export async function listPublishedSummaries(): Promise<ArticleSummary[]> {
  const rows = await prisma.article.findMany({
    where: { status: "published" },
    select: SUMMARY_SELECT,
    orderBy: [{ publishedAt: "desc" }, { createdAt: "desc" }],
  });
  return rows.map(toSummary);
}

/**
 * Bài liên quan cho khối "Đọc thêm".
 *
 * Chọn theo TAG DÙNG CHUNG chứ không theo chuyên mục: cùng một vụ việc hay
 * nằm ở nhiều chuyên mục khác nhau (một tin vừa là Việt Nam vừa là Kinh Doanh),
 * còn "cùng chuyên mục" thì gần như luôn đúng nên chẳng nói lên điều gì — và
 * nó khiến đồ thị liên kết nội bộ bị chia thành 8 hòn đảo không nối nhau.
 *
 * Mỗi tag chung được cân theo ĐỘ HIẾM (1 / số bài mang tag đó) thay vì đếm thô.
 * Kho bài hiện có 708 tag, trong đó 545 tag chỉ xuất hiện đúng một lần: tag
 * hiếm như "kênh đào Bình Lục" là tín hiệu liên quan rất mạnh, còn tag phổ
 * biến như "Việt Nam" (22% số bài) hay "Trung Quốc" (20%) nếu đếm thô sẽ kéo
 * mọi bài về cùng một chỗ.
 *
 * Cùng chuyên mục chỉ là điểm cộng nhỏ, vừa đủ phá hoà khi hai bài không chung
 * tag nào.
 */
export async function listRelatedArticles(input: {
  slug: string;
  category: CategorySlug;
  tags: string[];
  limit?: number;
}): Promise<ArticleSummary[]> {
  const { slug, category, tags, limit = 6 } = input;
  const all = await listPublishedSummaries();

  const frequency = new Map<string, number>();
  for (const a of all) {
    for (const t of a.tags) frequency.set(t, (frequency.get(t) ?? 0) + 1);
  }

  const wanted = new Set(tags);
  return all
    .filter((a) => a.slug !== slug)
    .map((a) => {
      let score = 0;
      for (const t of a.tags) {
        if (wanted.has(t)) score += 1 / (frequency.get(t) ?? 1);
      }
      if (a.category === category) score += 0.15;
      return { article: a, score };
    })
    .sort(
      (x, y) =>
        y.score - x.score ||
        (x.article.publishedAt < y.article.publishedAt ? 1 : -1),
    )
    .slice(0, limit)
    .map((x) => x.article);
}

/**
 * Kho tag đang được dùng, xếp theo số bài mang tag đó.
 *
 * Hai chỗ dùng:
 *  1. Vòng viết tự động tra trước khi đặt tag (GET /api/tags), để bài mới dùng
 *     lại tag cũ thay vì mỗi bài phát minh một tag mới. 545/708 tag hiện tại chỉ
 *     xuất hiện đúng một lần — đó là lý do khối "Tin liên quan" khó tìm được bài
 *     cùng chủ đề.
 *  2. canonicalizeTags() khi lưu bài, để "openai" gộp vào "OpenAI" đang có.
 */
export async function listTagVocabulary(
  limit = 2000,
): Promise<{ tag: string; count: number }[]> {
  const rows = await prisma.article.findMany({
    where: { status: "published" },
    select: { tags: true },
  });

  const counts = new Map<string, number>();
  for (const r of rows) {
    for (const t of parseList(r.tags)) {
      counts.set(t, (counts.get(t) ?? 0) + 1);
    }
  }

  return [...counts.entries()]
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag, "vi"))
    .slice(0, limit);
}

/**
 * Mọi cách viết tag đang có trong kho, KỂ CẢ bài chưa đăng.
 *
 * Khác listTagVocabulary() ở chỗ không lọc `published`: việc gộp tag lúc lưu bài
 * phải tôn trọng cả cách viết trong bản nháp, nhưng endpoint công khai thì không
 * được để lộ chủ đề của bài chưa đăng.
 */
export async function listAllTagNames(): Promise<string[]> {
  const rows = await prisma.article.findMany({ select: { tags: true } });
  const set = new Set<string>();
  for (const r of rows) {
    for (const t of parseList(r.tags)) set.add(t);
  }
  return [...set];
}

export function foldVietnamese(s: string) {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .toLowerCase();
}

/**
 * Tìm bài đã đăng theo tít và dek, cho ô tìm kiếm ngoài trang công khai.
 *
 * Lọc trong JS chứ không dùng `contains` của Prisma: trên SQLite nó thành
 * LIKE, chỉ bỏ qua hoa/thường với chữ ASCII — gõ "đà nẵng" sẽ trượt tít
 * "Đà Nẵng", và gõ không dấu thì trượt hết. Chỉ đọc cột tít/dek, nên vài
 * nghìn bài vẫn nhẹ.
 *
 * Khớp cả cụm, tính từ đầu một từ: "hoang sa" phải đứng liền nhau, và "sa"
 * không được khớp giữa chừng chữ "sạc". Tách từng từ ra khớp riêng thì bỏ dấu
 * xong gần như bài nào cũng dính.
 */
export async function searchPublishedArticles(
  q: string,
  limit = 60,
): Promise<ArticleSummary[]> {
  const words = (s: string) => foldVietnamese(s).replace(/[^a-z0-9]+/g, " ").trim();
  const phrase = words(q);
  if (!phrase) return [];
  const needle = ` ${phrase}`;

  const rows = await prisma.article.findMany({
    where: { status: "published" },
    select: { id: true, title: true, dek: true },
    orderBy: [{ publishedAt: "desc" }, { createdAt: "desc" }],
  });
  const ids = rows
    .filter((r) => ` ${words(r.title)} ${words(r.dek)}`.includes(needle))
    .slice(0, limit)
    .map((r) => r.id);
  if (ids.length === 0) return [];

  const found = await prisma.article.findMany({
    where: { id: { in: ids } },
    select: SUMMARY_SELECT,
  });
  const order = new Map(ids.map((id, i) => [id, i]));
  return found.map(toSummary).sort((a, b) => order.get(a.id)! - order.get(b.id)!);
}

export async function getArticleById(id: string): Promise<Article | undefined> {
  const row = await prisma.article.findUnique({
    where: { id },
    include: { sources: true },
  });
  return row ? toArticle(row) : undefined;
}

export async function getArticleBySlug(slug: string): Promise<Article | undefined> {
  const row = await prisma.article.findUnique({
    where: { slug },
    include: { sources: true },
  });
  return row ? toArticle(row) : undefined;
}

async function ensureUniqueSlug(base: string, excludeId?: string): Promise<string> {
  const clean = slugify(base) || "bai-viet";
  let candidate = clean;
  let i = 2;
  for (;;) {
    const existing = await prisma.article.findUnique({
      where: { slug: candidate },
      select: { id: true },
    });
    if (!existing || existing.id === excludeId) return candidate;
    candidate = `${clean}-${i++}`;
  }
}

export async function createArticle(
  input: Omit<Article, "id" | "createdAt" | "updatedAt">,
): Promise<Article> {
  const slug = await ensureUniqueSlug(input.slug || slugify(input.title));

  const row = await prisma.article.create({
    data: {
      slug,
      title: input.title,
      dek: input.dek,
      category: input.category,
      tags: JSON.stringify(input.tags),
      coverGradient: JSON.stringify(input.coverGradient),
      coverImage: input.coverImage ?? null,
      coverImageCaption: input.coverImageCaption ?? null,
      author: input.author,
      authorId: input.authorId ?? null,
      publishedAt: input.publishedAt,
      readingTimeMin: input.readingTimeMin,
      featured: input.featured ?? false,
      trending: input.trending ?? false,
      status: input.status,
      language: input.language ?? "vi",
      body: normalizeArticleHtml(input.body),
      submittedAt: input.submittedAt ? new Date(input.submittedAt) : null,
      reviewNote: input.reviewNote ?? null,
      sources: {
        create: input.sources.map((s, i) => ({
          name: s.name,
          url: s.url,
          position: i,
        })),
      },
    },
    include: { sources: true },
  });
  return toArticle(row);
}

export async function updateArticle(
  id: string,
  patch: Partial<Omit<Article, "id" | "createdAt">>,
): Promise<Article | undefined> {
  const current = await prisma.article.findUnique({
    where: { id },
    select: { slug: true, featuredOrder: true, trendingOrder: true },
  });
  if (!current) return undefined;

  const slug =
    patch.slug && patch.slug !== current.slug
      ? await ensureUniqueSlug(patch.slug, id)
      : undefined;

  // Nguồn tham khảo thay toàn bộ khi được gửi lên, để giữ đúng thứ tự.
  const replaceSources = patch.sources !== undefined;

  const row = await prisma.$transaction(async (tx) => {
    if (replaceSources) {
      await tx.source.deleteMany({ where: { articleId: id } });
    }
    // Chỗ mới đang có bài khác thì đổi chỗ: bài kia nhận chỗ cũ của bài này
    // (hoặc rời khỏi khối nếu bài này trước đó chưa có chỗ).
    if (patch.featuredOrder != null && patch.featuredOrder !== current.featuredOrder) {
      await tx.article.updateMany({
        where: { featuredOrder: patch.featuredOrder, id: { not: id } },
        data: { featuredOrder: current.featuredOrder, featured: current.featuredOrder !== null },
      });
    }
    if (patch.trendingOrder != null && patch.trendingOrder !== current.trendingOrder) {
      await tx.article.updateMany({
        where: { trendingOrder: patch.trendingOrder, id: { not: id } },
        data: { trendingOrder: current.trendingOrder, trending: current.trendingOrder !== null },
      });
    }
    return tx.article.update({
      where: { id },
      data: {
        ...(slug ? { slug } : {}),
        ...(patch.title !== undefined ? { title: patch.title } : {}),
        ...(patch.dek !== undefined ? { dek: patch.dek } : {}),
        ...(patch.category !== undefined ? { category: patch.category } : {}),
        ...(patch.tags !== undefined ? { tags: JSON.stringify(patch.tags) } : {}),
        ...(patch.coverGradient !== undefined
          ? { coverGradient: JSON.stringify(patch.coverGradient) }
          : {}),
        ...(patch.coverImage !== undefined
          ? { coverImage: patch.coverImage || null }
          : {}),
        ...(patch.coverImageCaption !== undefined
          ? { coverImageCaption: patch.coverImageCaption || null }
          : {}),
        ...(patch.author !== undefined ? { author: patch.author } : {}),
        ...(patch.publishedAt !== undefined ? { publishedAt: patch.publishedAt } : {}),
        ...(patch.readingTimeMin !== undefined
          ? { readingTimeMin: patch.readingTimeMin }
          : {}),
        ...(patch.featuredOrder !== undefined
          ? { featuredOrder: patch.featuredOrder, featured: patch.featuredOrder !== null }
          : {}),
        ...(patch.trendingOrder !== undefined
          ? { trendingOrder: patch.trendingOrder, trending: patch.trendingOrder !== null }
          : {}),
        ...(patch.status !== undefined ? { status: patch.status } : {}),
        ...(patch.language !== undefined ? { language: patch.language } : {}),
        ...(patch.body !== undefined ? { body: normalizeArticleHtml(patch.body) } : {}),
        ...(patch.submittedAt !== undefined
          ? { submittedAt: patch.submittedAt ? new Date(patch.submittedAt) : null }
          : {}),
        ...(patch.reviewNote !== undefined
          ? { reviewNote: patch.reviewNote || null }
          : {}),
        ...(replaceSources
          ? {
              sources: {
                create: (patch.sources ?? []).map((s, i) => ({
                  name: s.name,
                  url: s.url,
                  position: i,
                })),
              },
            }
          : {}),
      },
      include: { sources: true },
    });
  });

  return toArticle(row);
}

export async function deleteArticle(id: string): Promise<boolean> {
  try {
    await prisma.article.delete({ where: { id } });
    return true;
  } catch {
    return false;
  }
}
