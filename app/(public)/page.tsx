import { jsonLdScript } from "@/lib/utils";
import Link from "next/link";
import { categories } from "@/lib/data";
import { categoryStyles } from "@/lib/categoryStyles";
import { PHASE_PRODUCTION_BUILD } from "next/constants";
import { cachedPublishedSummaries } from "@/lib/publicCache";
import { HOT_SLOTS } from "@/lib/placement";
import HeroSlideshow from "@/components/HeroSlideshow";
import ArticleCard from "@/components/ArticleCard";
import TrendingList from "@/components/TrendingList";
import SectionHeader from "@/components/SectionHeader";
import NewsletterBanner from "@/components/NewsletterBanner";

/**
 * Cache nguyên trang 60 giây (ISR), và làm mới NGAY khi bài hay bố cục trang
 * chủ đổi (revalidatePath("/") trong lib/revalidate.ts).
 *
 * Lúc `next build` (trong Docker, KHÔNG có database) trang chủ không có tham
 * số nên Next vẫn dựng sẵn nó — khi đó trả bản giữ chỗ bên dưới thay vì gọi
 * database. Bản đó đã "cũ" ngay khi deploy, nên lượt xem đầu tiên kích hoạt
 * dựng lại bản thật; bước deploy (.gitlab-ci.yml) gọi trước trang chủ ngay sau
 * khi app lên, để người đọc thật không gặp bản giữ chỗ.
 */
export const revalidate = 60;

/** Bản giữ chỗ lúc build. Lỡ có ai gặp thì nó tự tải lại sau 2 giây. */
function BuildPlaceholder() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-20 text-center">
      <meta httpEquiv="refresh" content="2" />
      <p className="text-muted">Đang tải tin mới…</p>
    </div>
  );
}

const BASE_URL =
  process.env.NEXT_PUBLIC_BASE_URL ?? "https://genz-news.site";

export default async function Home() {
  // Không kèm thân bài: trang chủ chỉ cần thẻ bài, còn thân bài mỗi bài 8–14KB.
  if (process.env.NEXT_PHASE === PHASE_PRODUCTION_BUILD) return <BuildPlaceholder />;
  const articles = await cachedPublishedSummaries();

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

  // Theo vị trí đặt trong /admin/homepage (1 = đầu tiên); chưa đặt bài nào thì
  // lùi về bài mới nhất, để trang chủ không trống trong lúc chờ xếp.
  const byOrder = (key: "featuredOrder" | "hotOrder" | "trendingOrder") =>
    articles.filter((a) => a[key] != null).sort((a, b) => a[key]! - b[key]!);
  const heroes = byOrder("featuredOrder");
  if (heroes.length === 0) heroes.push(articles[0]);
  const trending = byOrder("trendingOrder");
  const heroSlugs = new Set(heroes.map((a) => a.slug));
  // "Tin Nóng" thay cho khối "Mới nhất" tự động trước đây: giờ do tổng biên tập
  // chọn bài và xếp thứ tự. Bỏ trống thì mới rơi về bài mới nhất.
  const hot = byOrder("hotOrder");
  const hotCards =
    hot.length > 0 ? hot : articles.filter((a) => !heroSlugs.has(a.slug)).slice(0, HOT_SLOTS);

  // Một bài thường hiện nhiều lần trên trang chủ (hero, Tin Nóng, Đang nóng,
  // khối chuyên mục — nhất là khi bài thuộc nhiều chuyên mục). Chỉ lần đầu là
  // thẻ tiêu đề; các lần sau hiện y hệt nhưng bằng <p>, nếu không công cụ SEO
  // báo "Remove duplicate heading texts" và Google khó hiểu cấu trúc trang.
  // Đi đúng thứ tự xuất hiện trên trang: hero → Tin Nóng → Đang nóng → chuyên mục.
  const seen = new Set(heroes.map((a) => a.slug));
  const firstTime = (slug: string) => {
    if (seen.has(slug)) return false;
    seen.add(slug);
    return true;
  };
  const hotLevels = new Map(hotCards.map((a) => [a.slug, firstTime(a.slug) ? ("h3" as const) : ("p" as const)]));
  const trendingRepeated = new Set(trending.filter((a) => !firstTime(a.slug)).map((a) => a.slug));
  const categoryBlocks = categories.map((c) => {
    const items = articles
      .filter((a) => a.category === c.slug || a.extraCategories.includes(c.slug))
      .slice(0, 3)
      .map((a) => ({ article: a, level: firstTime(a.slug) ? ("h3" as const) : ("p" as const) }));
    return { category: c, items };
  });

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
        dangerouslySetInnerHTML={{ __html: jsonLdScript(jsonLd) }}
      />
      {/* H1 của trang chủ: nói trang này là gì, khớp với <title> và mô tả —
          công cụ SEO đối chiếu chữ trong H1 với nội dung trang. */}
      <div className="mb-5 sm:mb-6">
        <h1 className="font-display text-2xl font-black tracking-tight sm:text-3xl">
          Tin thế giới, gọn cho Gen Z
        </h1>
        <p className="mt-1 text-sm text-muted sm:text-base">
          Tin thế giới và Việt Nam, gọn cho Gen Z — chắt lọc từ nhiều nguồn, biên tập lại và trích
          dẫn nguồn rõ ràng.
        </p>
      </div>

      <HeroSlideshow articles={heroes} />

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
          <SectionHeader title="Tin Nóng" />
          <div className="grid gap-8 sm:grid-cols-2">
            {hotCards.map((a) => (
              <ArticleCard key={a.slug} article={a} headingLevel={hotLevels.get(a.slug)} />
            ))}
          </div>
        </div>

        {trending.length > 0 && (
          <aside className="space-y-8">
            <TrendingList articles={trending} repeated={trendingRepeated} />
          </aside>
        )}
      </div>

      <div className="mt-14">
        <NewsletterBanner />
      </div>

      <div className="mt-14 space-y-14">
        {categoryBlocks.map(({ category: c, items }) => {
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
                {items.map(({ article: a, level }) => (
                  <div key={a.slug} className="w-72 shrink-0 sm:w-auto">
                    <ArticleCard article={a} size="sm" headingLevel={level} />
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
