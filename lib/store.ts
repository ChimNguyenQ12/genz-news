import crypto from "crypto";
import { prisma } from "./prisma";
import type { Article, ArticleLanguage, ArticleStatus, CategorySlug } from "./types";
import { normalizeArticleHtml } from "./html";

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
  const current = await prisma.article.findUnique({ where: { id }, select: { slug: true } });
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
        ...(patch.featured !== undefined ? { featured: patch.featured } : {}),
        ...(patch.trending !== undefined ? { trending: patch.trending } : {}),
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
