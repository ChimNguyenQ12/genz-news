import { NextResponse } from "next/server";

/**
 * Giới hạn tần suất trong bộ nhớ, cửa sổ trượt theo từng khoá (IP, tài khoản…).
 *
 * App chạy MỘT instance (xem Dockerfile / máy chủ dùng chung), nên bộ nhớ của
 * tiến trình là đủ; khởi động lại thì đếm lại từ đầu — chấp nhận được với mục
 * đích chặn dò mật khẩu và spam, không phải để tính tiền.
 */

const buckets = new Map<string, number[]>();
let lastSweep = Date.now();

/** Dọn khoá cũ mỗi vài phút để Map không phình mãi khi bị dò từ nhiều IP. */
function sweep(now: number) {
  if (now - lastSweep < 5 * 60_000) return;
  lastSweep = now;
  for (const [key, hits] of buckets) {
    // Không cửa sổ nào dài quá 1 ngày.
    if (!hits.length || now - hits[hits.length - 1] > 24 * 3600_000) buckets.delete(key);
  }
}

export interface Limit {
  /** Số lần tối đa trong cửa sổ. */
  max: number;
  windowMs: number;
}

/** Còn bao nhiêu giây nữa mới được thử lại; 0 = chưa chạm trần. KHÔNG tự đếm thêm. */
export function retryAfter(key: string, limit: Limit, now = Date.now()): number {
  sweep(now);
  const hits = (buckets.get(key) ?? []).filter((t) => now - t < limit.windowMs);
  buckets.set(key, hits);
  if (hits.length < limit.max) return 0;
  return Math.ceil((hits[0] + limit.windowMs - now) / 1000);
}

/** Ghi một lần. */
export function hit(key: string, now = Date.now()) {
  const hits = buckets.get(key) ?? [];
  hits.push(now);
  buckets.set(key, hits);
}

/** Xoá đếm của một khoá — VD đăng nhập đúng thì xoá số lần sai của tài khoản đó. */
export function reset(key: string) {
  buckets.delete(key);
}

/** Kiểm tra rồi đếm luôn nếu còn lượt. Trả về số giây phải chờ, 0 = được phép. */
export function take(key: string, limit: Limit): number {
  const wait = retryAfter(key, limit);
  if (!wait) hit(key);
  return wait;
}

export function tooMany(seconds: number, message = "Bạn thao tác quá nhanh. Thử lại sau ít phút.") {
  return NextResponse.json(
    { error: message },
    { status: 429, headers: { "Retry-After": String(seconds) } },
  );
}

/**
 * IP người dùng. Đi qua Cloudflare → nginx → app, nên $remote_addr của nginx
 * là IP Cloudflare; IP thật nằm ở CF-Connecting-IP. Không có (chạy local) thì
 * lùi về X-Real-IP / X-Forwarded-For do nginx đặt.
 */
export function clientIp(req: Request): string {
  const h = req.headers;
  return (
    h.get("cf-connecting-ip")?.trim() ||
    h.get("x-real-ip")?.trim() ||
    h.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    "unknown"
  );
}
