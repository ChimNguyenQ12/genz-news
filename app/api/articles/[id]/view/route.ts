import { NextResponse } from "next/server";
import { recordView } from "@/lib/views";
import { clientIp, take } from "@/lib/rateLimit";

/**
 * Trần mỗi IP. Đủ rộng cho cả một quán cà phê/ký túc xá chung IP (CGNAT) đọc
 * cùng lúc, đủ hẹp để một script không đẩy một bài lên top lượt đọc. Vượt trần
 * thì lặng lẽ không đếm — không trả 429, người đọc không cần biết.
 */
const PER_MINUTE = { max: 60, windowMs: 60_000 };
const PER_ARTICLE_PER_MINUTE = { max: 10, windowMs: 60_000 };

/** Bot tự xưng. Phần lớn bot không chạy JS nên không tới được đây, đây là lớp phụ. */
const BOT_UA = /bot|crawl|spider|slurp|preview|facebookexternalhit|headless|lighthouse|curl|wget|python|axios|node-fetch/i;

/**
 * Ghi một lượt đọc. Do components/ViewBeacon.tsx gửi sau khi trang bài hiện ra
 * được vài giây. Không ghi ai đọc — xem lib/views.ts.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const ua = request.headers.get("user-agent") ?? "";
  if (!ua || BOT_UA.test(ua) || !/^[\w-]{1,64}$/.test(id)) {
    return new NextResponse(null, { status: 204 });
  }

  const ip = clientIp(request);
  if (!take(`view:ip:${ip}`, PER_MINUTE) && !take(`view:a:${id}:${ip}`, PER_ARTICLE_PER_MINUTE)) {
    // Bài chưa đăng / không tồn tại thì lib/views.ts tự bỏ qua lúc ghi.
    recordView(id);
  }
  return new NextResponse(null, { status: 204 });
}
