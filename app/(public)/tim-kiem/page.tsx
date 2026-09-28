import type { Metadata } from "next";
import { searchPublishedArticles } from "@/lib/store";
import ArticleCard from "@/components/ArticleCard";

// Kết quả phụ thuộc ?q=, không cache như trang chuyên mục.
export const dynamic = "force-dynamic";

type Props = { searchParams: Promise<{ q?: string | string[] }> };

function readQuery(q: string | string[] | undefined) {
  return (Array.isArray(q) ? q[0] : q ?? "").trim().slice(0, 100);
}

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const q = readQuery((await searchParams).q);
  return {
    title: q ? `Tìm kiếm: ${q}` : "Tìm kiếm",
    // Trang kết quả tìm kiếm không nên vào chỉ mục của Google.
    robots: { index: false, follow: true },
  };
}

export default async function SearchPage({ searchParams }: Props) {
  const q = readQuery((await searchParams).q);
  const items = q ? await searchPublishedArticles(q) : [];

  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <h1 className="font-display text-3xl font-black sm:text-4xl">Tìm kiếm</h1>

      <form action="/tim-kiem" role="search" className="mt-6 flex max-w-xl gap-2">
        <input
          type="search"
          name="q"
          defaultValue={q}
          placeholder="Tìm theo tít hoặc tóm tắt bài…"
          aria-label="Từ khoá tìm kiếm"
          maxLength={100}
          className="min-w-0 flex-1 rounded-full border border-border bg-surface px-4 py-2.5 text-sm outline-none focus:border-accent"
        />
        <button
          type="submit"
          className="shrink-0 rounded-full bg-accent px-5 py-2.5 text-sm font-bold text-white transition hover:opacity-90"
        >
          Tìm
        </button>
      </form>

      {q && (
        <p className="mt-6 text-sm text-muted">
          {items.length === 0
            ? `Không tìm thấy bài nào khớp "${q}".`
            : `${items.length} bài khớp "${q}"`}
        </p>
      )}

      {items.length > 0 && (
        <div className="mt-8 grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((a) => (
            // h2 để không nhảy cấp từ <h1>Tìm kiếm</h1> xuống h3.
            <ArticleCard key={a.slug} article={a} headingLevel="h2" />
          ))}
        </div>
      )}
    </div>
  );
}
