import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { listRequestsPage, STALE_AFTER_MIN } from "@/lib/queue";
import { readRunStatus } from "@/lib/newsroom";
import { readSettings } from "@/lib/settings";
import ResearchQueue from "@/components/admin/ResearchQueue";

export const dynamic = "force-dynamic";

export default async function ResearchPage() {
  // Hàng đợi đề tài là việc của toà soạn — tài khoản thường không thấy.
  if (!(await requireRole("admin"))) notFound();

  // Chỉ trang đầu, và mặc định là ngày gần nhất còn đề tài. Đổi tab, đổi ngày
  // hay sang trang khác thì màn hình tự gọi API, nhẹ hơn nhiều so với dựng
  // lại cả trang trên máy chủ.
  const [requests, settings, run] = await Promise.all([
    listRequestsPage({ status: "all", page: 1, date: "latest" }),
    readSettings(),
    readRunStatus(),
  ]);

  return (
    <ResearchQueue
      initial={requests}
      initialRun={run}
      initialSettings={settings}
      staleAfterMin={STALE_AFTER_MIN}
    />
  );
}
