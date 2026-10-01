"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import type { ArticlePage, ArticleSummary } from "@/lib/store";
import type { ArticleStatus } from "@/lib/types";
import type { Role } from "@/lib/users";
import { categories, getCategory } from "@/lib/data";
import { formatDateTime } from "@/lib/utils";
import { categoryStyles } from "@/lib/categoryStyles";
import Pagination from "@/components/admin/Pagination";

const STATUS_LABEL: Record<ArticleStatus, string> = {
  draft: "Draft",
  pending: "In review",
  published: "Published",
  rejected: "Sent back",
};

const STATUS_STYLE: Record<ArticleStatus, string> = {
  draft: "bg-neutral-500/10 text-neutral-500",
  pending: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  published: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  rejected: "bg-red-500/10 text-red-600 dark:text-red-400",
};

/**
 * Mọi tab đều hiện, kể cả khi đang có 0 bài.
 *
 * Bản trước ẩn tab rỗng cho gọn, nhưng như thế thì lúc mục "Đợi duyệt" trống,
 * cái tab cũng biến mất — không phân biệt được "không có bài nào đang chờ" với
 * "màn hình quên mất mục chờ duyệt". Số 0 cũng là một thông tin.
 */
const FILTERS: (ArticleStatus | "all")[] = [
  "all",
  "pending",
  "draft",
  "published",
  "rejected",
];

interface Filters {
  status: ArticleStatus | "all";
  category: string;
  author: string;
  from: string;
  to: string;
  q: string;
  page: number;
}

const EMPTY_FILTERS: Filters = {
  status: "all",
  category: "all",
  author: "all",
  from: "",
  to: "",
  q: "",
  page: 1,
};

const fieldClass =
  "rounded-lg border border-border bg-background px-2.5 py-1.5 text-sm outline-none focus:border-accent";

