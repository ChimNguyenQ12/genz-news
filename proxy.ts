import { NextResponse, type NextRequest } from "next/server";

/**
 * Chặn CSRF cho mọi request ghi dữ liệu vào /api.
 *
 * Cookie phiên đã là SameSite=Lax (trang lạ không gửi kèm cookie khi POST),
 * đây là lớp thứ hai: trình duyệt LUÔN gửi Origin với POST/PUT/PATCH/DELETE,
 * nên Origin khác tên miền của chính trang = request do trang khác dựng → chặn.
 * Không có Origin (script cron, bot viết bài gọi bằng fetch của Node) thì cho
 * qua — những request đó không đến từ trình duyệt của người dùng.
 */
export function proxy(req: NextRequest) {
  if (req.method === "GET" || req.method === "HEAD" || req.method === "OPTIONS") return;
  const origin = req.headers.get("origin");
  if (!origin) return;

  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  let originHost: string | null = null;
  try {
    originHost = new URL(origin).host;
  } catch {
    // "null" (iframe sandbox, file://…) hay rác: coi như khác tên miền
  }
  if (!host || originHost !== host) {
    return NextResponse.json({ error: "Cross-site request blocked" }, { status: 403 });
  }
}

export const config = { matcher: "/api/:path*" };
