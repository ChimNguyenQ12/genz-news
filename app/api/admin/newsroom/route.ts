import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { readSettings, writeSettings } from "@/lib/settings";

export async function GET() {
  if (!(await requireRole("admin"))) {
    return NextResponse.json({ error: "Không có quyền" }, { status: 401 });
  }
  return NextResponse.json({ settings: await readSettings() });
}

export async function PUT(request: Request) {
  if (!(await requireRole("admin"))) {
    return NextResponse.json({ error: "Không có quyền" }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Dữ liệu không hợp lệ" }, { status: 400 });
  }

  const settings = await writeSettings({
    enabled: body.enabled !== false,
    maxArticlesPerRun: Number(body.maxArticlesPerRun),
  });
  return NextResponse.json({ settings });
}
