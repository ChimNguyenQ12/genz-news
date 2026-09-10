import fs from "fs/promises";
import path from "path";
import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import {
  deleteRequest,
  releaseRequest,
  updateRequest,
  type RequestStatus,
} from "@/lib/queue";

const VALID_STATUS: RequestStatus[] = ["pending", "in_progress", "done", "rejected"];

const DATA_DIR = process.env.DATA_DIR ?? path.join(process.cwd(), "data");
/** Hộp thư gửi việc cho Automatically Generate — xem chú thích ở route convert. */
const INBOX = path.join(DATA_DIR, "newsroom-requests");

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

  // Gỡ một lượt viết bị treo: trả đề tài về hàng đợi để giao lại.
  //
  // Lượt viết chạy trên host, ngoài tầm với của app — app không giết được tiến
  // trình đó. Nhưng nếu nó còn sống thì bước lưu bài vẫn chạy bình thường và
  // đóng mục lại; còn nếu nó đã chết thì đây là đường duy nhất gỡ kẹt.
  if (body.action === "requeue") {
    // Xoá luôn thư trong hộp thư nếu lượt đó chưa kịp được nhặt, kẻo vừa trả
    // về hàng đợi thì phút sau máy lại nhặt đúng nó lên. Chỉ đụng vào tên tệp
    // đúng dạng uuid — id đi thẳng từ URL vào đường dẫn tệp.
    if (/^[0-9a-f-]{36}$/i.test(id)) {
      await fs.rm(path.join(INBOX, id), { force: true }).catch(() => {});
    }
    const released = await releaseRequest(
      id,
      "Tổng biên tập đã gỡ lượt viết bị treo lúc " +
        new Date().toISOString() +
        ". Đề tài trở lại hàng đợi, bấm Create Post để giao lại.",
    );
    if (!released) {
      return NextResponse.json({ error: "Không tìm thấy yêu cầu" }, { status: 404 });
    }
    return NextResponse.json({ request: released });
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
