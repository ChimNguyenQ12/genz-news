import Link from "next/link";
import type { Article } from "@/lib/types";
import { getCategory } from "@/lib/data";
import { categoryStyles } from "@/lib/categoryStyles";
import { relativeTime } from "@/lib/utils";
import { mediaUrl } from "@/lib/media";

export default function ArticleCard({
  article,
  size = "md",
  headingLevel = "h3",
}: {
  article: Pick<
    Article,
    | "slug" | "title" | "dek" | "category" | "coverGradient" | "coverImage"
    | "author" | "publishedAt" | "readingTimeMin"
  >;
  size?: "sm" | "md" | "lg";
  /**
   * Cấp thẻ tiêu đề của bài. Mặc định h3 vì thẻ bài thường nằm dưới một <h2>
   * (tiêu đề mục ở trang chủ, mục "Đọc thêm" trong bài). Riêng trang chuyên mục
   * chỉ có <h1> là tên chuyên mục nên truyền "h2" để không nhảy cấp h1 → h3.
   */
  headingLevel?: "h2" | "h3";
}) {
  const category = getCategory(article.category);
  const style = categoryStyles[article.category];
  const Heading = headingLevel;

  return (
    <Link href={`/bai-viet/${article.slug}`} className="group flex flex-col">
      {article.coverImage ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={mediaUrl(article.coverImage)}
          alt={article.title}
          loading="lazy"
          decoding="async"
          className="mb-3 aspect-16/10 w-full rounded-2xl bg-surface-2 object-cover"
        />
      ) : (
        <div
          className="mb-3 aspect-16/10 w-full rounded-2xl"
          style={{
            background: `linear-gradient(135deg, ${article.coverGradient[0]}, ${article.coverGradient[1]})`,
          }}
        />
      )}
      <span
        className={`mb-2 inline-flex w-fit items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold ${style.pill}`}
      >
        <span className={`size-1.5 rounded-full ${style.dot}`} />
        {category?.name}
      </span>
      <Heading
        className={`font-display font-black text-balance leading-snug group-hover:text-accent transition-colors ${
          size === "lg" ? "text-2xl sm:text-3xl" : size === "sm" ? "text-base" : "text-lg"
        }`}
      >
        {article.title}
      </Heading>
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
