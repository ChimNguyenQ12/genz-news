"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { getCategory } from "@/lib/data";
import { categoryStyles } from "@/lib/categoryStyles";
import { mediaUrl } from "@/lib/media";
import { HERO_SLOTS, TRENDING_SLOTS } from "@/lib/placement";
import type { ArticleStatus } from "@/lib/types";

interface SlotArticle {
  id: string;
  slug: string;
  title: string;
  category: string;
  coverImage?: string;
  status: ArticleStatus;
}

interface SearchResult extends SlotArticle {
  publishedAt: string;
}

type ListKey = "hero" | "trending";

const LIST_META: Record<ListKey, { title: string; blurb: string; max: number; addLabel: string }> = {
  hero: {
    title: "Hero slideshow",
    blurb: "The big rotating banner at the top of the home page.",
    max: HERO_SLOTS,
    addLabel: "+ Hero",
  },
  trending: {
    title: "Trending",
    blurb: 'The "Đang nóng" list next to the latest articles.',
    max: TRENDING_SLOTS,
    addLabel: "+ Trending",
  },
};

const STATUS_STYLE: Record<ArticleStatus, string> = {
  draft: "bg-neutral-500/10 text-neutral-500",
  pending: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  published: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  rejected: "bg-red-500/10 text-red-600 dark:text-red-400",
};

