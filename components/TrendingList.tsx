import Link from "next/link";
import type { Article } from "@/lib/types";
import { getCategory } from "@/lib/data";
import { categoryStyles } from "@/lib/categoryStyles";

export default function TrendingList({ articles }: { articles: Article[] }) {
  return (
    <div className="rounded-3xl border border-border bg-surface p-5">
      <div className="mb-4 flex items-center gap-2">
        <span className="flex size-6 items-center justify-center rounded-full bg-accent-2 text-xs">
          🔥
        </span>
        <h2 className="font-display text-lg font-black">Đang nóng</h2>
      </div>
      <ol className="space-y-4">
        {articles.map((article, i) => {
          const category = getCategory(article.category);
          const style = categoryStyles[article.category];
          return (
            <li key={article.slug}>
              <Link href={`/bai-viet/${article.slug}`} className="group flex gap-3">
                <span className="font-display text-2xl font-black text-border group-hover:text-accent transition-colors">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <div>
                  <span className={`text-xs font-bold ${style.text}`}>{category?.name}</span>
                  <h3 className="text-sm font-semibold leading-snug group-hover:text-accent transition-colors">
                    {article.title}
                  </h3>
                </div>
              </Link>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
