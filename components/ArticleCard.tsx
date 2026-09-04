import Link from "next/link";
import type { Article } from "@/lib/types";
import { getCategory } from "@/lib/data";
import { categoryStyles } from "@/lib/categoryStyles";
import { relativeTime } from "@/lib/utils";

export default function ArticleCard({
  article,
  size = "md",
}: {
  article: Article;
  size?: "sm" | "md" | "lg";
}) {
  const category = getCategory(article.category);
  const style = categoryStyles[article.category];

  return (
    <Link href={`/bai-viet/${article.slug}`} className="group flex flex-col">
      <div
        className="mb-3 aspect-16/10 w-full rounded-2xl"
        style={{
          background: `linear-gradient(135deg, ${article.coverGradient[0]}, ${article.coverGradient[1]})`,
        }}
      />
      <span
        className={`mb-2 inline-flex w-fit items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold ${style.pill}`}
      >
        <span className={`size-1.5 rounded-full ${style.dot}`} />
        {category?.name}
      </span>
      <h3
        className={`font-display font-black text-balance leading-snug group-hover:text-accent transition-colors ${
          size === "lg" ? "text-2xl sm:text-3xl" : size === "sm" ? "text-base" : "text-lg"
        }`}
      >
        {article.title}
      </h3>
      {size !== "sm" && (
        <p className="mt-2 line-clamp-2 text-sm text-muted">{article.dek}</p>
      )}
      <div className="mt-3 flex items-center gap-2 text-xs text-muted">
        <span>{article.author}</span>
        <span aria-hidden>·</span>
        <span>{relativeTime(article.publishedAt)}</span>
        <span aria-hidden>·</span>
        <span>{article.readingTimeMin} phút đọc</span>
      </div>
    </Link>
  );
}
