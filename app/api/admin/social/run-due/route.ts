import { NextResponse } from "next/server";
import { runDue } from "@/lib/social/core";
import { guard } from "@/lib/social/http";

export const dynamic = "force-dynamic";

/** Đăng các bài tới giờ trên mọi nền tảng. Cron gọi 5 phút một lần (scripts/social-run-due.mjs). */
export async function POST() {
  const g = await guard();
  if (g.error) return g.error;
  return NextResponse.json({ results: await runDue() });
}
