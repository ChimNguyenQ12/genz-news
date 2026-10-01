import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { take, tooMany } from "@/lib/rateLimit";
import {
  clearThreadsSession,
  parseCookieString,
  readThreadsSession,
  recordThreadsCheck,
  threadsSessionStatus,
  writeThreadsSession,
} from "@/lib/threadsSession";
import { startThreadsLogin, submitThreadsCode } from "@/lib/threadsLogin";
import { browserSearch } from "@/lib/threadsBrowserSearch";

export const dynamic = "force-dynamic";
// Một lượt đăng nhập bằng trình duyệt có thể mất tới ~40 giây.
export const maxDuration = 90;

/** Đăng nhập thử quá nhiều lần là cách nhanh nhất để Meta khoá tài khoản. */
const LOGIN_LIMIT = { max: 5, windowMs: 3600_000 };

/** Trạng thái phiên — KHÔNG BAO GIỜ trả cookie về trình duyệt. */
export async function GET() {
  if (!(await requireRole("admin"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  return NextResponse.json(threadsSessionStatus());
}

/**
 * body.action:
 *   "login"  — { username, password }: đăng nhập bằng trình duyệt chạy ngầm
 *   "code"   — { flowId, code }: gửi mã xác minh khi Threads hỏi
 *   "cookie" — { username?, cookie }: dán cookie tay (lối dự phòng)
 *   "check"  — thử một lượt tìm kiếm bằng phiên đang lưu
 */
export async function POST(request: Request) {
  const admin = await requireRole("admin");
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Dữ liệu không hợp lệ" }, { status: 400 });
  }

  switch (body.action) {
    case "login": {
      const username = String(body.username ?? "").trim();
      const password = String(body.password ?? "");
      if (!username || !password || username.length > 100 || password.length > 200) {
        return NextResponse.json({ error: "Nhập tên đăng nhập và mật khẩu Threads" }, { status: 400 });
      }
      const wait = take(`threads-login:${admin.id}`, LOGIN_LIMIT);
      if (wait) return tooMany(wait, "Đăng nhập Threads quá nhiều lần trong một giờ — chờ để tránh bị Meta khoá tài khoản.");
      const result = await startThreadsLogin(username, password);
      return NextResponse.json({ result, status: threadsSessionStatus() });
    }

    case "code": {
      const code = String(body.code ?? "").replace(/\s+/g, "");
      if (!/^\d{4,10}$/.test(code)) {
        return NextResponse.json({ error: "Mã xác minh chỉ gồm chữ số" }, { status: 400 });
      }
      const result = await submitThreadsCode(String(body.flowId ?? ""), code);
      return NextResponse.json({ result, status: threadsSessionStatus() });
    }

    case "cookie": {
      const cookies = parseCookieString(String(body.cookie ?? ""));
      if (!cookies) {
        return NextResponse.json(
          { error: "Không thấy cookie sessionid. Dán nguyên dòng Cookie, hoặc riêng giá trị sessionid." },
          { status: 400 },
        );
      }
      writeThreadsSession({
        username: String(body.username ?? "").trim().replace(/^@/, "").slice(0, 100) || "(cookie dán tay)",
        cookies,
        savedAt: new Date().toISOString(),
        method: "cookie",
      });
      return NextResponse.json({ result: { state: "ok" }, status: threadsSessionStatus() });
    }

    case "check": {
      const s = readThreadsSession();
      if (!s) return NextResponse.json({ error: "Chưa có phiên Threads nào được lưu" }, { status: 400 });
      let message: string;
      let ok = false;
      try {
        // Tìm bằng trình duyệt thật đã nạp phiên — đúng cách collect-trends tìm.
        const { results } = await browserSearch(["tin tức"]);
        const r = results["tin tức"];
        ok = r.posts.length > 0;
        message = ok
          ? `Tìm thử "tin tức" ra ${r.posts.length} bài`
          : `Tìm thử không ra bài nào: ${r.reason}` +
            (r.diag ? ` · URL cuối: ${r.diag.finalUrl}` : "");
      } catch (err) {
        message = `Không mở được trình duyệt để tìm: ${(err as Error).message.split("\n")[0]}`;
      }
      recordThreadsCheck(ok, message);
      return NextResponse.json({ result: { state: ok ? "ok" : "error", message }, status: threadsSessionStatus() });
    }

    default:
      return NextResponse.json({ error: "Thao tác không hợp lệ" }, { status: 400 });
  }
}

/** Xoá phiên đang lưu ("Đăng xuất"). */
export async function DELETE() {
  if (!(await requireRole("admin"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  clearThreadsSession();
  return NextResponse.json(threadsSessionStatus());
}
