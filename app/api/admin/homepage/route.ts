import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { getHomepageLayout, setHomepageLayout } from "@/lib/store";
import { HERO_SLOTS, HOT_SLOTS, TRENDING_SLOTS } from "@/lib/placement";

export const dynamic = "force-dynamic";

/** Thứ tự hiện tại của hero / "Tin Nóng" / "Đang nóng", cho /admin/homepage. */
export async function GET() {
  if (!(await requireRole("admin"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  return NextResponse.json(await getHomepageLayout());
}

function asIdList(value: unknown, max: number): string[] | null {
  if (!Array.isArray(value)) return null;
  const ids = value.filter((x): x is string => typeof x === "string" && x.length > 0);
  if (ids.length !== value.length) return null;
  return ids.length > max ? null : ids;
}

/**
 * Ghi đè toàn bộ thứ tự hero / "Tin Nóng" / "Đang nóng".
 * body: { hero: string[], hot: string[], trending: string[] }
 * — mảng id bài, đúng thứ tự muốn hiện. Đây là điểm khác với ô chọn vị trí cũ
 * (đã bỏ khỏi trình sửa từng bài): chèn/kéo thả ở đây không cần biết trước
 * "chỗ này đang có ai", danh sách gửi lên đè thẳng lên thứ tự cũ.
 *
 * Cả ba danh sách đều BẮT BUỘC gửi: thiếu một cái là 400 chứ không coi như
 * rỗng. Coi như rỗng thì một client cũ quên gửi `hot` sẽ xoá sạch khối "Tin
 * Nóng" mà không ai biết vì sao.
 */
export async function PUT(req: Request) {
  if (!(await requireRole("admin"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const body = (await req.json().catch(() => ({}))) as {
    hero?: unknown;
    hot?: unknown;
    trending?: unknown;
  };
  const hero = asIdList(body.hero, HERO_SLOTS);
  const hot = asIdList(body.hot, HOT_SLOTS);
  const trending = asIdList(body.trending, TRENDING_SLOTS);
  if (!hero || !hot || !trending) {
    return NextResponse.json(
      {
        error: `Send hero (max ${HERO_SLOTS}), hot (max ${HOT_SLOTS}) and trending (max ${TRENDING_SLOTS}) as lists of article ids`,
      },
      { status: 400 },
    );
  }
  try {
    await setHomepageLayout({ hero, hot, trending });
    return NextResponse.json({ message: "Homepage layout saved" });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 400 });
  }
}
