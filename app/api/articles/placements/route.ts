import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { listPlacements } from "@/lib/store";

export const dynamic = "force-dynamic";

/** Bài nào đang giữ vị trí nào trong hero / "Đang nóng" — để trình sửa bài làm mờ chỗ đã có người. */
export async function GET() {
  const user = await getSessionUser();
  if (user?.role !== "admin") return NextResponse.json({ error: "Không có quyền" }, { status: 403 });
  return NextResponse.json(await listPlacements());
}
