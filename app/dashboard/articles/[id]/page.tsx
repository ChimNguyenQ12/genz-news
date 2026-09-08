import { notFound, redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { getArticleById } from "@/lib/store";
import ArticleEditor from "@/components/admin/ArticleEditor";

export const dynamic = "force-dynamic";

export default async function EditDashboardArticlePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await getSessionUser();
  if (!user) redirect("/dang-nhap");

  const { id } = await params;
  const article = await getArticleById(id);
  if (!article) notFound();

  // Tài khoản thường chỉ mở được bài của chính mình.
  if (user.role !== "admin" && article.authorId !== user.id) notFound();

  return <ArticleEditor article={article} role={user.role} baseRoute="/dashboard" />;
}
