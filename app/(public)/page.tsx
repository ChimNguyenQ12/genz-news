import Link from "next/link";
import { categories } from "@/lib/data";
import { categoryStyles } from "@/lib/categoryStyles";
import { listArticles } from "@/lib/store";
import FeaturedHero from "@/components/FeaturedHero";
import ArticleCard from "@/components/ArticleCard";
import TrendingList from "@/components/TrendingList";
import SectionHeader from "@/components/SectionHeader";
import NewsletterBanner from "@/components/NewsletterBanner";

export const revalidate = 60;

const BASE_URL =
  process.env.NEXT_PUBLIC_BASE_URL ?? "https://genz-news.site";

export default async function Home() {
  const articles = await listArticles({ status: "published" });

  if (articles.length === 0) {
    return (
      <div className="mx-auto max-w-6xl px-4 py-20 text-center">
        <h1 className="font-display text-2xl font-black">Chưa có bài viết nào</h1>
        <p className="mt-2 text-muted">
          Vào <Link href="/admin" className="text-accent hover:underline">/admin</Link> để tạo và đăng bài.
        </p>
      </div>
    );
  }

  const featured = articles.find((a) => a.featured) ?? articles[0];
  const trending = articles.filter((a) => a.trending).slice(0, 5);
  const latest = articles.filter((a) => a.slug !== featured.slug).slice(0, 4);

  // JSON-LD WebSite — giúp Google hiểu site và kích hoạt Sitelinks Searchbox
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: "GenZ News",
    url: BASE_URL,
    description:
      "Tin tức quốc tế được chắt lọc, biên tập lại và trích dẫn nguồn rõ ràng — đọc nhanh, hiểu sâu.",
    inLanguage: "vi",
    publisher: {
      "@type": "NewsMediaOrganization",
      name: "GenZ News",
      url: BASE_URL,
    },
  };

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:py-10">
      {/* JSON-LD WebSite structured data */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <FeaturedHero article={featured} />

      <div className="no-scrollbar mt-6 flex gap-2 overflow-x-auto pb-2">
        {categories.map((c) => {
          const style = categoryStyles[c.slug];
          return (
            <Link
              key={c.slug}
              href={`/chuyen-muc/${c.slug}`}
              className={`shrink-0 rounded-full border border-border px-4 py-2 text-sm font-semibold transition hover:border-transparent ${style.pill}`}
            >
              {c.name}
            </Link>
          );
        })}
      </div>

      <div className="mt-10 grid gap-10 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <SectionHeader title="Mới nhất" />
          <div className="grid gap-8 sm:grid-cols-2">
            {latest.map((a) => (
              <ArticleCard key={a.slug} article={a} />
            ))}
          </div>
        </div>

        {trending.length > 0 && (
          <aside className="space-y-8">
            <TrendingList articles={trending} />
          </aside>
        )}
      </div>

      <div className="mt-14">
        <NewsletterBanner />
      </div>

      <div className="mt-14 space-y-14">
        {categories.map((c) => {
          const items = articles.filter((a) => a.category === c.slug);
          if (items.length === 0) return null;
          const style = categoryStyles[c.slug];
          return (
            <section key={c.slug}>
              <SectionHeader
                title={c.name}
                href={`/chuyen-muc/${c.slug}`}
                accentClass={style.text}
              />
              <div className="no-scrollbar flex gap-6 overflow-x-auto pb-2 sm:grid sm:grid-cols-3 sm:overflow-visible">
                {items.slice(0, 3).map((a) => (
                  <div key={a.slug} className="w-72 shrink-0 sm:w-auto">
                    <ArticleCard article={a} size="sm" />
                  </div>
                ))}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
