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
        <h1 className="font-display text-2xl font-black">My articles</h1>
        <p className="mt-1 text-sm text-muted">
          {page.counts.published} published · {page.counts.pending} in review ·{" "}
          {page.counts.draft} drafts
        </p>
      </div>

      <div className="mb-5 rounded-2xl border border-border bg-surface p-4 text-sm text-muted">
        When a piece is ready, hit <strong className="text-foreground">Submit</strong>
        and I&apos;ll review it. You can pull it back to draft and keep editing any time
        before it is approved.
      </div>

      <ArticleList initial={page} role={user.role} baseRoute="/dashboard" />
    </div>
  );
}
