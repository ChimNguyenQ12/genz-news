import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { isPlatform, type Platform } from "./types";

/** Chỉ admin; và nền tảng trong URL phải có thật. Trả về lỗi dạng NextResponse nếu không. */
export async function guard(
  platformParam?: string,
): Promise<{ platform: Platform; error?: never } | { platform?: never; error: NextResponse }> {
  const user = await getSessionUser();
  if (user?.role !== "admin") {
    return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }
  if (platformParam !== undefined && !isPlatform(platformParam)) {
    return { error: NextResponse.json({ error: "Unknown platform" }, { status: 404 }) };
  }
  return { platform: platformParam as Platform };
}

export const fail = (err: unknown, status = 400) =>
  NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status });
