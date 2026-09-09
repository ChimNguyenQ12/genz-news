import Link from "next/link";
import { notFound } from "next/navigation";
import { getCategory } from "@/lib/data";
import { categoryStyles } from "@/lib/categoryStyles";
import { formatDate } from "@/lib/utils";
import { getArticleBySlug, listArticles } from "@/lib/store";
import { getSessionUser } from "@/lib/auth";
import { listComments } from "@/lib/comments";
import ArticleCard from "@/components/ArticleCard";
import CommentSection from "@/components/CommentSection";
import TranslateButton from "@/components/TranslateButton";
import BackToTopButton from "@/components/BackToTopButton";

export const dynamic = "force-dynamic";

export default async function ArticlePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
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

  return (
    <article className="mx-auto max-w-3xl px-4 py-8 sm:py-12">
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

      <div id="article-translatable">
        <h1 className="font-display text-balance text-3xl font-black leading-tight sm:text-4xl lg:text-5xl">
          {article.title}
        </h1>
        <p className="mt-4 text-balance text-lg text-muted">{article.dek}</p>
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-2 text-sm text-muted">
        <span className="font-semibold text-foreground">{article.author}</span>
        <span aria-hidden>·</span>
        <span>{formatDate(article.publishedAt)}</span>
        <span aria-hidden>·</span>
        <span>{article.readingTimeMin} phút đọc</span>
        {article.language === "en" && (
          <span className="rounded-full bg-surface-2 px-2 py-0.5 text-[11px] font-bold">
            English
          </span>
        )}
      </div>

      <div className="border-b border-border pb-6">
        <TranslateButton
          language={article.language}
          targetSelector="#article-translatable, .article-body"
        />
      </div>

      {article.coverImage ? (
        <figure className="my-8">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={article.coverImage}
            alt={article.coverImageCaption ?? article.title}
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
        dangerouslySetInnerHTML={{ __html: article.body }}
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
