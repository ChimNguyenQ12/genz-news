import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { resetUserPassword } from "@/lib/userAdmin";

export const dynamic = "force-dynamic";

/** Đặt mật khẩu tạm; trả về đúng một lần để admin gửi cho người dùng. */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await requireRole("admin"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  try {
    const password = await resetUserPassword((await params).id);
    return NextResponse.json({ password });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 400 });
  }
}
