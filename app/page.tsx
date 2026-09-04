import { articles, categories, getFeatured, getTrending } from "@/lib/data";
import { categoryStyles } from "@/lib/categoryStyles";
import FeaturedHero from "@/components/FeaturedHero";
import ArticleCard from "@/components/ArticleCard";
import TrendingList from "@/components/TrendingList";
import SectionHeader from "@/components/SectionHeader";
import NewsletterBanner from "@/components/NewsletterBanner";
import Link from "next/link";

export default function Home() {
  const featured = getFeatured();
  const trending = getTrending();
  const latest = articles.filter((a) => a.slug !== featured.slug).slice(0, 4);

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:py-10">
      <FeaturedHero article={featured} />

      {/* category quick nav */}
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

        <aside className="space-y-8">
          <TrendingList articles={trending} />
        </aside>
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
