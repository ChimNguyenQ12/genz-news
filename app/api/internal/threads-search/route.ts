import crypto from "crypto";
import { NextResponse } from "next/server";
import { SESSION_SECRET } from "@/lib/secret";
import { browserSearch } from "@/lib/threadsBrowserSearch";

export const dynamic = "force-dynamic";

/**
 * Tìm trên Threads hộ scripts/collect-trends.mjs.
 *
 * collect-trends chạy bằng cron trên HOST, nơi không có Chromium; trình duyệt
 * và phiên đăng nhập nằm trong container của app. Nên script gọi vào đây qua
 * cổng loopback (127.0.0.1:5006), xác thực bằng chính khoá phiên của app
 * (data/session-secret, hoặc ADMIN_SESSION_SECRET) — host đọc được tệp đó vì nó
 * nằm trong thư mục data được mount.
 *
 * body: { keywords: string[] } — tối đa 20 từ khoá mỗi lượt.
 */
function authorized(request: Request) {
  const got = Buffer.from(request.headers.get("x-internal-token") ?? "");
  const want = Buffer.from(SESSION_SECRET);
  return got.length === want.length && crypto.timingSafeEqual(got, want);
}

export async function POST(request: Request) {
  if (!authorized(request)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Dữ liệu không hợp lệ" }, { status: 400 });
  }
  const keywords = (Array.isArray(body.keywords) ? body.keywords : [])
    .map((k) => String(k).trim())
    .filter((k) => k && k.length <= 100)
    .slice(0, 20);
  if (!keywords.length) {
    return NextResponse.json({ error: "Thiếu từ khoá" }, { status: 400 });
  }
  try {
    return NextResponse.json(await browserSearch(keywords));
  } catch (err) {
    return NextResponse.json(
      { error: `Không mở được trình duyệt: ${(err as Error).message.split("\n")[0]}` },
      { status: 500 },
    );
  }
}
