import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { GOLDEN_HOURS, POSTS_PER_DAY, driverFor, nextFreeSlots } from "@/lib/social/core";
import { guard } from "@/lib/social/http";
import type { CategorySlug } from "@/lib/types";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ platform: string }> };

function parseList(value: string | null | undefined): string[] {
  try {
    const parsed = JSON.parse(value ?? "[]");
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

/** 60 bài đã đăng web mới nhất, kèm trạng thái trên nền tảng này. */
export async function GET(_req: Request, { params }: Ctx) {
  const g = await guard((await params).platform);
  if (g.error) return g.error;
  const driver = driverFor(g.platform);

  const rows = await prisma.article.findMany({
    where: { status: "published" },
    include: { socialPosts: { where: { platform: g.platform } } },
    orderBy: [{ publishedAt: "desc" }, { createdAt: "desc" }],
    take: 60,
  });
  const configured = driver.configured();
  const [nextSlot] = configured ? await nextFreeSlots(g.platform, 1) : [];

  return NextResponse.json({
    platform: g.platform,
    label: driver.label,
    accountName: driver.accountName,
    maxCaption: driver.maxCaption,
    canEditPublished: driver.canEditPublished,
    configured,
    goldenHours: GOLDEN_HOURS,
    perDay: POSTS_PER_DAY,
    nextSlot: nextSlot ?? null,
    articles: rows.map((a) => {
      const view = {
        title: a.title,
        dek: a.dek,
        category: a.category as CategorySlug,
        tags: parseList(a.tags),
        slug: a.slug,
      };
      return {
        id: a.id,
        slug: a.slug,
        title: a.title,
        coverImage: a.coverImage,
        publishedAt: a.publishedAt,
        defaultCaption: driver.formatCaption(view),
        defaultComment: driver.formatComment(view),
        post: a.socialPosts[0] ?? null,
      };
    }),
  });
}
