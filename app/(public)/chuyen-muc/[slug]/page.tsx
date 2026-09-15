import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getCategory } from "@/lib/data";
import { categoryStyles } from "@/lib/categoryStyles";
import { listArticles } from "@/lib/store";
import ArticleCard from "@/components/ArticleCard";

export const dynamic = "force-dynamic";

const BASE_URL =
  process.env.NEXT_PUBLIC_BASE_URL ?? "https://genz-news.site";

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const category = getCategory(slug);
  if (!category) return { title: "Chuyên mục không tồn tại" };

  const url = `${BASE_URL}/chuyen-muc/${slug}`;
  return {
    title: `${category.name} — Tin tức mới nhất`,
    description: `Đọc tin tức ${category.name} mới nhất được chắt lọc và biên tập dành cho Gen Z Việt Nam.`,
    alternates: { canonical: url },
    openGraph: {
      title: `${category.name} | GenZ News`,
      description: `Đọc tin tức ${category.name} mới nhất được chắt lọc và biên tập dành cho Gen Z Việt Nam.`,
      url,
      type: "website",
      locale: "vi_VN",
    },
  };
}

export default async function CategoryPage({ params }: Props) {
  const { slug } = await params;
  const category = getCategory(slug);
  if (!category) notFound();

  const style = categoryStyles[category.slug];
  const items = await listArticles({ status: "published", category: category.slug });

  const categoryUrl = `${BASE_URL}/chuyen-muc/${slug}`;

  // JSON-LD BreadcrumbList + CollectionPage
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: `${category.name} — GenZ News`,
    url: categoryUrl,
    breadcrumb: {
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Trang chủ", item: BASE_URL },
        { "@type": "ListItem", position: 2, name: category.name, item: categoryUrl },
      ],
    },
  };

  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      {/* JSON-LD structured data */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

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
