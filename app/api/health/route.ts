import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

/** Dùng cho healthcheck của CI và nginx. Chạm vào DB để chắc app thật sự sống. */
export async function GET() {
  try {
    const articles = await prisma.article.count();
    return NextResponse.json({ ok: true, articles });
  } catch (err) {
    // Lỗi chi tiết (đường dẫn DB, câu lệnh…) chỉ vào log, không trả ra ngoài.
    console.error("[health]", err);
    return NextResponse.json({ ok: false }, { status: 503 });
  }
}
