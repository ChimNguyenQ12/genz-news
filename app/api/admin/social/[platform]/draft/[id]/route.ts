import { NextResponse } from "next/server";
import { readDraft } from "@/lib/social/drafts";
import { guard } from "@/lib/social/http";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ platform: string; id: string }> };

/** Kết quả "Tạo bài GenZ": pending / done (kèm text) / error. */
export async function GET(_req: Request, { params }: Ctx) {
  const { platform, id } = await params;
  const g = await guard(platform);
  if (g.error) return g.error;
  return NextResponse.json(readDraft(id));
}
