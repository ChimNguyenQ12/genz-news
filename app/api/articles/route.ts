import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { createArticle, listArticlesPage, slugify } from "@/lib/store";
import type { Article, ArticleStatus, CategorySlug } from "@/lib/types";
import { categories } from "@/lib/data";
import { normalizeArticleHtml } from "@/lib/html";

const VALID_CATEGORIES = new Set(categories.map((c) => c.slug));
const VALID_STATUS = new Set<string>(["draft", "pending", "published", "rejected"]);

/** Ngày lọc chỉ nhận dạng YYYY-MM-DD; thứ khác thì coi như không lọc. */
function asDate(value: string | null) {
  return value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : undefined;
}

/**
 * Danh sách bài cho các màn hình quản lý.
 *
 * Trả về BẢN RÚT GỌN (không kèm thân bài) và chỉ đúng một trang. Trước đây API
 * trả toàn bộ bài kèm HTML thân bài, nên mỗi lần mở tab /admin là một lần tải
 * vài trăm KB chỉ để hiện danh sách tít.
 *
 * Tham số: status, category, author, from, to, q, page, perPage.
 */
export async function GET(request: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });

  const params = new URL(request.url).searchParams;
  const status = params.get("status");
  const category = params.get("category");
  const author = params.get("author");

  const page = await listArticlesPage({
    status: status && VALID_STATUS.has(status) ? (status as ArticleStatus) : "all",
    category: category && VALID_CATEGORIES.has(category as CategorySlug) ? category : "all",
    author: author && author !== "all" ? author : undefined,
    from: asDate(params.get("from")),
    to: asDate(params.get("to")),
    q: params.get("q") ?? undefined,
    page: Number(params.get("page")) || 1,
    perPage: Number(params.get("perPage")) || undefined,
    // Tài khoản thường chỉ thấy bài của chính mình. Lọc ở tầng cơ sở dữ liệu
    // chứ không lọc sau khi đã lấy về — lọc sau thì phân trang sẽ sai số.
    ...(user.role === "admin" ? {} : { authorId: user.id }),
  });

  return NextResponse.json({ ...page, role: user.role });
}

export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Dữ liệu không hợp lệ" }, { status: 400 });
  }

  const title = String(body.title ?? "").trim();
  if (!title) return NextResponse.json({ error: "Thiếu tiêu đề" }, { status: 400 });

  const category = String(body.category ?? "the-gioi");
  if (!VALID_CATEGORIES.has(category as CategorySlug)) {
    return NextResponse.json({ error: "Chuyên mục không hợp lệ" }, { status: 400 });
  }

  // Bài mới luôn bắt đầu ở trạng thái nháp, kể cả admin tạo.
  const input: Omit<Article, "id" | "createdAt" | "updatedAt"> = {
    slug: String(body.slug ?? "") || slugify(title),
    title,
    dek: String(body.dek ?? ""),
    category: category as CategorySlug,
    tags: Array.isArray(body.tags) ? body.tags.map(String) : [],
    coverGradient: Array.isArray(body.coverGradient)
      ? ([String(body.coverGradient[0]), String(body.coverGradient[1])] as [string, string])
      : ["#7C3AED", "#22D3EE"],
    author: String(body.author ?? user.displayName),
    authorId: user.id,
    publishedAt: String(body.publishedAt ?? new Date().toISOString().slice(0, 10)),
    readingTimeMin: Number(body.readingTimeMin) || 3,
    status: "draft",
    language: body.language === "en" ? "en" : "vi",
    body: normalizeArticleHtml(body.body),
    sources: Array.isArray(body.sources)
      ? body.sources
          .map((s) => s as { name?: unknown; url?: unknown })
          .filter((s) => s?.url)
          .map((s) => ({ name: String(s.name ?? "Nguồn"), url: String(s.url) }))
      : [],
  };

  const article = await createArticle(input);
  return NextResponse.json({ article }, { status: 201 });
}
