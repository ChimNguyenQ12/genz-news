import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getSessionUser();
  if (!user || user.role !== "admin") {
    return NextResponse.json({ error: "Không có quyền truy cập" }, { status: 403 });
  }

  try {
    const articles = await prisma.article.findMany({
      where: { status: "published" },
      include: {
        facebookPost: true,
      },
      orderBy: [{ publishedAt: "desc" }, { createdAt: "desc" }],
      take: 50,
    });

    return NextResponse.json({
      success: true,
      articles: articles.map((art) => ({
        id: art.id,
        slug: art.slug,
        title: art.title,
        dek: art.dek,
        category: art.category,
        tags: parseList(art.tags),
        coverImage: art.coverImage,
        author: art.author,
        publishedAt: art.publishedAt,
        createdAt: art.createdAt,
        facebookPost: art.facebookPost,
      })),
    });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: errorMsg }, { status: 500 });
  }
}

function parseList(value: string | null | undefined): string[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}
