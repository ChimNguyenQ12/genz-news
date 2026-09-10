import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import {
  createRequest,
  listRequestsPage,
  STALE_AFTER_MIN,
  type RequestStatus,
} from "@/lib/queue";
import { readRunStatus } from "@/lib/newsroom";

const VALID_STATUS = new Set<string>(["pending", "in_progress", "done", "rejected"]);

/**
 * Một trang của hàng đợi đề tài.
 *
 * Tham số: status (kèm "all"), q, page, perPage. Kèm sẵn số đếm cho mọi tab để
 * màn hình không phải gọi thêm lần nữa chỉ để biết tab nào có bao nhiêu mục.
 */
export async function GET(request: Request) {
  if (!(await requireRole("admin"))) {
    return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  }

  const params = new URL(request.url).searchParams;
  const status = params.get("status");

  // Nhịp tim đi kèm luôn trong câu trả lời: màn hình đang hỏi lại mỗi 20 giây
  // để theo dõi bài đang viết, thêm một lượt gọi nữa chỉ để hỏi "máy có chạy
  // không" là thừa.
  const [page, run] = await Promise.all([
    listRequestsPage({
      status: status && VALID_STATUS.has(status) ? (status as RequestStatus) : "all",
      q: params.get("q") ?? undefined,
      // Không truyền date thì mặc định là ngày gần nhất còn đề tài: mở màn
      // hình lên là thấy việc mới nhất, không phải cuộn qua hàng trăm mục cũ.
      // Muốn xem tất cả thì gửi date= (rỗng).
      date: params.has("date") ? (params.get("date") ?? "") : "latest",
      page: Number(params.get("page")) || 1,
      perPage: Number(params.get("perPage")) || undefined,
    }),
    readRunStatus(),
  ]);

  return NextResponse.json({ ...page, staleAfterMin: STALE_AFTER_MIN, run });
}

export async function POST(request: Request) {
  if (!(await requireRole("admin"))) {
    return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Dữ liệu không hợp lệ" }, { status: 400 });
  }

  const topic = String(body.topic ?? "").trim();
  if (!topic) {
    return NextResponse.json({ error: "Thiếu chủ đề" }, { status: 400 });
  }

  const urls = Array.isArray(body.urls)
    ? body.urls.map(String).filter((u) => u.trim())
    : String(body.urls ?? "")
        .split(/[\n,]/)
        .map((u) => u.trim())
        .filter(Boolean);

  const created = await createRequest({
    topic,
    urls,
    notes: String(body.notes ?? ""),
  });

  return NextResponse.json({ request: created }, { status: 201 });
}
