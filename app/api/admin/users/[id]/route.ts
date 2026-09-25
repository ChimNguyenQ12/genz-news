import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { getUserDetail, setUserLocked, setUserRole } from "@/lib/userAdmin";
import type { Role } from "@/lib/users";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/** Thông tin một tài khoản kèm mọi bài họ đã tạo. */
export async function GET(_req: Request, { params }: Ctx) {
  if (!(await requireRole("admin"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const user = await getUserDetail((await params).id);
  if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });
  return NextResponse.json({ user });
}

/** body: { action: "lock" | "unlock" } hoặc { action: "role", role }. */
export async function PATCH(req: Request, { params }: Ctx) {
  const admin = await requireRole("admin");
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;
  const body = (await req.json().catch(() => ({}))) as { action?: string; role?: Role };
  try {
    if (body.action === "lock" || body.action === "unlock") {
      await setUserLocked(admin.id, id, body.action === "lock");
      return NextResponse.json({ message: body.action === "lock" ? "Account locked" : "Account unlocked" });
    }
    if (body.action === "role" && body.role) {
      await setUserRole(admin.id, id, body.role);
      return NextResponse.json({ message: `Role changed to ${body.role}` });
    }
    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 400 });
  }
}
