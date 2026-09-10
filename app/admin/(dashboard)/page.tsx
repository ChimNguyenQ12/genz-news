import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { listArticlesPage } from "@/lib/store";
import ArticleList from "@/components/admin/ArticleList";

export const dynamic = "force-dynamic";

export default async function AdminHome() {
  const user = await getSessionUser();
  if (!user) redirect("/dang-nhap");
  if (user.role !== "admin") redirect("/dashboard");

  // Chỉ lấy trang đầu và chỉ những cột danh sách cần (không kèm thân bài).
  // Việc lọc và sang trang do màn hình tự gọi API, không dựng lại cả trang.
  const page = await listArticlesPage({ status: "all", page: 1 });

  return (
    <div>
      <div className="mb-6">
        <h1 className="font-display text-2xl font-black">Quản lý bài viết</h1>
        <p className="mt-1 text-sm text-muted">
          {page.counts.pending > 0 && (
            <strong className="text-amber-600 dark:text-amber-400">
              {page.counts.pending} bài đợi duyệt ·{" "}
            </strong>
          )}
          {page.counts.published} đã đăng · {page.counts.draft} nháp
        </p>
      </div>

      <ArticleList initial={page} role={user.role} baseRoute="/admin" />
    </div>
  );
}
