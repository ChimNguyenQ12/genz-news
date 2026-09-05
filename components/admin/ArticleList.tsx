"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { Article, ArticleStatus } from "@/lib/types";
import type { Role } from "@/lib/users";
import { getCategory } from "@/lib/data";
import { categoryStyles } from "@/lib/categoryStyles";

const STATUS_LABEL: Record<ArticleStatus, string> = {
  draft: "Nháp",
  pending: "Đợi duyệt",
  published: "Đã đăng",
  rejected: "Bị trả lại",
};

const STATUS_STYLE: Record<ArticleStatus, string> = {
  draft: "bg-neutral-500/10 text-neutral-500",
  pending: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  published: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  rejected: "bg-red-500/10 text-red-600 dark:text-red-400",
};

const FILTERS: (ArticleStatus | "all")[] = [
  "all",
  "pending",
  "draft",
  "published",
  "rejected",
];

export default function ArticleList({
  articles,
  role,
}: {
  articles: Article[];
  role: Role;
}) {
  const router = useRouter();
  const isAdmin = role === "admin";
  const [filter, setFilter] = useState<ArticleStatus | "all">(
    isAdmin && articles.some((a) => a.status === "pending") ? "pending" : "all",
  );
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");

  const visible = articles.filter((a) => filter === "all" || a.status === filter);

  async function patch(article: Article, payload: Record<string, unknown>) {
    setBusy(article.id);
    setError("");
    const res = await fetch(`/api/articles/${article.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    setBusy(null);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "Thao tác thất bại");
      return;
    }
    router.refresh();
  }

  async function reject(article: Article) {
    const note = prompt("Lý do trả bài (tác giả sẽ thấy góp ý này):");
    if (note === null) return;
    await patch(article, { status: "rejected", reviewNote: note });
  }

  async function remove(article: Article) {
    if (!confirm(`Xoá vĩnh viễn bài "${article.title}"?`)) return;
    setBusy(article.id);
    setError("");
    const res = await fetch(`/api/articles/${article.id}`, { method: "DELETE" });
    setBusy(null);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "Xoá thất bại");
      return;
    }
    router.refresh();
  }

  async function createNew() {
    setBusy("new");
    setError("");
    const res = await fetch("/api/articles", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Bài viết mới", category: "the-gioi", body: [] }),
    });
    const data = await res.json();
    setBusy(null);
    if (data.article) router.push(`/admin/articles/${data.article.id}`);
    else setError(data.error ?? "Không tạo được bài");
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="no-scrollbar flex gap-1 overflow-x-auto rounded-xl border border-border bg-surface p-1">
          {FILTERS.map((key) => {
            const count =
              key === "all"
                ? articles.length
                : articles.filter((a) => a.status === key).length;
            if (key !== "all" && count === 0 && filter !== key) return null;
            return (
              <button
                key={key}
                onClick={() => setFilter(key)}
                className={`shrink-0 rounded-lg px-3 py-1.5 text-sm font-semibold transition ${
                  filter === key
                    ? "bg-accent text-white"
                    : "text-foreground/70 hover:bg-surface-2"
                }`}
              >
                {key === "all" ? "Tất cả" : STATUS_LABEL[key]} ({count})
              </button>
            );
          })}
        </div>

        <button
          onClick={createNew}
          disabled={busy === "new"}
          className="rounded-xl bg-accent px-4 py-2 text-sm font-bold text-white transition hover:opacity-90 disabled:opacity-50"
        >
          + Viết bài mới
        </button>
      </div>

      {error && (
        <p className="mb-3 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-2 text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      )}

      {visible.length === 0 ? (
        <p className="rounded-2xl border border-border bg-surface p-8 text-center text-sm text-muted">
          Không có bài nào trong mục này.
        </p>
      ) : (
        <div className="space-y-2">
          {visible.map((a) => {
            const category = getCategory(a.category);
            const style = categoryStyles[a.category];
            const isBusy = busy === a.id;
            const canEdit = isAdmin || a.status === "draft" || a.status === "rejected";

            return (
              <div
                key={a.id}
                className="flex flex-wrap items-center gap-3 rounded-2xl border border-border bg-surface p-3"
              >
                {a.coverImage ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={a.coverImage}
                    alt=""
                    className="size-12 shrink-0 rounded-lg object-cover"
                  />
                ) : (
                  <div
                    className="size-12 shrink-0 rounded-lg"
                    style={{
                      background: `linear-gradient(135deg, ${a.coverGradient[0]}, ${a.coverGradient[1]})`,
                    }}
                  />
                )}

                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${style.pill}`}
                    >
                      {category?.name}
                    </span>
                    <span
                      className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${STATUS_STYLE[a.status]}`}
                    >
                      {STATUS_LABEL[a.status]}
                    </span>
                  </div>

                  {canEdit ? (
                    <Link
                      href={`/admin/articles/${a.id}`}
                      className="mt-1 block truncate font-semibold hover:text-accent"
                    >
                      {a.title}
                    </Link>
                  ) : (
                    <p className="mt-1 truncate font-semibold">{a.title}</p>
                  )}

                  <p className="text-xs text-muted">
                    {a.author} · {a.publishedAt} · {a.sources.length} nguồn
                  </p>

                  {a.status === "rejected" && a.reviewNote && (
                    <p className="mt-1.5 rounded-lg bg-red-500/10 p-2 text-xs text-red-600 dark:text-red-400">
                      <strong>Góp ý:</strong> {a.reviewNote}
                    </p>
                  )}
                </div>

                <div className="flex shrink-0 flex-wrap items-center gap-2">
                  {a.status === "published" && (
                    <Link
                      href={`/bai-viet/${a.slug}`}
                      target="_blank"
                      className="rounded-lg border border-border px-3 py-1.5 text-xs font-semibold hover:border-accent hover:text-accent"
                    >
                      Xem ↗
                    </Link>
                  )}

                  {canEdit && (
                    <Link
                      href={`/admin/articles/${a.id}`}
                      className="rounded-lg border border-border px-3 py-1.5 text-xs font-semibold hover:border-accent hover:text-accent"
                    >
                      Sửa
                    </Link>
                  )}

                  {/* --- hành động của tài khoản thường --- */}
                  {!isAdmin && (a.status === "draft" || a.status === "rejected") && (
                    <button
                      onClick={() => patch(a, { status: "pending" })}
                      disabled={isBusy}
                      className="rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-bold text-white transition hover:opacity-90 disabled:opacity-50"
                    >
                      Gửi duyệt
                    </button>
                  )}
                  {!isAdmin && a.status === "pending" && (
                    <button
                      onClick={() => patch(a, { status: "draft" })}
                      disabled={isBusy}
                      className="rounded-lg border border-border px-3 py-1.5 text-xs font-semibold hover:border-accent disabled:opacity-50"
                    >
                      Rút về nháp
                    </button>
                  )}

                  {/* --- hành động của admin --- */}
                  {isAdmin && a.status !== "published" && (
                    <button
                      onClick={() => patch(a, { status: "published" })}
                      disabled={isBusy}
                      className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white transition hover:opacity-90 disabled:opacity-50"
                    >
                      Đăng
                    </button>
                  )}
                  {isAdmin && a.status === "pending" && (
                    <button
                      onClick={() => reject(a)}
                      disabled={isBusy}
                      className="rounded-lg border border-border px-3 py-1.5 text-xs font-semibold text-red-500 hover:border-red-500 disabled:opacity-50"
                    >
                      Trả lại
                    </button>
                  )}
                  {isAdmin && a.status === "published" && (
                    <button
                      onClick={() => patch(a, { status: "draft" })}
                      disabled={isBusy}
                      className="rounded-lg border border-border px-3 py-1.5 text-xs font-semibold hover:border-amber-500 hover:text-amber-500 disabled:opacity-50"
                    >
                      Gỡ xuống
                    </button>
                  )}

                  {(isAdmin || a.status === "draft" || a.status === "rejected") && (
                    <button
                      onClick={() => remove(a)}
                      disabled={isBusy}
                      className="rounded-lg border border-border px-3 py-1.5 text-xs font-semibold text-red-500 hover:border-red-500 disabled:opacity-50"
                    >
                      Xoá
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
