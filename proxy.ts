import { NextResponse, type NextRequest } from "next/server";
import { blockedFor, recordRequest } from "@/lib/traffic";
import { clientIp } from "@/lib/rateLimit";

/**
 * Hai việc, theo thứ tự:
 *
 * 1. Đếm lưu lượng cho tab Traffic ở /admin/activity (lib/traffic.ts, chỉ trong
 *    bộ nhớ) và chặn IP mà admin đã chặn tay ở đó. Chặn ở đây là chặn tại app —
 *    request vẫn đã đi qua Cloudflare và nginx; đòn lớn phải chặn ở Cloudflare.
 *
 * 2. Chặn CSRF cho mọi request ghi dữ liệu vào /api.
 *    Cookie phiên đã là SameSite=Lax (trang lạ không gửi kèm cookie khi POST),
 *    đây là lớp thứ hai: trình duyệt LUÔN gửi Origin với POST/PUT/PATCH/DELETE,
 *    nên Origin khác tên miền của chính trang = request do trang khác dựng → chặn.
 *    Không có Origin (script cron, bot viết bài gọi bằng fetch của Node) thì cho
 *    qua — những request đó không đến từ trình duyệt của người dùng.
 */
export function proxy(req: NextRequest) {
  const path = req.nextUrl.pathname;
  const ip = clientIp(req);
  const block = ip !== "unknown" ? blockedFor(ip) : null;

  recordRequest({
    ip,
    path,
    method: req.method,
    userAgent: req.headers.get("user-agent") ?? "",
    blocked: !!block,
  });

  if (block) {
    const retry = Math.max(1, Math.ceil((block.until - Date.now()) / 1000));
    return new NextResponse("Too many requests", {
      status: 429,
      headers: { "Retry-After": String(retry), "Content-Type": "text/plain; charset=utf-8" },
    });
  }

  if (!path.startsWith("/api/")) return;
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

export const config = {
  // Mọi trang và API, trừ tệp tĩnh: đếm cả lượt tải JS/CSS/ảnh thì con số
  // "request/phút" phình gấp chục lần và không còn nói lên điều gì.
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|icon.png|apple-icon.png|robots.txt|sitemap.xml|.*\\.(?:png|jpg|jpeg|gif|webp|avif|svg|ico|css|js|map|woff2?|ttf|txt|xml)$).*)",
  ],
};
