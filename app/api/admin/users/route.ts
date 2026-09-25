import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { listUsers, type UserFilter } from "@/lib/userAdmin";

export const dynamic = "force-dynamic";

const FILTERS: UserFilter[] = ["all", "contributor", "admin", "locked"];

/** Danh sách tài khoản. Tham số: q (username / tên hiển thị), filter, page. */
export async function GET(request: Request) {
  if (!(await requireRole("admin"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const sp = new URL(request.url).searchParams;
  const filter = FILTERS.includes(sp.get("filter") as UserFilter) ? (sp.get("filter") as UserFilter) : "all";
  return NextResponse.json(
    await listUsers({ q: sp.get("q") ?? "", filter, page: Number(sp.get("page")) || 1 }),
  );
}
