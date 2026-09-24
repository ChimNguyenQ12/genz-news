import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { runDueFacebookPosts } from "@/lib/facebook";

export const dynamic = "force-dynamic";

/** Đăng các bài tới giờ. Cron gọi 5 phút một lần qua scripts/facebook-run-due.mjs. */
export async function POST() {
  const user = await getSessionUser();
  if (user?.role !== "admin") {
    return NextResponse.json({ error: "Không có quyền truy cập" }, { status: 403 });
  }
  const results = await runDueFacebookPosts();
  return NextResponse.json({ results });
}
