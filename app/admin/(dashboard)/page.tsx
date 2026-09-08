import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { listArticles } from "@/lib/store";
import ArticleList from "@/components/admin/ArticleList";

export const dynamic = "force-dynamic";

export default async function AdminHome() {
  const user = await getSessionUser();
  if (!user) redirect("/dang-nhap");
  if (user.role !== "admin") redirect("/dashboard");

  const articles = await listArticles();

  const pending = articles.filter((a) => a.status === "pending").length;
  const published = articles.filter((a) => a.status === "published").length;
  const drafts = articles.filter((a) => a.status === "draft").length;

  return (
    <div>
      <div className="mb-6">
        <h1 className="font-display text-2xl font-black">Quản lý bài viết</h1>
        <p className="mt-1 text-sm text-muted">
          {pending > 0 && (
            <strong className="text-amber-600 dark:text-amber-400">
              {pending} bài đợi duyệt ·{" "}
            </strong>
          )}
          {published} đã đăng · {drafts} nháp
        </p>
      </div>

      <ArticleList articles={articles} role={user.role} baseRoute="/admin" />
    </div>
  );
}
