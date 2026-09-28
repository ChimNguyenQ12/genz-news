import { jsonLdScript } from "@/lib/utils";
import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { getCategory } from "@/lib/data";
import { categoryStyles } from "@/lib/categoryStyles";
import { DEFAULT_OG_IMAGE } from "@/lib/seo";
import { listPublishedInCategory } from "@/lib/store";
import ArticleCard from "@/components/ArticleCard";
import PageNav from "@/components/PageNav";

export const revalidate = 60;

const BASE_URL =
  process.env.NEXT_PUBLIC_BASE_URL ?? "https://genz-news.site";

/** Bội số của 3 cột để hàng cuối không lẻ. */
const PER_PAGE = 12;

type Props = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ trang?: string }>;
};

const pageFrom = (raw?: string) => Math.max(1, Math.floor(Number(raw)) || 1);
const pageHref = (slug: string, page: number) =>
  page > 1 ? `/chuyen-muc/${slug}?trang=${page}` : `/chuyen-muc/${slug}`;

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const { slug } = await params;
  const category = getCategory(slug);
  if (!category) return { title: "Chuyên mục không tồn tại" };

  const page = pageFrom((await searchParams).trang);
  const url = `${BASE_URL}${pageHref(slug, page)}`;
  return {
    title: `${category.name} — Tin tức mới nhất${page > 1 ? ` (trang ${page})` : ""}`,
    description: `Đọc tin tức ${category.name} mới nhất được chắt lọc và biên tập dành cho Gen Z Việt Nam.`,
    alternates: { canonical: url },
    openGraph: {
      title: `${category.name} | GenZ News`,
      description: `Đọc tin tức ${category.name} mới nhất được chắt lọc và biên tập dành cho Gen Z Việt Nam.`,
      url,
      type: "website",
      locale: "vi_VN",
      images: [DEFAULT_OG_IMAGE],
    },
  };
}

export default async function CategoryPage({ params, searchParams }: Props) {
  const { slug } = await params;
  const category = getCategory(slug);
  if (!category) notFound();

  const style = categoryStyles[category.slug];
  const page = pageFrom((await searchParams).trang);
  const { items, total } = await listPublishedInCategory(category.slug, page, PER_PAGE);
  const totalPages = Math.max(1, Math.ceil(total / PER_PAGE));
  if (page > totalPages) redirect(pageHref(slug, totalPages));

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
        dangerouslySetInnerHTML={{ __html: jsonLdScript(jsonLd) }}
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
            // headingLevel="h2": trang này đã có <h1> là tên chuyên mục, thẻ bài
            // phải là h2 để không nhảy cấp h1 → h3.
            <ArticleCard key={a.slug} article={a} headingLevel="h2" />
          ))}
        </div>
      )}

      <PageNav page={page} totalPages={totalPages} href={(p) => pageHref(slug, p)} />
    </div>
  );
}
