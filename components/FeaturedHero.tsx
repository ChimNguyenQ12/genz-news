import Link from "next/link";
import type { Article } from "@/lib/types";
import { getCategory } from "@/lib/data";
import { categoryStyles } from "@/lib/categoryStyles";
import { relativeDate } from "@/lib/utils";
import { mediaUrl } from "@/lib/media";

export type HeroArticle = Pick<
  Article,
  "slug" | "title" | "dek" | "category" | "coverGradient" | "coverImage" | "author" | "publishedAt" | "readingTimeMin"
>;

export default function FeaturedHero({
  article,
  priority = true,
  className = "",
}: {
  article: HeroArticle;
  /** Chỉ slide đầu tải ảnh ưu tiên; các slide sau tải lười. */
  priority?: boolean;
  className?: string;
}) {
  // Luôn h2: H1 của trang chủ là câu giới thiệu trang (app/(public)/page.tsx).
  // Tít bài làm H1 thì chữ trong H1 đổi theo bài, không khớp nội dung trang —
  // công cụ SEO báo "Words from H1 heading not found in text".
  const Heading = "h2";
  const category = getCategory(article.category);
  const style = categoryStyles[article.category];

  return (
    <Link
      href={`/bai-viet/${article.slug}`}
      className={`group relative flex min-h-[420px] flex-col justify-end overflow-hidden rounded-3xl p-6 sm:p-10 ${className}`}
      style={{
        background: `linear-gradient(135deg, ${article.coverGradient[0]}, ${article.coverGradient[1]})`,
      }}
    >
      {article.coverImage && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={mediaUrl(article.coverImage)}
          alt={article.title}
          fetchPriority={priority ? "high" : "auto"}
          loading={priority ? "eager" : "lazy"}
          decoding="async"
          className="absolute inset-0 size-full object-cover"
        />
      )}
      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/25 to-transparent" />
      <div className="relative">
        <span
          className={`mb-3 inline-flex w-fit items-center gap-1.5 rounded-full bg-white/15 px-2.5 py-1 text-xs font-bold text-white backdrop-blur-sm`}
        >
          <span className={`size-1.5 rounded-full ${style.dot}`} />
          {category?.name}
        </span>
        <Heading className="font-display max-w-2xl text-balance text-3xl font-black leading-tight text-white sm:text-4xl lg:text-5xl">
          {article.title}
        </Heading>
        <p className="mt-3 max-w-xl text-balance text-sm text-white/80 sm:text-base">
          {article.dek}
        </p>
        <div className="mt-4 flex items-center gap-2 text-xs text-white/70">
          <span>{article.author}</span>
          <span aria-hidden>·</span>
          <span>{relativeDate(article.publishedAt)}</span>
          <span aria-hidden>·</span>
          <span>{article.readingTimeMin} phút đọc</span>
        </div>
      </div>
    </Link>
  );
}
