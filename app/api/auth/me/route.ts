import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

/**
 * Ai đang xem trang. Trang công khai không đọc cookie ở máy chủ nữa (để cache
 * được), nên header, khung bình luận… hỏi ở đây sau khi trang đã hiện —
 * xem lib/useSessionUser.ts.
 *
 * `private, no-store`: câu trả lời khác nhau theo từng người, Cloudflare hay
 * trình duyệt tuyệt đối không được lưu lại rồi phát cho người khác.
 */
export async function GET() {
  return NextResponse.json(
    { user: await getSessionUser() },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
