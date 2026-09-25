import { NextResponse, after } from "next/server";
import { queueNow, removePost, runDue, scheduleGolden, skipPost } from "@/lib/social/core";
import { guard } from "@/lib/social/http";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ platform: string }> };

/**
 * Thao tác trên nhiều bài một lúc. Trả lời ngay, không đợi nền tảng:
 *   now    — vào hàng đợi đăng ngay; đăng nền sau khi trả lời (cron nhặt tiếp)
 *   golden — xếp mỗi bài vào một giờ vàng trống kế tiếp
 *   cancel — huỷ lịch bài chưa đăng (bài đã lên giữ nguyên); bài "bỏ qua" quay lại danh sách tự chọn
 *   skip   — loại khỏi danh sách tự chọn giờ vàng (Facebook)
 */
export async function POST(req: Request, { params }: Ctx) {
  const g = await guard((await params).platform);
  if (g.error) return g.error;
  const body = (await req.json().catch(() => ({}))) as { articleIds?: unknown; action?: string };
  const ids = Array.isArray(body.articleIds)
    ? [...new Set(body.articleIds.filter((x): x is string => typeof x === "string"))].slice(0, 100)
    : [];
  if (!ids.length) return NextResponse.json({ error: "Chưa chọn bài nào" }, { status: 400 });

  const tail = (skipped: unknown[]) => (skipped.length ? `, bỏ qua ${skipped.length}` : "");

  if (body.action === "now") {
    const { queued, skipped } = await queueNow(g.platform, ids);
    if (queued.length) after(() => runDue().catch(() => {}));
    return NextResponse.json({ skipped, message: `Đã đưa ${queued.length} bài vào hàng đợi đăng${tail(skipped)}` });
  }
  if (body.action === "golden") {
    const { queued, skipped } = await scheduleGolden(g.platform, ids);
    return NextResponse.json({ skipped, message: `Đã xếp ${queued.length} bài vào giờ vàng${tail(skipped)}` });
  }
  if (body.action === "cancel") {
    let done = 0;
    const skipped: { articleId: string; reason: string }[] = [];
    for (const id of ids) {
      try {
        await removePost(g.platform, id, { onlyUnpublished: true });
        done++;
      } catch (err) {
        skipped.push({ articleId: id, reason: (err as Error).message });
      }
    }
    return NextResponse.json({ skipped, message: `Đã huỷ lịch ${done} bài${tail(skipped)}` });
  }
  if (body.action === "skip") {
    let done = 0;
    const skipped: { articleId: string; reason: string }[] = [];
    for (const id of ids) {
      try {
        await skipPost(g.platform, id);
        done++;
      } catch (err) {
        skipped.push({ articleId: id, reason: (err as Error).message });
      }
    }
    return NextResponse.json({ skipped, message: `Đã bỏ qua ${done} bài${tail(skipped)}` });
  }
  return NextResponse.json({ error: "Thao tác không hợp lệ" }, { status: 400 });
}
