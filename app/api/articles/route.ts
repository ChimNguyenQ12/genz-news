import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { createArticle, listAllTagNames, listArticlesPage, slugify } from "@/lib/store";
import { canonicalizeTags } from "@/lib/tags";
import type { Article, ArticleStatus, CategorySlug } from "@/lib/types";
import { categories } from "@/lib/data";
import { normalizeArticleHtml } from "@/lib/html";
import * as clean from "@/lib/articleInput";
import { take, tooMany } from "@/lib/rateLimit";
import { notifyArticle } from "@/lib/notifications";

/** Tài khoản thường (đăng ký tự do) tạo tối đa 30 bài / giờ — chặn spam bài nháp. */
const CREATE_LIMIT = { max: 30, windowMs: 3600_000 };

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

  if (user.role !== "admin") {
    const wait = take(`article:create:${user.id}`, CREATE_LIMIT);
    if (wait) return tooMany(wait);
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Dữ liệu không hợp lệ" }, { status: 400 });
  }
  if (typeof body.body === "string" && body.body.length > clean.LIMITS.body) {
    return NextResponse.json({ error: "Bài quá dài" }, { status: 413 });
  }

  const title = clean.text(body.title, clean.LIMITS.title).trim();
  if (!title) return NextResponse.json({ error: "Thiếu tiêu đề" }, { status: 400 });

  const category = String(body.category ?? "the-gioi");
  if (!VALID_CATEGORIES.has(category as CategorySlug)) {
    return NextResponse.json({ error: "Chuyên mục không hợp lệ" }, { status: 400 });
  }

  const extraCategories = clean.extraCategories(body.extraCategories, VALID_CATEGORIES);
  if (extraCategories === "invalid") {
    return NextResponse.json({ error: "Chuyên mục phụ không hợp lệ" }, { status: 400 });
  }

  // Gộp tag trùng nghĩa vào cách viết đang có trong kho ("openai" → "OpenAI"),
  // để kho tag không tiếp tục phân tán — xem lib/tags.ts và GET /api/tags.
  const tags = canonicalizeTags(clean.tags(body.tags) ?? [], await listAllTagNames());

  // Bài mới luôn bắt đầu ở trạng thái nháp, kể cả admin tạo.
  const input: Omit<Article, "id" | "createdAt" | "updatedAt"> = {
    slug: String(body.slug ?? "") || slugify(title),
    title,
    dek: clean.text(body.dek, clean.LIMITS.dek),
    category: category as CategorySlug,
    extraCategories: extraCategories ?? [],
    tags,
    coverGradient: clean.gradient(body.coverGradient) ?? ["#7C3AED", "#22D3EE"],
    // Ảnh bìa PHẢI được nhận ngay ở bước tạo bài. Trước đây hai trường này bị
    // bỏ quên ở đây (chỉ PUT mới đọc), nên bài do máy viết mất sạch ảnh bìa —
    // nó tìm được ảnh, gửi lên đúng, rồi API lặng lẽ vứt đi.
    coverImage: clean.mediaRef(body.coverImage),
    coverImageCaption: body.coverImageCaption
      ? String(body.coverImageCaption)
      : undefined,
    coverImageCredit: clean.imageCredit(body.coverImageCredit),
    // Chỉ admin được ghi tên tác giả khác (VD "Ban biên tập"); tài khoản thường
    // luôn đứng tên chính mình — không mạo danh được người khác.
    author: user.role === "admin" && body.author ? clean.text(body.author, 80) : user.displayName,
    authorId: user.id,
    // Mốc ISO CÓ GIỜ (clean.publishedAt tự thêm giờ nếu client chỉ gửi ngày).
    publishedAt: clean.publishedAt(body.publishedAt),
    readingTimeMin: Number(body.readingTimeMin) || 3,
    status: "draft",
    language: body.language === "en" ? "en" : "vi",
    body: normalizeArticleHtml(body.body),
    sources: clean.sources(body.sources) ?? [],
  };

  const article = await createArticle(input);
  // Bài admin tự tạo thì không báo lại cho admin.
  if (user.role !== "admin") {
    void notifyArticle({ articleId: article.id, title: article.title, actor: user, event: "created" });
  }
  return NextResponse.json({ article }, { status: 201 });
}
