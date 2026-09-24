import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getCategory } from "@/lib/data";
import { categoryStyles } from "@/lib/categoryStyles";
import { formatDate } from "@/lib/utils";
import { mediaHtml, mediaUrl } from "@/lib/media";
import { getArticleBySlug, listArticles } from "@/lib/store";
import { getSessionUser } from "@/lib/auth";
import { listComments } from "@/lib/comments";
import ArticleCard from "@/components/ArticleCard";
import CommentSection from "@/components/CommentSection";
import BackToTopButton from "@/components/BackToTopButton";

export const revalidate = 60;

const BASE_URL =
  process.env.NEXT_PUBLIC_BASE_URL ?? "https://genz-news.site";

type Props = {
  params: Promise<{ slug: string }>;
};

// generateMetadata chạy trên server — gọi DB (Prisma) qua getArticleBySlug
// y hệt như page component bên dưới. Next.js tự memo kết quả nên DB
// chỉ bị query một lần dù cả hai hàm đều gọi getArticleBySlug(slug).
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const article = await getArticleBySlug(slug);

  if (!article) {
    return { title: "Bài viết không tồn tại" };
  }

  const category = getCategory(article.category);
  const url = `${BASE_URL}/bai-viet/${slug}`;
  const images = article.coverImage
    ? [{ url: article.coverImage, alt: article.title }]
    : [];

  return {
    title: article.title,
    description: article.dek || undefined,
    alternates: { canonical: url },
    openGraph: {
      title: article.title,
      description: article.dek || undefined,
      url,
      type: "article",
      locale: "vi_VN",
      publishedTime: article.publishedAt,
      modifiedTime: article.updatedAt
        ? new Date(article.updatedAt).toISOString()
        : article.publishedAt,
      authors: [article.author],
      section: category?.name,
      tags: article.tags,
      images,
    },
    twitter: {
      card: "summary_large_image",
      title: article.title,
      description: article.dek || undefined,
      images: images.map((i) => i.url),
    },
  };
}

