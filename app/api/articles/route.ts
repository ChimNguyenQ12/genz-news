import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { createArticle, listArticles, slugify } from "@/lib/store";
import type { Article, CategorySlug } from "@/lib/types";
import { categories } from "@/lib/data";
import { normalizeArticleHtml } from "@/lib/html";

const VALID_CATEGORIES = new Set(categories.map((c) => c.slug));

export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });

  const all = await listArticles();
  // Tài khoản thường chỉ thấy bài của chính mình.
  const visible =
    user.role === "admin" ? all : all.filter((a) => a.authorId === user.id);

  return NextResponse.json({ articles: visible, role: user.role });
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
