import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  GOLDEN_HOURS,
  POSTS_PER_DAY,
  facebookConfigured,
  formatFacebookCaption,
  formatFacebookComment,
  nextFreeSlots,
} from "@/lib/facebook";
import type { CategorySlug } from "@/lib/types";

export const dynamic = "force-dynamic";

function parseList(value: string | null | undefined): string[] {
  try {
    const parsed = JSON.parse(value ?? "[]");
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

/** Bài đã đăng trên web (60 bài mới nhất) kèm trạng thái trên Facebook Page. */
export async function GET() {
  const user = await getSessionUser();
  if (user?.role !== "admin") {
    return NextResponse.json({ error: "Không có quyền truy cập" }, { status: 403 });
  }

  const rows = await prisma.article.findMany({
    where: { status: "published" },
    include: { facebookPost: true },
    orderBy: [{ publishedAt: "desc" }, { createdAt: "desc" }],
    take: 60,
  });
  const [nextSlot] = await nextFreeSlots(1);

  return NextResponse.json({
    configured: facebookConfigured(),
    goldenHours: GOLDEN_HOURS,
    perDay: POSTS_PER_DAY,
    nextSlot: nextSlot ?? null,
    articles: rows.map((a) => {
      const tags = parseList(a.tags);
      const view = { title: a.title, dek: a.dek, category: a.category as CategorySlug, tags, slug: a.slug };
      return {
        id: a.id,
        slug: a.slug,
        title: a.title,
        dek: a.dek,
        category: a.category,
        coverImage: a.coverImage,
        publishedAt: a.publishedAt,
        defaultCaption: formatFacebookCaption(view),
        defaultComment: formatFacebookComment(view),
        facebookPost: a.facebookPost,
      };
    }),
  });
}
