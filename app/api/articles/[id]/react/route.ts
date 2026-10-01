import { NextResponse } from "next/server";
import { reactToArticle } from "@/lib/store";
import { clientIp, take, tooMany } from "@/lib/rateLimit";

/**
 * Trần cho mỗi IP. Không chặn theo tài khoản vì khách chưa đăng nhập cũng bấm
 * được — đây chỉ là van chặn dội số, không phải cơ chế chống gian lận.
 */
const PER_MINUTE = { max: 30, windowMs: 60_000 };

/**
 * Đánh giá một bài: body `{ type: "like" | "dislike" }`.
 *
 * KHÔNG cần đăng nhập, chỉ cộng dồn. Cố ý không ghi lại ai đã bấm (xem
 * lib/store.ts:reactToArticle): lưu IP thì trái với trang Quyền riêng tư, mà
 * bắt đăng nhập thì mất phần lớn lượt bấm. Đổi lại, chống bấm lặp chỉ nằm ở
 * trình duyệt nên con số này là thăm dò ý kiến, không phải dữ liệu chính xác.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Dữ liệu không hợp lệ" }, { status: 400 });
  }

  const type = body.type;
  if (type !== "like" && type !== "dislike") {
    return NextResponse.json(
      { error: "Loại đánh giá không hợp lệ" },
      { status: 400 },
    );
  }

  const ip = clientIp(request);
  const wait = take(`react:ip:${ip}`, PER_MINUTE);
  if (wait) return tooMany(wait, "Bạn bấm hơi nhanh. Thử lại sau ít giây.", ip);

  const counts = await reactToArticle(id, type);
  if (!counts) {
    return NextResponse.json({ error: "Không tìm thấy bài viết" }, { status: 404 });
  }

  return NextResponse.json(counts);
}
