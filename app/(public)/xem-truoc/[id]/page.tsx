import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { getArticleById, listRelatedArticles } from "@/lib/store";
import { listComments } from "@/lib/comments";
import ArticleView from "@/components/ArticleView";

/**
 * Xem trước một bài — nháp, chờ duyệt, bị trả lại hay đã đăng — đúng y như
 * người đọc sẽ thấy. Chỉ admin hoặc chính tác giả.
 *
 * Tách khỏi /bai-viet/[slug] vì trang này PHẢI đọc phiên đăng nhập, mà trang
 * công khai đọc phiên là mất cache cho mọi người đọc. Trang này thì động là
 * đúng: chỉ người biên tập mở.
 */
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Xem trước bài viết",
  robots: { index: false, follow: false },
};

export default async function PreviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [user, article] = await Promise.all([getSessionUser(), getArticleById(id)]);
  if (!article || !user || (user.role !== "admin" && article.authorId !== user.id)) notFound();

  const [related, comments] = await Promise.all([
    listRelatedArticles({ slug: article.slug, category: article.category, tags: article.tags, limit: 6 }),
    listComments(article.id),
  ]);
  return <ArticleView article={article} related={related} comments={comments} preview />;
}
