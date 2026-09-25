import { NextResponse } from "next/server";
import { getArticleById } from "@/lib/store";
import { requestDraft } from "@/lib/social/drafts";
import { fail, guard } from "@/lib/social/http";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ platform: string }> };

/** Xin viết bài giọng GenZ cho một bài web. Trả về id để hỏi kết quả ở /draft/[id]. */
export async function POST(req: Request, { params }: Ctx) {
  const g = await guard((await params).platform);
  if (g.error) return g.error;
  const { articleId } = (await req.json().catch(() => ({}))) as { articleId?: string };
  if (!articleId) return NextResponse.json({ error: "Missing articleId" }, { status: 400 });
  const article = await getArticleById(articleId);
  if (!article) return NextResponse.json({ error: "Article not found" }, { status: 404 });
  try {
    return NextResponse.json({ id: requestDraft(g.platform, article) });
  } catch (err) {
    return fail(err, 500);
  }
}
