import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { listArticles } from "@/lib/store";
import ArticleList from "@/components/admin/ArticleList";

export const dynamic = "force-dynamic";

export default async function AdminHome() {
  const user = await getSessionUser();
  if (!user) redirect("/dang-nhap");

  const all = await listArticles();
  const mine = user.role === "admin" ? all : all.filter((a) => a.authorId === user.id);

  const pending = mine.filter((a) => a.status === "pending").length;
  const published = mine.filter((a) => a.status === "published").length;
  const drafts = mine.filter((a) => a.status === "draft").length;

  return (
    <div>
      <div className="mb-6">
        <h1 className="font-display text-2xl font-black">
          {user.role === "admin" ? "Quản lý bài viết" : "Bài viết của tôi"}
        </h1>
        <p className="mt-1 text-sm text-muted">
          {user.role === "admin" ? (
            <>
              {pending > 0 && (
                <strong className="text-amber-600 dark:text-amber-400">
                  {pending} bài đợi duyệt ·{" "}
                </strong>
              )}
              {published} đã đăng · {drafts} nháp
            </>
          ) : (
            <>
              {published} đã đăng · {pending} đợi duyệt · {drafts} nháp
            </>
          )}
        </p>
      </div>

      {user.role !== "admin" && (
        <div className="mb-5 rounded-2xl border border-border bg-surface p-4 text-sm text-muted">
          Viết xong bấm <strong className="text-foreground">Gửi duyệt</strong>. Nhớ ghi
          đủ nguồn — bài thiếu nguồn hay bị trả lại.
        </div>
      )}

      <ArticleList articles={mine} role={user.role} />
    </div>
  );
}
