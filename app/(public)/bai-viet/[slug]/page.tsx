import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getCategory } from "@/lib/data";
import { DEFAULT_OG_IMAGE, serpDescription, serpTitle } from "@/lib/seo";
import { getArticleBySlug, listRelatedArticles } from "@/lib/store";
import { listComments } from "@/lib/comments";
import ArticleView from "@/components/ArticleView";

/**
 * Cache 60 giây (ISR), và được làm mới NGAY khi bài, bình luận hay bố cục
 * trang chủ đổi (revalidatePath, lib/revalidate.ts) — người đọc không phải chờ.
 */
export const revalidate = 60;

/**
 * Rỗng = không dựng sẵn bài nào lúc build (lúc build trong Docker không có
 * database), mà dựng ở lượt xem đầu tiên rồi cache cho mọi lượt sau. Next chỉ
 * cache trang có tham số động khi route khai báo hàm này.
 */
export async function generateStaticParams() {
  return [];
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

  // Bài chưa đăng không được lộ tít/dek qua thẻ meta.
  if (!article || article.status !== "published") {
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
  // Trang công khai chỉ có bài đã đăng. Bài nháp xem trước ở /xem-truoc/[id]
  // (cần đăng nhập) — tách ra để trang này không phải đọc cookie, nhờ vậy
  // cache được cho mọi người đọc (revalidate ở trên + làm mới tức thì bằng
  // revalidatePath khi bài đổi — xem lib/revalidate.ts).
  if (!article || article.status !== "published") notFound();

  // Bài liên quan chọn theo tag dùng chung (xem listRelatedArticles), không
  // phải cùng chuyên mục — nhờ vậy khối "Đọc thêm" nối được các chuyên mục với
  // nhau thay vì chỉ xoay vòng trong một chuyên mục.
  const [related, comments] = await Promise.all([
    listRelatedArticles({
      slug: article.slug,
      category: article.category,
      tags: article.tags,
      limit: 6,
    }),
    listComments(article.id),
  ]);

  return <ArticleView article={article} related={related} comments={comments} />;
}
