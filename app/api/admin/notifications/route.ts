import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import {
  clearRead,
  listNotifications,
  markRead,
  NOTIFICATION_TYPES,
  unreadCount,
  type NotificationType,
} from "@/lib/notifications";

export const dynamic = "force-dynamic";

const asType = (v: unknown) =>
  NOTIFICATION_TYPES.includes(v as NotificationType) ? (v as NotificationType) : undefined;

/**
 * Danh sách thông báo. Tham số: type, unread=1, page, perPage.
 * `?count=1` chỉ trả số chưa đọc — chuông ở thanh điều hướng gọi cái này mỗi
 * 30 giây nên phải rẻ.
 */
export async function GET(request: Request) {
  if (!(await requireRole("admin"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const sp = new URL(request.url).searchParams;
  if (sp.get("count") === "1") {
    return NextResponse.json({ unread: await unreadCount() });
  }
  return NextResponse.json(
    await listNotifications({
      type: asType(sp.get("type")),
      unreadOnly: sp.get("unread") === "1",
      page: Number(sp.get("page")) || 1,
      perPage: Number(sp.get("perPage")) || 30,
    }),
  );
}

/** Đánh dấu đã đọc: body `{ ids: string[] }` hoặc `{ all: true, type? }`. */
export async function PATCH(request: Request) {
  if (!(await requireRole("admin"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Dữ liệu không hợp lệ" }, { status: 400 });
  }
  const updated = await markRead({
    ids: Array.isArray(body.ids) ? (body.ids as string[]) : undefined,
    all: body.all === true,
    type: asType(body.type),
  });
  return NextResponse.json({ updated, unread: await unreadCount() });
}

/** Xoá mọi thông báo đã đọc. */
export async function DELETE() {
  if (!(await requireRole("admin"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  return NextResponse.json({ deleted: await clearRead() });
}
