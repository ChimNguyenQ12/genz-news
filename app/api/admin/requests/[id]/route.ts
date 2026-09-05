import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { deleteRequest, updateRequest, type RequestStatus } from "@/lib/queue";

const VALID_STATUS: RequestStatus[] = ["pending", "in_progress", "done", "rejected"];

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!(await requireRole("admin"))) {
    return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  }
  const { id } = await params;

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Dữ liệu không hợp lệ" }, { status: 400 });
  }

  const patch: Parameters<typeof updateRequest>[1] = {};
  if (body.status !== undefined) {
    const status = String(body.status) as RequestStatus;
    if (!VALID_STATUS.includes(status)) {
      return NextResponse.json({ error: "Trạng thái không hợp lệ" }, { status: 400 });
    }
    patch.status = status;
  }
  if (body.notes !== undefined) patch.notes = String(body.notes);
  if (body.reporterNote !== undefined) patch.reporterNote = String(body.reporterNote);

  const updated = await updateRequest(id, patch);
  if (!updated) {
    return NextResponse.json({ error: "Không tìm thấy yêu cầu" }, { status: 404 });
  }
  return NextResponse.json({ request: updated });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!(await requireRole("admin"))) {
    return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  }
  const { id } = await params;
  const ok = await deleteRequest(id);
  if (!ok) {
    return NextResponse.json({ error: "Không tìm thấy yêu cầu" }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