export default function ArticleList({
  initial,
  role,
  baseRoute,
}: {
  initial: ArticlePage;
  role: Role;
  baseRoute?: string;
}) {
  const router = useRouter();
  const isAdmin = role === "admin";
  const base = baseRoute ?? (isAdmin ? "/admin" : "/dashboard");

  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [data, setData] = useState<ArticlePage>(initial);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");

  // Trang đầu đã được máy chủ dựng sẵn nên lần hiện đầu tiên không gọi API.
  // Chỉ khi đổi bộ lọc mới hỏi lại — và khi đó payload cũng chỉ là một trang
  // bản rút gọn, không phải cả kho bài kèm thân bài như trước.
  const firstRender = useRef(true);
  const requestSeq = useRef(0);

  const load = useCallback(async (next: Filters, opts?: { quiet?: boolean }) => {
    const seq = ++requestSeq.current;
    if (!opts?.quiet) setLoading(true);

    const params = new URLSearchParams({
      status: next.status,
      category: next.category,
      author: next.author,
      page: String(next.page),
    });
    if (next.from) params.set("from", next.from);
    if (next.to) params.set("to", next.to);
    if (next.q.trim()) params.set("q", next.q.trim());

    try {
      const res = await fetch(`/api/articles?${params}`);
      if (!res.ok) throw new Error("load failed");
      const page: ArticlePage = await res.json();
      // Bỏ kết quả về muộn: bấm nhanh qua vài tab thì câu trả lời của tab cũ
      // không được phép ghi đè tab đang xem.
      if (seq !== requestSeq.current) return;
      setData(page);
      setError("");
    } catch {
      if (seq === requestSeq.current) setError("Could not load the article list.");
    } finally {
      if (seq === requestSeq.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    // Gõ trong ô tìm kiếm thì đợi một nhịp, đừng bắn mỗi phím một yêu cầu.
    const timer = setTimeout(() => void load(filters), filters.q ? 300 : 0);
    return () => clearTimeout(timer);
  }, [filters, load]);

  /** Đổi bộ lọc thì về trang 1 — trang 7 của bộ lọc cũ thường trống ở bộ mới. */
  function update(patch: Partial<Filters>) {
    setFilters((f) => ({ ...f, page: 1, ...patch }));
  }

  const reload = useCallback(() => load(filters, { quiet: true }), [filters, load]);

  async function patch(article: ArticleSummary, payload: Record<string, unknown>) {
    setBusy(article.id);
    setError("");
    const res = await fetch(`/api/articles/${article.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    setBusy(null);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "That action failed.");
      return;
    }
    await reload();
    // Trang công khai đọc từ máy chủ, nên vẫn cần bảo Next dựng lại nó.
    router.refresh();
  }

  async function reject(article: ArticleSummary) {
    const note = prompt("Why are you sending it back? The author will see this note:");
    if (note === null) return;
    await patch(article, { status: "rejected", reviewNote: note });
  }

  async function remove(article: ArticleSummary) {
    if (!confirm(`Permanently delete "${article.title}"?`)) return;
    setBusy(article.id);
    setError("");
    const res = await fetch(`/api/articles/${article.id}`, { method: "DELETE" });
    setBusy(null);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "Delete failed.");
      return;
    }
    await reload();
    router.refresh();
  }

  async function createNew() {
    setBusy("new");
    setError("");
    const res = await fetch("/api/articles", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Untitled article", category: "the-gioi", body: [] }),
    });
    const created = await res.json();
    setBusy(null);
    if (created.article) router.push(`${base}/articles/${created.article.id}`);
    else setError(created.error ?? "Could not create the article.");
  }

  const totalPages = Math.max(1, Math.ceil(data.total / data.perPage));
  const firstRow = data.total === 0 ? 0 : (data.page - 1) * data.perPage + 1;
  const lastRow = Math.min(data.page * data.perPage, data.total);
  const narrowed =
    filters.category !== "all" ||
    filters.author !== "all" ||
    Boolean(filters.from || filters.to || filters.q.trim());

  return (
    <div>
      <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="no-scrollbar flex w-full gap-1 overflow-x-auto rounded-xl border border-border bg-surface p-1 sm:w-auto">
          {FILTERS.map((key) => (
            <button
              key={key}
              onClick={() => update({ status: key })}
              className={`shrink-0 rounded-lg px-3 py-1.5 text-sm font-semibold transition ${
                filters.status === key
                  ? "bg-accent text-white"
                  : "text-foreground/70 hover:bg-surface-2"
              }`}
            >
              {key === "all" ? "All" : STATUS_LABEL[key]} ({data.counts[key]})
            </button>
          ))}
        </div>

        <button
          onClick={createNew}
          disabled={busy === "new"}
          className="w-full rounded-xl bg-accent px-4 py-2 text-sm font-bold text-white transition hover:opacity-90 disabled:opacity-50 sm:w-auto"
        >
          + New article
        </button>
      </div>

      {/* Trên điện thoại các ô lọc xếp thành lưới 2 cột thay vì để chúng tự
          xuống dòng lung tung: sáu ô wrap tự do ở bề ngang 390px cho ra một mớ
          so le, ô nào cũng hẹp và khó bấm trúng. */}
      <div className="mb-4 rounded-xl border border-border bg-surface p-2">
        <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center">
          <input
            value={filters.q}
            onChange={(e) => update({ q: e.target.value })}
            placeholder="Search headline or dek..."
            className={`${fieldClass} col-span-2 min-w-0 sm:w-56`}
          />

          <select
            value={filters.category}
            onChange={(e) => update({ category: e.target.value })}
            className={`${fieldClass} min-w-0`}
          >
            <option value="all">All sections</option>
            {categories.map((c) => (
              <option key={c.slug} value={c.slug}>
                {c.name}
              </option>
            ))}
          </select>

          {isAdmin && (
            <select
              value={filters.author}
              onChange={(e) => update({ author: e.target.value })}
              className={`${fieldClass} min-w-0`}
            >
              <option value="all">All authors</option>
              {data.authors.map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </select>
          )}

          <label className="flex min-w-0 items-center gap-1.5 text-xs text-muted">
            <span className="shrink-0">From</span>
            <input
              type="date"
              value={filters.from}
              onChange={(e) => update({ from: e.target.value })}
              className={`${fieldClass} w-full min-w-0 sm:w-auto`}
            />
          </label>
          <label className="flex min-w-0 items-center gap-1.5 text-xs text-muted">
            <span className="shrink-0">to</span>
            <input
              type="date"
              value={filters.to}
              onChange={(e) => update({ to: e.target.value })}
              className={`${fieldClass} w-full min-w-0 sm:w-auto`}
            />
          </label>

          {narrowed && (
            <button
              onClick={() => setFilters({ ...EMPTY_FILTERS, status: filters.status })}
              className="col-span-2 rounded-lg border border-border px-3 py-2 text-xs font-semibold hover:border-accent hover:text-accent sm:col-span-1 sm:py-1.5"
            >
              Clear filters
            </button>
          )}

          <span className="col-span-2 text-xs text-muted sm:col-span-1 sm:ml-auto">
            {loading ? "Loading..." : `${firstRow}–${lastRow} of ${data.total}`}
          </span>
        </div>
      </div>

      {error && (
        <p className="mb-3 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-2 text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      )}

      {/* Phân trang bày ở cả trên lẫn dưới: danh sách 20 bài dài hơn một màn
          hình, nhảy trang mà phải cuộn xuống đáy mới thấy nút thì rất mệt. */}
      <Pagination
        page={data.page}
        totalPages={totalPages}
        onChange={(page) => setFilters((f) => ({ ...f, page }))}
        className="mb-3"
      />

      {data.items.length === 0 ? (
        <p className="rounded-2xl border border-border bg-surface p-8 text-center text-sm text-muted">
          {narrowed
            ? "No articles match these filters. Try removing some."
            : "No articles in this tab yet."}
        </p>
      ) : (
        <div className={`space-y-2 transition-opacity ${loading ? "opacity-50" : ""}`}>
          {data.items.map((a) => {
            const category = getCategory(a.category);
            const style = categoryStyles[a.category];
            const isBusy = busy === a.id;
            const canEdit = isAdmin || a.status === "draft" || a.status === "rejected";

            return (
              <div
                key={a.id}
                className="flex flex-wrap items-start gap-3 rounded-2xl border border-border bg-surface p-3 sm:items-center"
              >
                {a.coverImage ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={a.coverImage}
                    alt=""
                    className="size-11 shrink-0 rounded-lg object-cover sm:size-12"
                  />
                ) : (
                  <div
                    className="size-11 shrink-0 rounded-lg sm:size-12"
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
                    {(a.extraCategories ?? []).map((slug) => (
                      <span
                        key={slug}
                        title="Extra section"
                        className={`rounded-full border border-current/20 px-2 py-0.5 text-[11px] font-semibold opacity-80 ${categoryStyles[slug]?.text ?? ""}`}
                      >
                        + {getCategory(slug)?.name ?? slug}
                      </span>
                    ))}
                    <span
                      className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${STATUS_STYLE[a.status]}`}
                    >
                      {STATUS_LABEL[a.status]}
                    </span>
                  </div>

                  {canEdit ? (
                    <Link
                      href={`${base}/articles/${a.id}`}
                      className="mt-1 block truncate font-semibold hover:text-accent"
                    >
                      {a.title}
                    </Link>
                  ) : (
                    <p className="mt-1 truncate font-semibold">{a.title}</p>
                  )}

                  <p className="text-xs text-muted">
                    {a.author} · {formatDateTime(a.publishedAt)} · {a.sourceCount} sources
                  </p>

                  {a.status === "rejected" && a.reviewNote && (
                    <p className="mt-1.5 rounded-lg bg-red-500/10 p-2 text-xs text-red-600 dark:text-red-400">
                      <strong>Editor:</strong> {a.reviewNote}
                    </p>
                  )}
                </div>

                <div className="flex w-full shrink-0 flex-wrap items-center gap-2 [&>*]:min-w-[calc(50%-0.25rem)] [&>*]:flex-1 [&>*]:text-center sm:w-auto sm:[&>*]:min-w-0 sm:[&>*]:flex-none">
                  {/* Bài chưa đăng không có ở /bai-viet (trang công khai được cache,
                      không đọc phiên đăng nhập) — xem trước ở /xem-truoc. */}
                  <Link
                    href={a.status === "published" ? `/bai-viet/${a.slug}` : `/xem-truoc/${a.id}`}
                    target="_blank"
                    className="rounded-lg border border-border px-3 py-1.5 text-xs font-semibold hover:border-accent hover:text-accent"
                  >
                    {a.status === "published" ? "View ↗" : "Preview ↗"}
                  </Link>

                  {canEdit && (
                    <Link
                      href={`${base}/articles/${a.id}`}
                      className="rounded-lg border border-border px-3 py-1.5 text-xs font-semibold hover:border-accent hover:text-accent"
                    >
                      Edit
                    </Link>
                  )}

                  {/* --- hành động của tài khoản thường --- */}
                  {!isAdmin && (a.status === "draft" || a.status === "rejected") && (
                    <button
                      onClick={() => patch(a, { status: "pending" })}
                      disabled={isBusy}
                      className="rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-bold text-white transition hover:opacity-90 disabled:opacity-50"
                    >
                      Submit
                    </button>
                  )}
                  {!isAdmin && a.status === "pending" && (
                    <button
                      onClick={() => patch(a, { status: "draft" })}
                      disabled={isBusy}
                      className="rounded-lg border border-border px-3 py-1.5 text-xs font-semibold hover:border-accent disabled:opacity-50"
                    >
                      Back to draft
                    </button>
                  )}

                  {/* --- hành động của admin --- */}
                  {isAdmin && a.status !== "published" && (
                    <button
                      onClick={() => patch(a, { status: "published" })}
                      disabled={isBusy}
                      className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white transition hover:opacity-90 disabled:opacity-50"
                    >
                      Publish
                    </button>
                  )}
                  {isAdmin && a.status === "pending" && (
                    <button
                      onClick={() => reject(a)}
                      disabled={isBusy}
                      className="rounded-lg border border-border px-3 py-1.5 text-xs font-semibold text-red-500 hover:border-red-500 disabled:opacity-50"
                    >
                      Send back
                    </button>
                  )}
                  {isAdmin && a.status === "published" && (
                    <button
                      onClick={() => patch(a, { status: "draft" })}
                      disabled={isBusy}
                      className="rounded-lg border border-border px-3 py-1.5 text-xs font-semibold hover:border-amber-500 hover:text-amber-500 disabled:opacity-50"
                    >
                      Unpublish
                    </button>
                  )}

                  {(isAdmin || a.status === "draft" || a.status === "rejected") && (
                    <button
                      onClick={() => remove(a)}
                      disabled={isBusy}
                      className="rounded-lg border border-border px-3 py-1.5 text-xs font-semibold text-red-500 hover:border-red-500 disabled:opacity-50"
                    >
                      Delete
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <Pagination
        page={data.page}
        totalPages={totalPages}
        onChange={(page) => setFilters((f) => ({ ...f, page }))}
      />
    </div>
  );
}
