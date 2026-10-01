import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getCategory } from "@/lib/data";
import { categoryStyles } from "@/lib/categoryStyles";
import { formatDateTime, jsonLdScript } from "@/lib/utils";
import { DEFAULT_OG_IMAGE, serpDescription, serpTitle } from "@/lib/seo";
import { mediaHtml, mediaUrl } from "@/lib/media";
import { getArticleBySlug, listRelatedArticles } from "@/lib/store";
import type { Article } from "@/lib/types";
import { getSessionUser } from "@/lib/auth";
import { listComments } from "@/lib/comments";
import ArticleCard from "@/components/ArticleCard";
import CommentSection from "@/components/CommentSection";
import ReactionButtons from "@/components/ReactionButtons";
import BackToTopButton from "@/components/BackToTopButton";
import ViewBeacon from "@/components/ViewBeacon";

export const revalidate = 60;

/**
 * Bài có được sửa đáng kể SAU khi đăng không.
 *
 * Ngày đăng là NGÀY GỐC và không bao giờ bị đổi; lần sửa cuối hiện thành một
 * mốc riêng "Cập nhật". Bỏ qua phần lệch dưới một tiếng vì chính lần ghi lúc
 * publish cũng làm updatedAt nhích lên vài giây.
 */
function wasUpdated(article: Article) {
  const u = new Date(article.updatedAt).getTime();
  const p = new Date(article.publishedAt).getTime();
  return Number.isFinite(u) && Number.isFinite(p) && u - p > 3600_000;
}

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
  // Cắt gọn ngay ở tầng metadata: tít bài dài bị Google cắt cụt, còn `dek`
  // 180–200 ký tự bị cắt ở giữa câu khi hiện trên kết quả tìm kiếm.
  const description = serpDescription(article.dek);
  // Bài không có ảnh bìa thì rơi về ảnh thương hiệu — thà có ảnh chung còn hơn
  // og:image trống, vì link chia sẻ không ảnh thì tỉ lệ bấm rất thấp.
  const ogImage = article.coverImage
    ? { url: article.coverImage, alt: article.title }
    : DEFAULT_OG_IMAGE;

  return {
    // absolute: độ dài tít đã tự tính, không cho Next gắn thêm " | GenZ News".
    title: { absolute: serpTitle(article.title) },
    description: description || undefined,
    alternates: { canonical: url },
    openGraph: {
      title: article.title,
      description: description || undefined,
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
      images: [ogImage],
    },
    twitter: {
      card: "summary_large_image",
      title: article.title,
      description: description || undefined,
      images: [ogImage.url],
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
  // Bài liên quan chọn theo tag dùng chung (xem listRelatedArticles), không
  // phải cùng chuyên mục — nhờ vậy khối "Đọc thêm" nối được các chuyên mục với
  // nhau thay vì chỉ xoay vòng trong một chuyên mục.
  const related = await listRelatedArticles({
    slug: article.slug,
    category: article.category,
    tags: article.tags,
    limit: 6,
  });
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
        dangerouslySetInnerHTML={{ __html: jsonLdScript(jsonLd) }}
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
      {/* Breadcrumb hiện — khớp đúng BreadcrumbList trong JSON-LD ở trên. Vừa
          cho người đọc biết mình đang ở đâu, vừa là link nội bộ có anchor rõ
          nghĩa (thay vì chỉ một viên "chuyên mục" trơ). */}
      <nav aria-label="Breadcrumb" className="mb-4">
        <ol className="flex flex-wrap items-center gap-1.5 text-xs font-semibold text-muted">
          <li>
            <Link href="/" className="hover:text-accent">
              Trang chủ
            </Link>
          </li>
          <li aria-hidden className="opacity-50">
            ›
          </li>
          <li>
            <Link
              href={`/chuyen-muc/${article.category}`}
              className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 ${style.pill}`}
            >
              <span className={`size-1.5 rounded-full ${style.dot}`} />
              {category?.name}
            </Link>
          </li>
          <li aria-hidden className="hidden opacity-50 sm:inline">
            ›
          </li>
          <li
            aria-current="page"
            className="hidden max-w-[40ch] truncate sm:inline"
          >
            {article.title}
          </li>
        </ol>
      </nav>

      <div>
        <h1 className="font-display text-balance text-3xl font-black leading-tight sm:text-4xl lg:text-5xl">
          {article.title}
        </h1>
        <p className="mt-4 text-balance text-lg text-muted">{article.dek}</p>
        {/* Chuyên mục phụ — chuyên mục chính đã nằm ở breadcrumb phía trên. */}
        {article.extraCategories.length > 0 && (
          <ul className="mt-4 flex flex-wrap items-center gap-1.5 text-xs font-semibold">
            <li className="text-muted">Cũng trong:</li>
            {article.extraCategories.map((slug) => {
              const extra = getCategory(slug);
              const extraStyle = categoryStyles[slug];
              if (!extra || !extraStyle) return null;
              return (
                <li key={slug}>
                  <Link
                    href={`/chuyen-muc/${slug}`}
                    className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 ${extraStyle.pill}`}
                  >
                    <span className={`size-1.5 rounded-full ${extraStyle.dot}`} />
                    {extra.name}
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-2 text-sm text-muted">
        <span className="font-semibold text-foreground">{article.author}</span>
        <span aria-hidden>·</span>
        <span>
          Đăng{" "}
          <time dateTime={article.publishedAt}>
            {formatDateTime(article.publishedAt)}
          </time>
        </span>
        {wasUpdated(article) && (
          <>
            <span aria-hidden>·</span>
            <span>
              Cập nhật{" "}
              <time dateTime={article.updatedAt}>
                {formatDateTime(article.updatedAt)}
              </time>
            </span>
          </>
        )}
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
                Ảnh: {article.coverImageCredit.author} (
                <a
                  href={article.coverImageCredit.sourceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline hover:text-accent"
                >
                  {article.coverImageCredit.sourceName ?? "nguồn"}
                </a>
                {article.coverImageCredit.license ? `, ${article.coverImageCredit.license}` : ""})
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

      {/* Đánh giá của người đọc — không cần đăng nhập, chỉ cộng dồn. */}
      <ReactionButtons
        articleId={article.id}
        initialLikes={article.likeCount ?? 0}
        initialDislikes={article.dislikeCount ?? 0}
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
            Tin liên quan
          </h2>
          <div className="grid gap-8 sm:grid-cols-3">
            {related.map((a) => (
              <ArticleCard key={a.slug} article={a} size="sm" />
            ))}
          </div>
        </div>
      )}
      <BackToTopButton />
      {/* Admin mở bài để kiểm tra thì không tính là lượt đọc. */}
      {!isDraft && user?.role !== "admin" && <ViewBeacon articleId={article.id} />}
    </article>
  );
}
