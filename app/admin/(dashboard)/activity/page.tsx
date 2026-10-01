import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth";
import ActivityCenter from "@/components/admin/ActivityCenter";

export const dynamic = "force-dynamic";

/** Thông báo + lưu lượng truy cập + bài đọc nhiều. Chỉ admin. */
export default async function ActivityPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  if (!(await requireRole("admin"))) notFound();
  const { tab } = await searchParams;
  return <ActivityCenter initialTab={tab === "traffic" || tab === "views" ? tab : "notifications"} />;
}
