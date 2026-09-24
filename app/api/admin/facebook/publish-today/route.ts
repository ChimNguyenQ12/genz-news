import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getArticleById } from "@/lib/store";
import { postArticleToFacebook } from "@/lib/facebook";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user || user.role !== "admin") {
    return NextResponse.json({ error: "Không có quyền truy cập" }, { status: 403 });
  }

  try {
    let limit = 4;
    try {
      const body = await req.json();
      if (body.limit && typeof body.limit === "number") {
        limit = body.limit;
      }
    } catch {
      // no body
    }

    const todayStr = new Date().toISOString().slice(0, 10);

    // Lấy danh sách bài viết hôm nay (hoặc mới nhất) chưa đăng Facebook
    const articlesToPublish = await prisma.article.findMany({
      where: {
        status: "published",
        facebookPost: {
          is: null,
        },
        publishedAt: {
          gte: todayStr,
        },
      },
      orderBy: { publishedAt: "asc" },
      take: limit,
    });

    let targetArticles = articlesToPublish;

    // Fallback: nếu không có bài thuộc hôm nay chưa đăng FB, lấy 3 bài published mới nhất chưa đăng FB
    if (targetArticles.length === 0) {
      targetArticles = await prisma.article.findMany({
        where: {
          status: "published",
          facebookPost: {
            is: null,
          },
        },
        orderBy: { publishedAt: "desc" },
        take: limit,
      });
    }

    if (targetArticles.length === 0) {
      return NextResponse.json({
        success: true,
        message: "Tất cả bài viết đã xuất bản đều đã được đăng lên Facebook Fanpage!",
        publishedCount: 0,
        results: [],
      });
    }

    const results = [];
    for (const artRow of targetArticles) {
      const fullArticle = await getArticleById(artRow.id);
      if (!fullArticle) continue;

      const res = await postArticleToFacebook(fullArticle);
      results.push({
        articleId: fullArticle.id,
        title: fullArticle.title,
        success: res.success,
        postId: res.postId,
        error: res.error,
      });
    }

    const successCount = results.filter((r) => r.success).length;

    return NextResponse.json({
      success: true,
      message: `Đã hoàn tất đăng ${successCount}/${targetArticles.length} bài viết lên Facebook Fanpage!`,
      publishedCount: successCount,
      results,
    });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: errorMsg }, { status: 500 });
  }
}
