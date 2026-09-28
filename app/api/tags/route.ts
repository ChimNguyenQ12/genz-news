import { NextResponse } from "next/server";
import { listTagVocabulary } from "@/lib/store";

// Phải đọc DB theo TỪNG request, không được prerender lúc build: lúc dựng image
// thư mục data/ không được mount, nên bản tĩnh sẽ là danh sách rỗng và bot nhận
// rỗng suốt cho tới lần revalidate đầu tiên. Truy vấn chỉ đọc một cột `tags`,
// không đáng để đánh đổi bằng dữ liệu sai.
export const dynamic = "force-dynamic";

/**
 * Kho tag đang dùng, cho vòng viết tự động tra TRƯỚC khi đặt tag.
 *
 * Mục đích: giữ cho cách đặt tag hội tụ. Kho bài có 708 tag cho 211 bài và 545
 * tag chỉ dùng một lần — tag không lặp lại thì không nối được bài nào với bài
 * nào, và khối "Tin liên quan" mất tín hiệu. Xem skill viet-bai-toa-soan.
 *
 * Trả về tag kèm số bài đang mang tag đó: tag có count >= 2 là tag đã được
 * dùng lại, ưu tiên chọn chúng khi cùng nghĩa.
 */
export async function GET() {
  const tags = await listTagVocabulary(300);
  return NextResponse.json({
    total: tags.length,
    reused: tags.filter((t) => t.count >= 2).length,
    tags,
  });
}
