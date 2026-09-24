import { NextResponse, after } from "next/server";
import { getSessionUser } from "@/lib/auth";
import {
  queueFacebookPostsNow,
  removeFacebookPost,
  runDueFacebookPosts,
  scheduleFacebookPostsGolden,
} from "@/lib/facebook";

export const dynamic = "force-dynamic";

/**
 * Thao tác trên nhiều bài một lúc. Trả lời ngay, không đợi Facebook:
 *   now    — vào hàng đợi đăng ngay; đăng nền sau khi trả lời (và cron nhặt tiếp)
 *   golden — xếp mỗi bài vào một giờ vàng trống kế tiếp
 *   cancel — huỷ lịch các bài chưa đăng (bài đã lên Page thì giữ nguyên)
 */
export async function POST(req: Request) {
  const user = await getSessionUser();
  if (user?.role !== "admin") {
    return NextResponse.json({ error: "Không có quyền truy cập" }, { status: 403 });
  }
  const body = (await req.json().catch(() => ({}))) as { articleIds?: unknown; action?: string };
  const ids = Array.isArray(body.articleIds)
    ? [...new Set(body.articleIds.filter((x): x is string => typeof x === "string"))].slice(0, 100)
    : [];
  if (!ids.length) return NextResponse.json({ error: "Chưa chọn bài nào" }, { status: 400 });

  if (body.action === "now") {
    const { queued, skipped } = await queueFacebookPostsNow(ids);
    if (queued.length) after(() => runDueFacebookPosts().catch(() => {}));
    return NextResponse.json({
      queued: queued.length,
      skipped,
      message: `Đã đưa ${queued.length} bài vào hàng đợi đăng` + (skipped.length ? `, bỏ qua ${skipped.length}` : ""),
    });
  }

  if (body.action === "golden") {
    const { queued, skipped } = await scheduleFacebookPostsGolden(ids);
    return NextResponse.json({
      queued: queued.length,
      skipped,
      message: `Đã xếp ${queued.length} bài vào giờ vàng` + (skipped.length ? `, bỏ qua ${skipped.length}` : ""),
    });
  }

  if (body.action === "cancel") {
    let done = 0;
    const skipped: { articleId: string; reason: string }[] = [];
    for (const id of ids) {
      try {
        // Chỉ huỷ lịch; gỡ bài đã lên Page là thao tác riêng từng bài, có hỏi lại.
        await removeFacebookPost(id, { onlyUnpublished: true });
        done++;
      } catch (err) {
        skipped.push({ articleId: id, reason: (err as Error).message });
      }
    }
    return NextResponse.json({ queued: done, skipped, message: `Đã huỷ lịch ${done} bài` });
  }

  return NextResponse.json({ error: "Thao tác không hợp lệ" }, { status: 400 });
}
