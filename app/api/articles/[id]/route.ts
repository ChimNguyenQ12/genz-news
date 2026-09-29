import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { deleteArticle, getArticleById, listAllTagNames, updateArticle } from "@/lib/store";
import { canonicalizeTags } from "@/lib/tags";
import { closeRequestForArticle } from "@/lib/queue";
import { pingIndexNow } from "@/lib/indexnow";
import type { Article, ArticleStatus, CategorySlug } from "@/lib/types";
import { categories } from "@/lib/data";
import { normalizeArticleHtml } from "@/lib/html";
import { HERO_SLOTS, TRENDING_SLOTS } from "@/lib/placement";
import * as clean from "@/lib/articleInput";

/** null / false / "" = bỏ khỏi khối; 1..max = vị trí; còn lại = sai. */function slotFrom(raw: unknown, max: number): number | null | "invalid" {
  if (raw === null || raw === false || raw === "") return null;
  const n = Number(raw);
  return Number.isInteger(n) && n >= 1 && n <= max ? n : "invalid";
}

const VALID_CATEGORIES = new Set(categories.map((c) => c.slug));

const BASE_URL =
  process.env.NEXT_PUBLIC_BASE_URL ?? "https://genz-news.site";

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

  if (typeof body.body === "string" && body.body.length > clean.LIMITS.body) {
    return NextResponse.json({ error: "Bài quá dài" }, { status: 413 });
  }
  if (body.title !== undefined) patch.title = clean.text(body.title, clean.LIMITS.title).trim();
  if (body.dek !== undefined) patch.dek = clean.text(body.dek, clean.LIMITS.dek);
  if (body.publishedAt !== undefined) {
    patch.publishedAt = clean.publishedAt(body.publishedAt, current.publishedAt);
  }
  if (body.readingTimeMin !== undefined) {
    patch.readingTimeMin = Number(body.readingTimeMin) || 3;
  }
  if (body.body !== undefined) patch.body = normalizeArticleHtml(body.body);
  if (body.language !== undefined) {
    patch.language = body.language === "en" ? "en" : "vi";
  }
  if (Array.isArray(body.tags)) {
    // Gộp tag trùng nghĩa vào cách viết đang có trong kho ("openai" → "OpenAI"),
    // để tag không tiếp tục phân tán (xem lib/tags.ts).
    patch.tags = canonicalizeTags(clean.tags(body.tags) ?? [], await listAllTagNames());
  }
  if (body.coverImage !== undefined) {
    // "" = gỡ ảnh bìa; URL không hợp lệ cũng coi như gỡ.
    patch.coverImage = clean.mediaRef(body.coverImage) ?? "";
  }
  if (body.coverImageCaption !== undefined) {
    patch.coverImageCaption = String(body.coverImageCaption) || undefined;
  }
  if (body.coverImageCredit !== undefined) {
    patch.coverImageCredit = clean.imageCredit(body.coverImageCredit);
  }
  const grad = clean.gradient(body.coverGradient);
  if (grad) patch.coverGradient = grad;
  if (Array.isArray(body.sources)) patch.sources = clean.sources(body.sources);

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
    if (body.featuredOrder !== undefined) {
      const slot = slotFrom(body.featuredOrder, HERO_SLOTS);
      if (slot === "invalid") {
        return NextResponse.json({ error: `Vị trí hero phải từ 1 đến ${HERO_SLOTS}` }, { status: 400 });
      }
      patch.featuredOrder = slot;
    }
    if (body.trendingOrder !== undefined) {
      const slot = slotFrom(body.trendingOrder, TRENDING_SLOTS);
      if (slot === "invalid") {
        return NextResponse.json({ error: `Vị trí Đang nóng phải từ 1 đến ${TRENDING_SLOTS}` }, { status: 400 });
      }
      patch.trendingOrder = slot;
    }
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
      if (next === "published") {
        patch.reviewNote = undefined;
        // Khoảnh khắc bấm publish CHÍNH LÀ đây. Trước đây không ghi lại, nên
        // ngày đăng chỉ còn là ngày tạo bài và mất hẳn phần giờ.
        //
        // Ô "Publish date" chỉ gửi ngày, nên không dùng nó làm giờ đăng được.
        // Quy tắc: giờ luôn là giờ bấm; ngày theo ô nhập CHỈ KHI quản trị cố ý
        // đổi sang ngày khác (lùi ngày đăng) — lúc đó patch.publishedAt đã là
        // "ngày mới + giờ cũ" sau bước chuẩn hoá ở trên. Còn lại lấy giờ hiện tại.
        const typedDay = patch.publishedAt?.slice(0, 10);
        const prevDay = current.publishedAt.slice(0, 10);
        patch.publishedAt =
          typedDay && typedDay !== prevDay
            ? patch.publishedAt
            : new Date().toISOString();
      }
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

  // Bài lên trang thì đề tài sinh ra nó coi như xong việc: đóng mục trong hàng
  // đợi để nó rời khỏi tab "Drafted". Tab đó là danh sách việc CÒN PHẢI LÀM,
  // không phải nhật ký — bài đã đăng mà vẫn nằm đó thì mỗi ngày một dài thêm.
  if (patch.status === "published") {
    await closeRequestForArticle(id);
    // IndexNow: báo thẳng cho Bing/Yandex/Naver biết bài vừa lên, thay vì chờ
    // bot tự quét (mất vài ngày). Không await — người biên tập không phải chờ
    // máy tìm kiếm trả lời, và pingIndexNow đã tự nuốt mọi lỗi.
    void pingIndexNow([
      `${BASE_URL}/bai-viet/${article.slug}`,
      `${BASE_URL}/chuyen-muc/${article.category}`,
    ]);
    // Mạng xã hội không xếp lịch ở đây: Facebook tự chọn bài nóng nhất đúng
    // lúc tới giờ vàng, Threads do người biên tập tự đặt (lib/social/core.ts).
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
