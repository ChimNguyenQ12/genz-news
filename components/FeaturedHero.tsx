import Link from "next/link";
import type { Article } from "@/lib/types";
import { getCategory } from "@/lib/data";
import { categoryStyles } from "@/lib/categoryStyles";
import { relativeTime } from "@/lib/utils";

export default function FeaturedHero({ article }: { article: Article }) {
  const category = getCategory(article.category);
  const style = categoryStyles[article.category];

  return (
    <Link
      href={`/bai-viet/${article.slug}`}
      className="group relative flex min-h-[420px] flex-col justify-end overflow-hidden rounded-3xl p-6 sm:p-10"
      style={{
        background: `linear-gradient(135deg, ${article.coverGradient[0]}, ${article.coverGradient[1]})`,
      }}
    >
      {article.coverImage && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={article.coverImage}
          alt={article.title}
          fetchPriority="high"
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
        <h1 className="font-display max-w-2xl text-balance text-3xl font-black leading-tight text-white sm:text-4xl lg:text-5xl">
          {article.title}
        </h1>
        <p className="mt-3 max-w-xl text-balance text-sm text-white/80 sm:text-base">
          {article.dek}
        </p>
        <div className="mt-4 flex items-center gap-2 text-xs text-white/70">
          <span>{article.author}</span>
          <span aria-hidden>·</span>
          <span>{relativeTime(article.publishedAt)}</span>
          <span aria-hidden>·</span>
          <span>{article.readingTimeMin} phút đọc</span>
        </div>
      </div>
    </Link>
  );
}
