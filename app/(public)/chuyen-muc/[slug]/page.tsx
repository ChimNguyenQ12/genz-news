import { notFound } from "next/navigation";
import { getCategory } from "@/lib/data";
import { categoryStyles } from "@/lib/categoryStyles";
import { listArticles } from "@/lib/store";
import ArticleCard from "@/components/ArticleCard";

export const dynamic = "force-dynamic";

export default async function CategoryPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const category = getCategory(slug);
  if (!category) notFound();

  const style = categoryStyles[category.slug];
  const items = await listArticles({ status: "published", category: category.slug });

  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <div className="mb-10 flex items-center gap-3">
        <span className={`size-3 rounded-full ${style.dot}`} />
        <h1 className="font-display text-3xl font-black sm:text-4xl">
          {category.name}
        </h1>
      </div>

      {items.length === 0 ? (
        <p className="text-muted">Chưa có bài viết nào trong chuyên mục này.</p>
      ) : (
        <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((a) => (
            <ArticleCard key={a.slug} article={a} />
          ))}
        </div>
      )}
    </div>
  );
}