async function api(url: string, init?: RequestInit) {
  const res = await fetch(url, { ...init, headers: { "Content-Type": "application/json", ...init?.headers } });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Error ${res.status}`);
  return data;
}

function move<T>(arr: T[], from: number, to: number): T[] {
  const next = [...arr];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

/**
 * Quản lý bố cục trang chủ: danh sách hero (slideshow) và "Đang nóng".
 *
 * Thay hẳn ô chọn vị trí từng bài trong trình sửa bài (đổi chỗ theo CẶP, hay
 * gặp lỗi "muốn đưa bài lên #2 phải tự nhớ ai đang giữ #2"). Ở đây làm việc
 * trên CẢ DANH SÁCH: tìm bài → thêm vào cuối → kéo thả (hoặc nút ▲▼) để xếp
 * lại vị trí — chèn một bài vào giữa tự đẩy các bài sau dịch xuống, không cần
 * biết trước ai đang giữ chỗ nào. Đổi cục bộ trước, bấm Save mới ghi thật.
 */
export default function HomepageManager() {
  const [hero, setHero] = useState<SlotArticle[] | null>(null);
  const [trending, setTrending] = useState<SlotArticle[] | null>(null);
  const [savedSnapshot, setSavedSnapshot] = useState("");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ text: string; kind: "ok" | "error" } | null>(null);

  const [q, setQ] = useState("");
  const [results, setResults] = useState<SearchResult[] | null>(null);
  const [searching, setSearching] = useState(false);
  const seq = useRef(0);

  const dragFrom = useRef<{ list: ListKey; index: number } | null>(null);

  const load = () =>
    api("/api/admin/homepage")
      .then((d: { hero: SlotArticle[]; trending: SlotArticle[] }) => {
        setHero(d.hero);
        setTrending(d.trending);
        setSavedSnapshot(JSON.stringify(d));
        setLoadError(null);
      })
      .catch((err: Error) => setLoadError(err.message));

  useEffect(() => {
    void load();
  }, []);

  useEffect(() => {
    if (!q.trim()) return;
    const mine = ++seq.current;
    const t = setTimeout(() => {
      setSearching(true);
      const params = new URLSearchParams({ status: "published", q: q.trim(), perPage: "8" });
      api(`/api/articles?${params}`)
        .then((d: { items: SearchResult[] }) => {
          if (mine === seq.current) setResults(d.items);
        })
        .catch(() => {
          if (mine === seq.current) setResults([]);
        })
        .finally(() => {
          if (mine === seq.current) setSearching(false);
        });
    }, 300);
    return () => clearTimeout(t);
  }, [q]);

  const notify = (text: string, kind: "ok" | "error" = "ok") => {
    setToast({ text, kind });
    setTimeout(() => setToast(null), kind === "error" ? 6000 : 3500);
  };

  const isDirty = hero && trending && JSON.stringify({ hero, trending }) !== savedSnapshot;

  useEffect(() => {
    if (!isDirty) return;
    const handler = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [isDirty]);

  const listFor = (key: ListKey) => (key === "hero" ? hero : trending);
  const setListFor = (key: ListKey) => (key === "hero" ? setHero : setTrending);

  const addTo = (key: ListKey, article: SearchResult) => {
    const current = listFor(key) ?? [];
    if (current.some((a) => a.id === article.id)) {
      notify(`Already in ${LIST_META[key].title}`, "error");
      return;
    }
    if (current.length >= LIST_META[key].max) {
      notify(`${LIST_META[key].title} is full (max ${LIST_META[key].max}) — remove one first`, "error");
      return;
    }
    const slot: SlotArticle = {
      id: article.id,
      slug: article.slug,
      title: article.title,
      category: article.category,
      coverImage: article.coverImage,
      status: article.status,
    };
    setListFor(key)([...current, slot]);
  };

  const removeFrom = (key: ListKey, id: string) => {
    setListFor(key)((listFor(key) ?? []).filter((a) => a.id !== id));
  };

  const reorder = (key: ListKey, from: number, to: number) => {
    if (from === to) return;
    const current = listFor(key);
    if (!current) return;
    setListFor(key)(move(current, from, to));
  };

  const discard = () => {
    if (!confirm("Discard unsaved changes to the homepage layout?")) return;
    void load();
  };

  const save = async () => {
    if (!hero || !trending) return;
    setSaving(true);
    try {
      const out = await api("/api/admin/homepage", {
        method: "PUT",
        body: JSON.stringify({ hero: hero.map((a) => a.id), trending: trending.map((a) => a.id) }),
      });
      setSavedSnapshot(JSON.stringify({ hero, trending }));
      notify(out.message ?? "Saved");
    } catch (err) {
      notify((err as Error).message, "error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6 pb-24">
      {toast && (
        <div
          role="status"
          className={`fixed right-5 bottom-5 z-[60] flex max-w-sm items-start gap-3 rounded-xl border px-4 py-3 text-sm font-semibold shadow-2xl ${
            toast.kind === "error"
              ? "border-red-500/40 bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300"
              : "border-emerald-500/40 bg-emerald-50 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
          }`}
        >
          <span className="flex-1">{toast.text}</span>
          <button onClick={() => setToast(null)} aria-label="Close" className="opacity-60 hover:opacity-100">
            ×
          </button>
        </div>
      )}

      <div>
        <h1 className="font-display text-2xl font-black">Homepage</h1>
        <p className="mt-1 text-sm text-muted">
          Search for an article, add it to a list, then drag rows (or use ▲▼) to set the order. Nothing changes on the
          site until you hit Save.
        </p>
      </div>

      {loadError && (
        <p className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-500">{loadError}</p>
      )}

      <div className="rounded-2xl border border-border bg-surface p-4">
        <label className="block text-xs font-bold uppercase tracking-wide text-muted">Find an article to add</label>
        <input
          value={q}
          onChange={(e) => {
            const next = e.target.value;
            setQ(next);
            if (!next.trim()) setResults(null);
          }}
          placeholder="Search published articles by title…"
          className="mt-1.5 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent"
        />
        {q.trim() && (
          <div className="mt-3 divide-y divide-border rounded-xl border border-border">
            {searching && <p className="p-3 text-xs text-muted">Searching…</p>}
            {!searching && results?.length === 0 && <p className="p-3 text-xs text-muted">No published articles match.</p>}
            {!searching &&
              results?.map((r) => (
                <div key={r.id} className="flex items-center gap-3 p-2.5">
                  <Thumb article={r} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">{r.title}</p>
                    <p className="text-xs text-muted">{getCategory(r.category)?.name ?? r.category}</p>
                  </div>
                  <div className="flex shrink-0 gap-1.5">
                    <button
                      onClick={() => addTo("hero", r)}
                      className="rounded-lg border border-border px-2.5 py-1 text-xs font-bold hover:border-accent hover:text-accent"
                    >
                      {LIST_META.hero.addLabel}
                    </button>
                    <button
                      onClick={() => addTo("trending", r)}
                      className="rounded-lg border border-border px-2.5 py-1 text-xs font-bold hover:border-accent hover:text-accent"
                    >
                      {LIST_META.trending.addLabel}
                    </button>
                  </div>
                </div>
              ))}
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {(Object.keys(LIST_META) as ListKey[]).map((key) => {
          const items = listFor(key);
          const meta = LIST_META[key];
          return (
            <div key={key} className="rounded-2xl border border-border bg-surface p-4">
              <div className="flex items-baseline justify-between gap-2">
                <h2 className="font-display text-lg font-black">{meta.title}</h2>
                <span className="text-xs font-semibold text-muted">
                  {items?.length ?? 0} / {meta.max}
                </span>
              </div>
              <p className="mt-0.5 text-xs text-muted">{meta.blurb}</p>

              {items === null ? (
                <p className="mt-4 text-sm text-muted">Loading…</p>
              ) : items.length === 0 ? (
                <p className="mt-4 rounded-xl border border-dashed border-border p-6 text-center text-xs text-muted">
                  Empty — search above and add an article.
                </p>
              ) : (
                <ol className="mt-3 space-y-1.5">
                  {items.map((a, i) => (
                    <li
                      key={a.id}
                      draggable
                      onDragStart={() => {
                        dragFrom.current = { list: key, index: i };
                      }}
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={(e) => {
                        e.preventDefault();
                        const from = dragFrom.current;
                        dragFrom.current = null;
                        if (!from || from.list !== key) return;
                        reorder(key, from.index, i);
                      }}
                      className="flex cursor-grab items-center gap-2.5 rounded-xl border border-border bg-background p-2 active:cursor-grabbing"
                    >
                      <span
                        aria-hidden
                        className="shrink-0 px-0.5 text-muted"
                        title="Drag to reorder"
                      >
                        ⠿
                      </span>
                      <span className="w-5 shrink-0 text-center font-display text-sm font-black text-muted">
                        {i + 1}
                      </span>
                      <Thumb article={a} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold">
                          <Link
                            href={`/admin/articles/${a.id}`}
                            target="_blank"
                            className="hover:text-accent hover:underline"
                          >
                            {a.title}
                          </Link>
                        </p>
                        <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
                          <span className={`text-xs font-bold ${categoryStyles[a.category as keyof typeof categoryStyles]?.text ?? ""}`}>
                            {getCategory(a.category)?.name ?? a.category}
                          </span>
                          {a.status !== "published" && (
                            <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold uppercase ${STATUS_STYLE[a.status]}`}>
                              {a.status} — won’t show until published
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex shrink-0 flex-col">
                        <button
                          onClick={() => reorder(key, i, Math.max(0, i - 1))}
                          disabled={i === 0}
                          aria-label="Move up"
                          className="rounded px-1 text-muted hover:text-accent disabled:opacity-20"
                        >
                          ▲
                        </button>
                        <button
                          onClick={() => reorder(key, i, Math.min(items.length - 1, i + 1))}
                          disabled={i === items.length - 1}
                          aria-label="Move down"
                          className="rounded px-1 text-muted hover:text-accent disabled:opacity-20"
                        >
                          ▼
                        </button>
                      </div>
                      <button
                        onClick={() => removeFrom(key, a.id)}
                        aria-label={`Remove ${a.title}`}
                        className="shrink-0 rounded-lg border border-red-500/40 px-2 py-1 text-xs font-semibold text-red-600 hover:bg-red-500/10"
                      >
                        ✕
                      </button>
                    </li>
                  ))}
                </ol>
              )}
            </div>
          );
        })}
      </div>

      {isDirty && (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/95 px-4 py-3 backdrop-blur">
          <div className="mx-auto flex max-w-6xl items-center justify-between gap-3">
            <span className="text-sm font-semibold text-amber-600 dark:text-amber-400">Unsaved changes</span>
            <div className="flex gap-2">
              <button
                onClick={discard}
                disabled={saving}
                className="rounded-xl border border-border px-4 py-2 text-sm font-semibold hover:bg-surface-2 disabled:opacity-50"
              >
                Discard
              </button>
              <button
                onClick={save}
                disabled={saving}
                className="rounded-xl bg-accent px-5 py-2 text-sm font-bold text-white hover:opacity-90 disabled:opacity-50"
              >
                {saving ? "Saving…" : "Save changes"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Thumb({ article }: { article: { coverImage?: string; title: string } }) {
  return article.coverImage ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={mediaUrl(article.coverImage)}
      alt=""
      loading="lazy"
      className="size-11 shrink-0 rounded-lg object-cover"
    />
  ) : (
    <div className="size-11 shrink-0 rounded-lg bg-surface-2" />
  );
}