export default async function ArticlePage({ params }: Props) {
  const { slug } = await params;
  const article = await getArticleBySlug(slug);
  if (!article) notFound();

  const user = await getSessionUser();

  // Bài chưa đăng chỉ hiện cho admin hoặc chính tác giả (chế độ xem trước).
  const isDraft = article.status !== "published";
  if (isDraft) {
    const canPreview =
      user && (user.role === "admin" || article.authorId === user.id);
    if (!canPreview) notFound();
  }

  const category = getCategory(article.category);
  const style = categoryStyles[article.category];
  const published = await listArticles({ status: "published" });
  const related = published
    .filter((a) => a.category === article.category && a.slug !== article.slug)
    .slice(0, 3);
  const comments = await listComments(article.id);

  // JSON-LD NewsArticle cho GEO (Perplexity, ChatGPT, Gemini, Google AI Overviews)
  const articleUrl = `${BASE_URL}/bai-viet/${slug}`;
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "NewsArticle",
    headline: article.title,
    description: article.dek || undefined,
    datePublished: article.publishedAt,
    dateModified: article.updatedAt
      ? new Date(article.updatedAt).toISOString()
      : article.publishedAt,
    url: articleUrl,
    mainEntityOfPage: { "@type": "WebPage", "@id": articleUrl },
    author: {
      "@type": "Person",
      name: article.author,
    },
    publisher: {
      "@type": "NewsMediaOrganization",
      name: "GenZ News",
      url: BASE_URL,
      logo: {
        "@type": "ImageObject",
        url: `${BASE_URL}/logo.png`,
        width: 192,
        height: 192,
      },
    },
    image: article.coverImage
      ? {
          "@type": "ImageObject",
          url: article.coverImage,
          caption: article.coverImageCaption ?? article.title,
        }
      : undefined,
    articleSection: category?.name,
    keywords: article.tags.join(", "),
    inLanguage: "vi",
    // citation: map nguồn tham khảo → giúp AI engines hiểu bài tổng hợp từ nguồn uy tín
    citation: article.sources.map((s) => ({
      "@type": "CreativeWork",
      name: s.name,
      url: s.url,
    })),
    // breadcrumb cũng nhúng inline để AI có context ngay
    breadcrumb: {
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Trang chủ", item: BASE_URL },
        {
          "@type": "ListItem",
          position: 2,
          name: category?.name ?? article.category,
          item: `${BASE_URL}/chuyen-muc/${article.category}`,
        },
        { "@type": "ListItem", position: 3, name: article.title, item: articleUrl },
      ],
    },
  };

  return (
    <article className="mx-auto max-w-3xl px-4 py-8 sm:py-12">
      {/* JSON-LD structured data — không hiển thị, dành cho crawler & AI engines */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      {isDraft && (
        <div className="mb-6 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-2.5 text-sm text-amber-700 dark:text-amber-400">
          <span>
            <strong>
              {article.status === "pending"
                ? "Đợi duyệt"
                : article.status === "rejected"
                  ? "Bị trả lại"
                  : "Bản nháp"}
            </strong>{" "}
            — chỉ bạn xem được. Độc giả chưa thấy bài này.
          </span>
          <Link
            href={`/admin/articles/${article.id}`}
            className="font-bold underline underline-offset-2"
          >
            Sửa &amp; đăng →
          </Link>
        </div>
      )}
      <Link
        href={`/chuyen-muc/${article.category}`}
        className={`mb-4 inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold ${style.pill}`}
      >
        <span className={`size-1.5 rounded-full ${style.dot}`} />
        {category?.name}
      </Link>

      <div>
        <h1 className="font-display text-balance text-3xl font-black leading-tight sm:text-4xl lg:text-5xl">
          {article.title}
        </h1>
        <p className="mt-4 text-balance text-lg text-muted">{article.dek}</p>
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-2 text-sm text-muted">
        <span className="font-semibold text-foreground">{article.author}</span>
        <span aria-hidden>·</span>
        <span>
          <time dateTime={article.publishedAt}>
            {formatDate(article.publishedAt)}
          </time>
        </span>
        <span aria-hidden>·</span>
        <span>{article.readingTimeMin} phút đọc</span>
      </div>

      {article.coverImage ? (
        <figure className="my-8">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={mediaUrl(article.coverImage)}
            alt={article.coverImageCaption ?? article.title}
            fetchPriority="high"
            decoding="async"
            className="aspect-16/9 w-full rounded-3xl bg-surface-2 object-cover"
          />
          <figcaption className="mt-2 px-1 text-xs text-muted">
            {article.coverImageCaption && (
              <span>{article.coverImageCaption} </span>
            )}
            {article.coverImageCredit && (
              <span>
                Ảnh: {article.coverImageCredit.author} /{" "}
                <a
                  href={article.coverImageCredit.sourceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline hover:text-accent"
                >
                  {article.coverImageCredit.sourceName ?? "Nguồn"}
                </a>{" "}
                ({article.coverImageCredit.license})
              </span>
            )}
          </figcaption>
        </figure>
      ) : (
        <div
          className="my-8 aspect-16/9 w-full rounded-3xl"
          style={{
            background: `linear-gradient(135deg, ${article.coverGradient[0]}, ${article.coverGradient[1]})`,
          }}
        />
      )}

      {/* Nội dung đã được làm sạch bằng sanitize-html trước khi lưu. */}
      <div
        className="article-body text-[17px] leading-relaxed"
        dangerouslySetInnerHTML={{ __html: mediaHtml(article.body) }}
      />

      {article.tags.length > 0 && (
        <div className="mt-6 flex flex-wrap gap-2">
          {article.tags.map((t) => (
            <span
              key={t}
              className="rounded-full bg-surface-2 px-3 py-1 text-xs font-semibold text-muted"
            >
              #{t}
            </span>
          ))}
        </div>
      )}

      {article.sources.length > 0 && (
        <div className="mt-8 rounded-2xl border border-border bg-surface p-5">
          <h2 className="text-sm font-bold uppercase tracking-wide text-muted">
            Nguồn tham khảo
          </h2>
          <p className="mt-1 text-sm text-muted">
            Bài viết được biên tập &amp; tổng hợp lại từ các nguồn sau:
          </p>
          <ul className="mt-3 space-y-1.5">
            {article.sources.map((s) => (
              <li key={s.url}>
                <a
                  href={s.url}
                  target="_blank"
                  rel="noopener noreferrer nofollow"
                  className="text-sm font-semibold text-accent hover:underline"
                >
                  {s.name} ↗
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}

      <CommentSection
        articleId={article.id}
        initialComments={comments}
        user={user}
      />

      {related.length > 0 && (
        <div className="mt-14">
          <h2 className="font-display mb-5 text-xl font-black">
            Đọc thêm về {category?.name}
          </h2>
          <div className="grid gap-8 sm:grid-cols-3">
            {related.map((a) => (
              <ArticleCard key={a.slug} article={a} size="sm" />
            ))}
          </div>
        </div>
      )}
      <BackToTopButton />
    </article>
  );
}
