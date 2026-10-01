import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";

export const dynamic = "force-dynamic";

/**
 * Bỏ bản trang chủ dựng lúc build (chỉ là bản giữ chỗ — lúc build không có
 * database) để lượt xem kế tiếp dựng bản thật. instrumentation.ts tự gọi
 * vào đây vài giây sau khi máy chủ khởi động.
 *
 * Không cần khoá: việc duy nhất nó làm là bắt trang chủ dựng lại một lần, và
 * bị chặn còn tối đa một lần mỗi 30 giây — có ai gọi dồn dập cũng vô hại.
 */
const g = globalThis as unknown as { __genzWarmAt?: number };

export async function POST() {
  const now = Date.now();
  if (g.__genzWarmAt && now - g.__genzWarmAt < 30_000) {
    return NextResponse.json({ ok: true, skipped: true });
  }
  g.__genzWarmAt = now;
  revalidatePath("/");
  return NextResponse.json({ ok: true });
}
