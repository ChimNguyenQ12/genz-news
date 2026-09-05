import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { createRequest, listRequests } from "@/lib/queue";

export async function GET() {
  if (!(await requireRole("admin"))) {
    return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  }
  return NextResponse.json({ requests: await listRequests() });
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
