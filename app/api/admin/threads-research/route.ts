import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { take, tooMany } from "@/lib/rateLimit";
import {
  getResearchJob,
  MAX_KEYWORDS,
  runningResearchJob,
  startResearchJob,
} from "@/lib/threadsResearch";

export const dynamic = "force-dynamic";

/** Mỗi lượt mở một trình duyệt và tìm cả chục từ khoá bằng tài khoản Threads. */
const LIMIT = { max: 10, windowMs: 3600_000 };

/** ?id=<mã việc> → tiến độ; không có id → lượt đang chạy (nếu có). */
export async function GET(request: Request) {
  if (!(await requireRole("admin"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const id = new URL(request.url).searchParams.get("id");
  const job = id ? getResearchJob(id) : runningResearchJob();
  if (id && !job) return NextResponse.json({ error: "Không tìm thấy lượt research này" }, { status: 404 });
  return NextResponse.json({ job });
}

/** body: { keywords: string[] } hoặc { fromTrends: true }. Trả về ngay, chạy nền. */
export async function POST(request: Request) {
  const admin = await requireRole("admin");
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Dữ liệu không hợp lệ" }, { status: 400 });
  }
  const fromTrends = body.fromTrends === true;
  const keywords = Array.isArray(body.keywords)
    ? body.keywords.map((k) => String(k).trim().slice(0, 100)).filter(Boolean)
    : [];
  if (!fromTrends && !keywords.length) {
    return NextResponse.json({ error: "Nhập ít nhất một từ khoá" }, { status: 400 });
  }
  if (keywords.length > MAX_KEYWORDS) {
    return NextResponse.json({ error: `Tối đa ${MAX_KEYWORDS} từ khoá mỗi lượt` }, { status: 400 });
  }

  if (!runningResearchJob()) {
    const wait = take(`threads-research:${admin.id}`, LIMIT);
    if (wait) return tooMany(wait, "Đã research Threads nhiều lượt trong giờ này — chờ chút để tránh tài khoản bị chặn.");
  }
  try {
    return NextResponse.json({ job: await startResearchJob({ keywords, fromTrends }) }, { status: 202 });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 400 });
  }
}
