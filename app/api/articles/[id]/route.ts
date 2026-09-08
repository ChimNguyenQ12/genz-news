import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { deleteArticle, getArticleById, updateArticle } from "@/lib/store";
import type { Article, ArticleStatus, CategorySlug } from "@/lib/types";
import { categories } from "@/lib/data";
import { normalizeArticleHtml } from "@/lib/html";

const VALID_CATEGORIES = new Set(categories.map((c) => c.slug));

/** Tài khoản thường chỉ được đặt hai trạng thái này. */
const CONTRIBUTOR_STATUSES: ArticleStatus[] = ["draft", "pending"];
/** Và chỉ sửa được bài khi bài đang ở các trạng thái này. */
const CONTRIBUTOR_EDITABLE: ArticleStatus[] = ["draft", "rejected"];

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });

  const { id } = await params;
  const article = await getArticleById(id);
  if (!article) {
    return NextResponse.json({ error: "Không tìm thấy bài viết" }, { status: 404 });
  }
  if (user.role !== "admin" && article.authorId !== user.id) {
    return NextResponse.json({ error: "Không có quyền" }, { status: 403 });
  }
  return NextResponse.json({ article });
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });

  const { id } = await params;
  const current = await getArticleById(id);
  if (!current) {
    return NextResponse.json({ error: "Không tìm thấy bài viết" }, { status: 404 });
  }

  const isAdmin = user.role === "admin";
  const isOwner = current.authorId === user.id;

  if (!isAdmin && !isOwner) {
    return NextResponse.json({ error: "Không có quyền sửa bài này" }, { status: 403 });
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Dữ liệu không hợp lệ" }, { status: 400 });
  }

  if (!isAdmin) {
    if (current.status === "pending") {
      // Khi bài đang đợi duyệt, tác giả được phép rút về nháp (status: "draft").
      if (body.status !== "draft") {
        return NextResponse.json(
          { error: "Bài đang đợi duyệt, không sửa được. Rút về nháp trước đã." },
          { status: 403 },
        );
      }
    } else if (current.status === "published") {
      return NextResponse.json(
        { error: "Bài đã đăng, bạn không sửa được." },
        { status: 403 },
      );
    } else if (!CONTRIBUTOR_EDITABLE.includes(current.status)) {
      return NextResponse.json(
        { error: "Không thể chỉnh sửa bài viết ở trạng thái này." },
        { status: 403 },
      );
    }
  }

  const patch: Partial<Article> = {};

  if (body.title !== undefined) patch.title = String(body.title).trim();
  if (body.dek !== undefined) patch.dek = String(body.dek);
  if (body.publishedAt !== undefined) patch.publishedAt = String(body.publishedAt);
  if (body.readingTimeMin !== undefined) {
    patch.readingTimeMin = Number(body.readingTimeMin) || 3;
  }
  if (body.body !== undefined) patch.body = normalizeArticleHtml(body.body);
  if (body.language !== undefined) {
    patch.language = body.language === "en" ? "en" : "vi";
  }
  if (Array.isArray(body.tags)) patch.tags = body.tags.map(String);
  if (body.coverImage !== undefined) {
    patch.coverImage = String(body.coverImage) || undefined;
  }
  if (body.coverImageCaption !== undefined) {
    patch.coverImageCaption = String(body.coverImageCaption) || undefined;
  }
  if (body.coverImageCredit !== undefined) {
    const c = body.coverImageCredit as Record<string, unknown> | null;
    patch.coverImageCredit =
      c && c.author && c.license && c.sourceUrl
        ? {
            author: String(c.author),
            license: String(c.license),
            sourceUrl: String(c.sourceUrl),
            sourceName: c.sourceName ? String(c.sourceName) : undefined,
          }
        : undefined;
  }
  if (Array.isArray(body.coverGradient) && body.coverGradient.length === 2) {
    patch.coverGradient = [
      String(body.coverGradient[0]),
      String(body.coverGradient[1]),
    ];
  }
  if (Array.isArray(body.sources)) {
    patch.sources = body.sources
      .map((s) => s as { name?: unknown; url?: unknown })
      .filter((s) => s?.url)
      .map((s) => ({ name: String(s.name ?? "Nguồn"), url: String(s.url) }));
  }

  if (body.category !== undefined) {
    const category = String(body.category);
    if (!VALID_CATEGORIES.has(category as CategorySlug)) {
      return NextResponse.json({ error: "Chuyên mục không hợp lệ" }, { status: 400 });
    }
    patch.category = category as CategorySlug;
  }

  // --- các trường chỉ admin được đụng vào
  if (isAdmin) {
    if (body.author !== undefined) patch.author = String(body.author);
    if (body.slug !== undefined) patch.slug = String(body.slug);
    if (body.featured !== undefined) patch.featured = Boolean(body.featured);
    if (body.trending !== undefined) patch.trending = Boolean(body.trending);
    if (body.reviewNote !== undefined) patch.reviewNote = String(body.reviewNote);
  }

  // --- chuyển trạng thái
  if (body.status !== undefined) {
    const next = String(body.status) as ArticleStatus;

    if (isAdmin) {
      const allowed: ArticleStatus[] = ["draft", "pending", "published", "rejected"];
      if (!allowed.includes(next)) {
        return NextResponse.json({ error: "Trạng thái không hợp lệ" }, { status: 400 });
      }
      patch.status = next;
      if (next === "published") patch.reviewNote = undefined;
    } else {
      if (!CONTRIBUTOR_STATUSES.includes(next)) {
        return NextResponse.json(
          { error: "Bạn chỉ được lưu nháp hoặc gửi duyệt." },
          { status: 403 },
        );
      }
      patch.status = next;
      if (next === "pending") {
        patch.submittedAt = new Date().toISOString();
        patch.reviewNote = undefined; // xoá góp ý cũ khi gửi lại
      }
    }
  }

  const article = await updateArticle(id, patch);
  if (!article) {
    return NextResponse.json({ error: "Không tìm thấy bài viết" }, { status: 404 });
  }
  return NextResponse.json({ article });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });

  const { id } = await params;
  const current = await getArticleById(id);
  if (!current) {
    return NextResponse.json({ error: "Không tìm thấy bài viết" }, { status: 404 });
  }

  if (user.role !== "admin") {
    if (current.authorId !== user.id) {
      return NextResponse.json({ error: "Không có quyền" }, { status: 403 });
    }
    if (!CONTRIBUTOR_EDITABLE.includes(current.status)) {
      return NextResponse.json(
        { error: "Chỉ xoá được bài đang ở dạng nháp hoặc bị trả lại." },
        { status: 403 },
      );
    }
  }

  await deleteArticle(id);
  return NextResponse.json({ ok: true });
}
