import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { listRequests } from "@/lib/queue";
import { readSettings } from "@/lib/settings";
import ResearchQueue from "@/components/admin/ResearchQueue";
import NewsroomSwitch from "@/components/admin/NewsroomSwitch";

export const dynamic = "force-dynamic";

export default async function ResearchPage() {
  // Hàng đợi đề tài là việc của toà soạn — tài khoản thường không thấy.
  if (!(await requireRole("admin"))) notFound();

  const [requests, settings] = await Promise.all([listRequests(), readSettings()]);
  return (
    <>
      <NewsroomSwitch initial={settings} />
      <ResearchQueue requests={requests} />
    </>
  );
}
