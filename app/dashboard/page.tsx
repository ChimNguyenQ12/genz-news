import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { listArticlesPage } from "@/lib/store";
import ArticleList from "@/components/admin/ArticleList";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const user = await getSessionUser();
  if (!user) redirect("/dang-nhap");

  // authorId lọc ngay trong cơ sở dữ liệu: lọc sau khi đã lấy về thì phân
  // trang sẽ đếm cả bài của người khác.
  const page = await listArticlesPage({ status: "all", authorId: user.id, page: 1 });

  return (
    <div>
      <div className="mb-6">
        <h1 className="font-display text-2xl font-black">Bài viết của tôi</h1>
        <p className="mt-1 text-sm text-muted">
          {page.counts.published} đã đăng · {page.counts.pending} đợi duyệt ·{" "}
          {page.counts.draft} nháp
        </p>
      </div>

      <div className="mb-5 rounded-2xl border border-border bg-surface p-4 text-sm text-muted">
        Viết xong <strong className="text-foreground">Gửi duyệt</strong> tui duyệt cho. Bạn có thể rút về nháp để chỉnh sửa bất cứ lúc nào trước khi bài được duyệt.
      </div>

      <ArticleList initial={page} role={user.role} baseRoute="/dashboard" />
    </div>
  );
}
