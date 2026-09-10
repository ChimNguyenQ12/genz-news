import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { listRequestsPage, STALE_AFTER_MIN } from "@/lib/queue";
import { readRunStatus } from "@/lib/newsroom";
import { readSettings } from "@/lib/settings";
import ResearchQueue from "@/components/admin/ResearchQueue";
import NewsroomSwitch from "@/components/admin/NewsroomSwitch";

export const dynamic = "force-dynamic";

export default async function ResearchPage() {
  // Hàng đợi đề tài là việc của toà soạn — tài khoản thường không thấy.
  if (!(await requireRole("admin"))) notFound();

  // Chỉ trang đầu. Đổi tab hay sang trang khác thì màn hình tự gọi API, nhẹ
  // hơn nhiều so với dựng lại cả trang trên máy chủ.
  const [requests, settings, run] = await Promise.all([
    listRequestsPage({ status: "all", page: 1 }),
    readSettings(),
    readRunStatus(),
  ]);

  return (
    <>
      <NewsroomSwitch initial={settings} />
      <ResearchQueue
        initial={requests}
        initialRun={run}
        staleAfterMin={STALE_AFTER_MIN}
      />
    </>
  );
}
