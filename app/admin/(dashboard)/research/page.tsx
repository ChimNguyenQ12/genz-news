import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { listRequests } from "@/lib/queue";
import ResearchQueue from "@/components/admin/ResearchQueue";

export const dynamic = "force-dynamic";

export default async function ResearchPage() {
  // Hàng đợi đề tài là việc của toà soạn — tài khoản thường không thấy.
  if (!(await requireRole("admin"))) notFound();

  const requests = await listRequests();
  return <ResearchQueue requests={requests} />;
}
