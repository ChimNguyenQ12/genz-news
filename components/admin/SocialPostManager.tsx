"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import Modal from "@/components/admin/Modal";
import Pagination from "@/components/admin/Pagination";
import { mediaUrl } from "@/lib/media";

type Status = "scheduled" | "publishing" | "published" | "failed" | "skipped";
type Tab = "all" | "none" | "scheduled" | "published" | "failed" | "skipped";

interface Post {
  status: Status;
  caption: string;
  comment: string;
  topicTag: string | null;
  scheduledAt: string | null;
  remotePostId: string | null;
  permalink: string | null;
  postedAt: string | null;
  lastError: string | null;
}

interface Row {
  id: string;
  slug: string;
  title: string;
  coverImage: string | null;
  publishedAt: string;
  /** Hotness score from the research topic behind the article; null when there is none. */
  score: number | null;
  defaultCaption: string;
  defaultComment: string;
  defaultTopicTag: string | null;
  topicSuggestions: string[];
  post: Post | null;
}

interface ListResponse {
  platform: string;
  label: string;
  accountName: string;
  maxCaption: number | null;
  canEditPublished: boolean;
  autoPick: boolean;
  supportsTopicTag: boolean;
  autoNext: { slot: string | null; article: { id: string; title: string; score: number } | null } | null;
  configured: boolean;
  goldenHours: string[];
  perDay: number;
  nextSlot: string | null;
  latestDate: string;
  total: number;
  page: number;
  perPage: number;
  counts: Record<Tab, number>;
  articles: Row[];
}

interface Query {
  tab: Tab;
  page: number;
  /** Searches titles across ALL dates; while set, the date filter is ignored. */
  q: string;
  /** "" = all dates. */
  date: string;
  sort: "date" | "score";
}

interface Confirm {
  title: string;
  body: React.ReactNode;
  confirmLabel: string;
  danger?: boolean;
  onConfirm: () => void;
}

interface Toast {
  text: string;
  kind: "ok" | "error";
}

const fieldClass =
  "rounded-lg border border-border bg-background px-2.5 py-1.5 text-sm outline-none focus:border-accent";

const TABS: { key: Tab; label: string; autoPickOnly?: boolean }[] = [
  { key: "all", label: "All" },
  { key: "none", label: "Not posted" },
  { key: "scheduled", label: "Scheduled" },
  { key: "published", label: "Posted" },
  { key: "failed", label: "Errors" },
  { key: "skipped", label: "Skipped", autoPickOnly: true },
];

const vnTime = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleString("en-GB", {
        timeZone: "Asia/Ho_Chi_Minh",
        hour: "2-digit",
        minute: "2-digit",
        day: "2-digit",
        month: "short",
      })
    : "";

/** ISO → value for <input type="datetime-local"> in the viewer's own timezone. */
const toLocalInput = (iso: string | null) => {
  if (!iso) return "";
  const d = new Date(iso);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
};

const statusOf = (r: Row): "none" | Status => r.post?.status ?? "none";

/** Its time has come but it isn't out yet: queued, waiting for the background run. */
const isDue = (r: Row) =>
  r.post?.status === "scheduled" && !!r.post.scheduledAt && new Date(r.post.scheduledAt).getTime() <= Date.now();

/** Selectable for bulk actions: not live yet and not mid-publish. */
const selectable = (r: Row) => {
  const s = statusOf(r);
  return s === "none" || s === "scheduled" || s === "failed" || s === "skipped";
};

const BADGE: Record<"none" | Status, { label: string; cls: string }> = {
  none: { label: "Not posted", cls: "bg-surface-2 text-muted" },
  scheduled: { label: "Scheduled", cls: "bg-blue-500/15 text-blue-600 dark:text-blue-400" },
  publishing: { label: "Publishing…", cls: "bg-amber-500/15 text-amber-600 dark:text-amber-400" },
  published: { label: "Posted", cls: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400" },
  failed: { label: "Error", cls: "bg-red-500/15 text-red-600 dark:text-red-400" },
  skipped: { label: "Skipped", cls: "bg-zinc-500/15 text-zinc-500" },
};

const fire = (score: number | null) => (score === null ? null : `🔥 ${Math.round(score)}`);

async function api(url: string, init?: RequestInit) {
  const res = await fetch(url, {
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Error ${res.status}`);
  return data;
}

/** Manager for posts on one social platform (Facebook Page, Threads). */
export default function SocialPostManager({ platform }: { platform: "facebook" | "threads" }) {
  const base = `/api/admin/social/${platform}`;
  const [query, setQuery] = useState<Query>({ tab: "all", page: 1, q: "", date: "", sort: "date" });
  const [data, setData] = useState<ListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [busy, setBusy] = useState<string | null>(null);
  const [toast, setToast] = useState<Toast | null>(null);
  const [confirmBox, setConfirmBox] = useState<Confirm | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const [editing, setEditing] = useState<Row | null>(null);
  const [caption, setCaption] = useState("");
  const [comment, setComment] = useState("");
  const [when, setWhen] = useState("");
  const [topicTag, setTopicTag] = useState("");
  const [drafting, setDrafting] = useState(false);
  // Bumped whenever the editor opens or closes; a running "GenZ rewrite" poll
  // that sees a different number stops, so it never overwrites another post.
  const editorSession = useRef(0);
  const requestSeq = useRef(0);

  // Load via promise (no synchronous setState in the effect). Debounce while typing.
  useEffect(() => {
    const seq = ++requestSeq.current;
    const params = new URLSearchParams({
      tab: query.tab,
      page: String(query.page),
      date: query.date,
      sort: query.sort,
    });
    if (query.q.trim()) params.set("q", query.q.trim());
    const timer = setTimeout(
      () =>
        api(`${base}?${params}`)
          .then((d: ListResponse) => {
            if (seq !== requestSeq.current) return;
            setData(d);
            setError(null);
          })
          .catch((err: Error) => seq === requestSeq.current && setError(err.message))
          .finally(() => seq === requestSeq.current && setLoading(false)),
      query.q ? 300 : 0,
    );
    return () => clearTimeout(timer);
  }, [base, query, reloadKey]);

  const reload = useCallback(() => setReloadKey((k) => k + 1), []);
  const update = (patch: Partial<Query>) => {
    setLoading(true);
    setSelected(new Set());
    setQuery((current) => ({ ...current, page: 1, ...patch }));
  };

  // While something is queued or mid-publish, refresh quietly so it flips to
  // "Posted" without a manual reload.
  const pending = (data?.articles ?? []).some((r) => statusOf(r) === "publishing" || isDue(r));
  useEffect(() => {
    if (!pending) return;
    const t = setTimeout(reload, 4000);
    return () => clearTimeout(t);
  }, [pending, reloadKey, reload]);

  const notify = (text: string, kind: Toast["kind"] = "ok") => {
    setToast({ text, kind });
    setTimeout(() => setToast(null), kind === "error" ? 7000 : 4000);
  };

  const run = async (key: string, fn: () => Promise<{ message?: string }>) => {
    setBusy(key);
    try {
      const out = await fn();
      if (out?.message) notify(out.message);
      reload();
      return true;
    } catch (err) {
      notify((err as Error).message, "error");
      return false;
    } finally {
      setBusy(null);
    }
  };

  const label = data?.label ?? (platform === "threads" ? "Threads" : "Facebook Page");
  const rows = data?.articles ?? [];
  const pageSelectable = rows.filter(selectable);
  const allSelected = pageSelectable.length > 0 && pageSelectable.every((r) => selected.has(r.id));
  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.perPage)) : 1;

  const max = data?.maxCaption ?? null;
  const tooLong = max !== null && caption.length > max;
  const badTag = !!data?.supportsTopicTag && /[.&]/.test(topicTag);

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const closeEditor = () => {
    editorSession.current++;
    setDrafting(false);
    setEditing(null);
  };

  /** Asks Claude on the server for a 2–3 sentence GenZ-style post; usually 20–60 s. */
  const generateDraft = async (r: Row) => {
    const session = editorSession.current;
    setDrafting(true);
    try {
      const { id } = await api(`${base}/draft`, { method: "POST", body: JSON.stringify({ articleId: r.id }) });
      for (let i = 0; i < 110; i++) {
        await new Promise((ok) => setTimeout(ok, 3000));
        if (editorSession.current !== session) return;
        const d = await api(`${base}/draft/${id}`);
        if (editorSession.current !== session) return;
        if (d.status === "done") {
          setCaption(d.text);
          notify("Draft ready — review it, then schedule");
          return;
        }
        if (d.status === "error") throw new Error(d.error);
      }
      throw new Error("Timed out waiting for the draft; try again");
    } catch (err) {
      if (editorSession.current === session) notify((err as Error).message, "error");
    } finally {
      if (editorSession.current === session) setDrafting(false);
    }
  };

  const openEditor = (r: Row, opts: { draft?: boolean } = {}) => {
    editorSession.current++;
    setDrafting(false);
    setEditing(r);
    setCaption(r.post?.caption ?? r.defaultCaption);
    setComment(r.post?.comment ?? r.defaultComment);
    setTopicTag(r.post ? (r.post.topicTag ?? "") : (r.defaultTopicTag ?? ""));
    setWhen(toLocalInput(r.post?.scheduledAt ?? data?.nextSlot ?? null));
    if (opts.draft) void generateDraft(r);
  };

  const scheduleToday = () =>
    run("today", () =>
      api(`${base}/schedule-today`, { method: "POST", body: JSON.stringify({ perDay: data?.perDay }) }),
    );

  const publishNow = (r: Row, text?: { caption: string; comment: string; topicTag?: string }) =>
    setConfirmBox({
      title: `Post to ${label} now?`,
      body: (
        <>
          <p className="font-semibold">{r.title}</p>
          <p className="mt-2 text-muted">It goes into the queue and goes live in a moment, without waiting for a golden hour.</p>
        </>
      ),
      confirmLabel: "Post now",
      onConfirm: () =>
        void run(r.id, () =>
          api(`${base}/post`, {
            method: "POST",
            body: JSON.stringify({ articleId: r.id, mode: "now", ...text }),
          }),
        ).then((ok) => ok && closeEditor()),
    });

  const bulk = (action: "now" | "golden" | "cancel" | "skip") => {
    const ids = [...selected];
    const actionLabel = { now: "Post now", golden: "Schedule in golden hours", cancel: "Unschedule", skip: "Skip" }[action];
    const explain = {
      now: `They go into the queue and go live on ${label} one after another — no need to stay on this page. Posting many at once usually means only the first few get reach.`,
      golden: `Each goes into the next free golden hour (max ${data?.perDay ?? 6} per day).`,
      cancel: "Unschedules the ones not posted yet (skipped ones go back to the auto-pick pool). Posted ones stay.",
      skip: "These won't be auto-picked for golden hours. You can still post them manually any time.",
    }[action];
    setConfirmBox({
      title: `${actionLabel}: ${ids.length} article${ids.length === 1 ? "" : "s"}?`,
      body: <p className="text-muted">{explain}</p>,
      confirmLabel: actionLabel,
      danger: action === "cancel",
      onConfirm: () =>
        void run("bulk", () =>
          api(`${base}/bulk`, { method: "POST", body: JSON.stringify({ articleIds: ids, action }) }),
        ).then((ok) => ok && setSelected(new Set())),
    });
  };

  const saveEditor = async () => {
    if (!editing) return;
    const s = statusOf(editing);
    const scheduledAt = when ? new Date(when).toISOString() : undefined;
    const ok =
      s === "none"
        ? await run(editing.id, () =>
            api(`${base}/post`, {
              method: "POST",
              body: JSON.stringify({
                articleId: editing.id,
                caption,
                comment,
                mode: "schedule",
                scheduledAt,
                ...(data?.supportsTopicTag ? { topicTag } : {}),
              }),
            }),
          )
        : await run(editing.id, () =>
            api(`${base}/${editing.id}`, {
              method: "PATCH",
              body: JSON.stringify({
                caption,
                comment,
                scheduledAt: s === "published" ? undefined : scheduledAt,
                ...(data?.supportsTopicTag && s !== "published" ? { topicTag } : {}),
              }),
            }),
          );
    if (ok) closeEditor();
  };

  const remove = (r: Row) => {
    const s = statusOf(r);
    setConfirmBox({
      title: s === "published" ? `Remove from ${label}?` : s === "skipped" ? "Put back into auto-pick?" : "Unschedule?",
      body: (
        <>
          <p className="font-semibold">{r.title}</p>
          {s === "published" && (
            <p className="mt-2 text-red-600 dark:text-red-400">
              The post is deleted from {label}, with all its likes and comments. This can’t be undone.
            </p>
          )}
        </>
      ),
      confirmLabel: s === "published" ? `Remove from ${label}` : s === "skipped" ? "Unskip" : "Unschedule",
      danger: s !== "skipped",
      onConfirm: () => void run(r.id, () => api(`${base}/${r.id}`, { method: "DELETE" })),
    });
  };

  const editingStatus = editing ? statusOf(editing) : "none";
  const btn = "whitespace-nowrap rounded-xl px-4 py-2 text-sm font-semibold transition";

  return (
    <div className="space-y-5 pb-12">
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

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0 max-w-2xl">
          <h1 className="font-display text-2xl font-black">{label}</h1>
          <p className="mt-1 text-sm text-muted">
            {data?.autoPick
              ? `At each free golden hour the hottest article from the last 2 days goes up automatically (max ${data.perDay}/day). Schedule, post${data.canEditPublished ? ", edit" : ""} or remove manually any time.`
              : `Only posts you schedule or post yourself go out${data?.accountName ? ` on ${data.accountName}` : ""}.`}
          </p>
        </div>
        <div className="flex w-full gap-2 sm:w-auto">
          <button onClick={reload} className={`${btn} flex-1 border border-border hover:border-accent hover:text-accent sm:flex-none`}>
            Refresh
          </button>
          <button
            onClick={scheduleToday}
            disabled={busy === "today" || !data?.configured}
            className={`${btn} flex-1 bg-accent font-bold text-white hover:opacity-90 disabled:opacity-50 sm:flex-none`}
          >
            {busy === "today" ? "Scheduling…" : "Fill today’s free slots"}
          </button>
        </div>
      </div>

      {data && !data.configured && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-600 dark:text-red-400">
          No {label} token on the server. Add it to the GitLab CI/CD variables and redeploy; posting and scheduling are
          disabled until then.
        </div>
      )}

      {data && (
        <div className="grid grid-cols-1 gap-3 rounded-2xl border border-border bg-surface p-4 text-sm sm:grid-cols-3">
          <div>
            <div className="text-xs font-bold text-accent">Golden hours (Vietnam time)</div>
            <div className="mt-1 font-extrabold">{data.goldenHours.join(" · ")}</div>
            <div className="text-xs text-muted">Max {data.perDay} posts/day, one per slot</div>
          </div>
          <div>
            <div className="text-xs font-bold text-emerald-600">Link in the first comment</div>
            <div className="mt-1 text-xs text-muted">
              No outbound link in the post itself (it cuts reach); the article link goes in the first comment.
              {max ? ` Max ${max} characters per post.` : ""}
            </div>
          </div>
          {data.autoPick ? (
            <div>
              <div className="text-xs font-bold text-blue-600">
                Auto-pick at {data.autoNext?.slot ? vnTime(data.autoNext.slot) : "—"}
              </div>
              {data.autoNext?.article ? (
                <div className="mt-1 text-xs">
                  <span className="font-bold">{fire(data.autoNext.article.score)}</span>{" "}
                  <span className="line-clamp-2">{data.autoNext.article.title}</span>
                </div>
              ) : (
                <div className="mt-1 text-xs text-muted">
                  {data.autoNext?.slot ? "Nothing to pick yet" : "Today is full / no golden hours left"}
                </div>
              )}
            </div>
          ) : (
            <div>
              <div className="text-xs font-bold text-blue-600">Next free golden hour</div>
              <div className="mt-1 font-extrabold">{data.nextSlot ? vnTime(data.nextSlot) : "—"}</div>
            </div>
          )}
        </div>
      )}

      <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
        <div className="no-scrollbar flex w-full gap-1 overflow-x-auto rounded-xl border border-border bg-surface p-1 lg:w-auto">
          {TABS.filter((t) => !t.autoPickOnly || data?.autoPick).map((t) => (
            <button
              key={t.key}
              onClick={() => update({ tab: t.key })}
              className={`shrink-0 rounded-lg px-3 py-1.5 text-sm font-semibold transition ${
                query.tab === t.key ? "bg-accent text-white" : "text-foreground/70 hover:bg-surface-2"
              }`}
            >
              {t.label} ({data?.counts[t.key] ?? 0})
            </button>
          ))}
        </div>

        <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center">
          <input
            value={query.q}
            onChange={(e) => update({ q: e.target.value })}
            placeholder="Search titles (all dates)…"
            className={`${fieldClass} col-span-2 min-w-0 sm:w-56`}
          />
          <input
            type="date"
            value={query.date}
            disabled={!!query.q.trim()}
            max={data?.latestDate || undefined}
            onChange={(e) => update({ date: e.target.value })}
            className={`${fieldClass} min-w-0 disabled:opacity-40`}
            title={query.q.trim() ? "Search covers all dates" : undefined}
          />
          {query.date ? (
            <button
              onClick={() => update({ date: "" })}
              className="rounded-lg border border-border px-3 py-2 text-xs font-semibold hover:border-accent hover:text-accent sm:py-1.5"
            >
              All dates
            </button>
          ) : (
            <button
              onClick={() => update({ date: data?.latestDate ?? "" })}
              disabled={!!query.q.trim()}
              className="rounded-lg border border-border px-3 py-2 text-xs font-semibold hover:border-accent hover:text-accent disabled:opacity-40 sm:py-1.5"
            >
              Latest day
            </button>
          )}
          <button
            onClick={() => update({ sort: query.sort === "score" ? "date" : "score" })}
            className={`col-span-2 rounded-lg px-3 py-2 text-xs font-semibold sm:col-span-1 sm:py-1.5 ${
              query.sort === "score" ? "bg-orange-500 text-white" : "border border-border hover:border-accent hover:text-accent"
            }`}
          >
            🔥 {query.sort === "score" ? "Sorted by hotness" : "Sort by hotness"}
          </button>
        </div>

        <span className="text-xs text-muted lg:ml-auto">{loading ? "Loading…" : `${data?.total ?? 0} articles`}</span>
      </div>

      {data?.configured && (
        <div className="sticky top-2 z-30 flex flex-wrap items-center gap-2 rounded-xl border border-border bg-background/95 px-3 py-2 text-sm shadow-sm backdrop-blur">
          <label className="flex items-center gap-2 font-semibold">
            <input
              type="checkbox"
              className="size-4"
              disabled={!pageSelectable.length}
              checked={allSelected}
              onChange={(e) =>
                setSelected((prev) => {
                  const next = new Set(prev);
                  for (const r of pageSelectable) {
                    if (e.target.checked) next.add(r.id);
                    else next.delete(r.id);
                  }
                  return next;
                })
              }
            />
            {selected.size ? `${selected.size} selected` : "Select page"}
          </label>
          {selected.size > 0 && (
            <div className="ml-auto flex flex-wrap gap-2">
              <button
                onClick={() => setSelected(new Set())}
                className="rounded-lg px-3 py-1.5 text-xs font-semibold text-muted hover:bg-surface-2"
              >
                Clear
              </button>
              <button
                onClick={() => bulk("cancel")}
                disabled={busy === "bulk"}
                className="rounded-lg border border-red-500/40 px-3 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-500/10 disabled:opacity-50"
              >
                Unschedule
              </button>
              {data.autoPick && (
                <button
                  onClick={() => bulk("skip")}
                  disabled={busy === "bulk"}
                  className="rounded-lg border border-border px-3 py-1.5 text-xs font-semibold hover:bg-surface-2 disabled:opacity-50"
                >
                  Skip
                </button>
              )}
              <button
                onClick={() => bulk("golden")}
                disabled={busy === "bulk"}
                className="rounded-lg border border-border px-3 py-1.5 text-xs font-bold hover:bg-surface-2 disabled:opacity-50"
              >
                Schedule in golden hours
              </button>
              <button
                onClick={() => bulk("now")}
                disabled={busy === "bulk"}
                className="rounded-lg bg-accent px-3 py-1.5 text-xs font-bold text-white hover:opacity-90 disabled:opacity-50"
              >
                {busy === "bulk" ? "Working…" : `Post now (${selected.size})`}
              </button>
            </div>
          )}
        </div>
      )}

      {error && <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-500">{error}</div>}

      <Pagination page={data?.page ?? 1} totalPages={totalPages} onChange={(page) => setQuery((c) => ({ ...c, page }))} className="" />

      {!data && !error && <div className="py-12 text-center text-sm text-muted">Loading…</div>}
      {data && rows.length === 0 && (
        <p className="rounded-2xl border border-border bg-surface p-8 text-center text-sm text-muted">
          {query.q.trim()
            ? "No titles match that search."
            : query.date
              ? "No articles on this date. Try another day, or “All dates”."
              : "Nothing in this tab."}
        </p>
      )}

      <div className={`space-y-3 transition-opacity ${loading ? "opacity-50" : ""}`}>
        {rows.map((r) => {
          const s = statusOf(r);
          const p = r.post;
          const due = isDue(r);
          const badge = due ? { label: "Queued…", cls: BADGE.publishing.cls } : BADGE[s];
          const canEdit = s !== "publishing" && !due && (s !== "published" || data?.canEditPublished);
          return (
            <div
              key={r.id}
              className={`flex flex-col gap-3 rounded-2xl border bg-surface p-4 md:flex-row md:items-center md:justify-between ${
                selected.has(r.id) ? "border-accent" : "border-border"
              }`}
            >
              <div className="flex min-w-0 items-start gap-3.5">
                <input
                  type="checkbox"
                  aria-label={`Select: ${r.title}`}
                  className="mt-6 size-4 shrink-0 disabled:opacity-30"
                  disabled={!selectable(r) || !data?.configured}
                  checked={selected.has(r.id)}
                  onChange={() => toggle(r.id)}
                />
                {r.coverImage ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={mediaUrl(r.coverImage)} alt="" loading="lazy" className="size-16 shrink-0 rounded-xl object-cover" />
                ) : (
                  <div className="size-16 shrink-0 rounded-xl bg-surface-2" />
                )}
                <div className="min-w-0 space-y-1">
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <span className={`rounded-md px-2 py-0.5 font-bold ${badge.cls}`}>{badge.label}</span>
                    {fire(r.score) && <span className="font-bold text-orange-600">{fire(r.score)}</span>}
                    {p?.topicTag && (
                      <span className="rounded-md bg-fuchsia-500/10 px-1.5 py-0.5 font-semibold text-fuchsia-600 dark:text-fuchsia-400">
                        # {p.topicTag}
                      </span>
                    )}
                    {s === "scheduled" && !due && p?.scheduledAt && (
                      <span className="font-semibold text-blue-600 dark:text-blue-400">{vnTime(p.scheduledAt)}</span>
                    )}
                    {s === "published" && p?.postedAt && <span className="text-muted">{vnTime(p.postedAt)}</span>}
                    <span className="text-muted">Site: {r.publishedAt}</span>
                  </div>
                  <h3 className="truncate font-bold">
                    <Link href={`/bai-viet/${r.slug}`} target="_blank" className="hover:underline">
                      {r.title}
                    </Link>
                  </h3>
                  {p?.lastError && <p className="text-xs text-red-500">{p.lastError}</p>}
                </div>
              </div>

              <div className="flex shrink-0 flex-wrap items-center gap-2 self-end md:self-center">
                {s === "published" && p?.permalink && (
                  <a
                    href={p.permalink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="rounded-xl border border-border px-3 py-1.5 text-xs font-semibold hover:border-accent hover:text-accent"
                  >
                    View ↗
                  </a>
                )}
                {platform === "threads" && canEdit && s !== "published" && (
                  <button
                    onClick={() => openEditor(r, { draft: true })}
                    disabled={!data?.configured}
                    className="rounded-xl bg-gradient-to-r from-fuchsia-600 to-orange-500 px-3 py-1.5 text-xs font-bold text-white hover:opacity-90 disabled:opacity-50"
                  >
                    ✨ GenZ rewrite
                  </button>
                )}
                {canEdit && (
                  <button
                    onClick={() => openEditor(r)}
                    disabled={!data?.configured}
                    className="rounded-xl border border-border px-3 py-1.5 text-xs font-bold hover:bg-surface-2 disabled:opacity-50"
                  >
                    {s === "none" || s === "skipped" ? "Compose & schedule" : "Edit"}
                  </button>
                )}
                {(s === "none" || s === "failed" || s === "skipped" || (s === "scheduled" && !due)) && (
                  <button
                    onClick={() => publishNow(r)}
                    disabled={busy === r.id || !data?.configured}
                    className="rounded-xl bg-accent px-3.5 py-1.5 text-xs font-bold text-white hover:opacity-90 disabled:opacity-50"
                  >
                    Post now
                  </button>
                )}
                {s !== "none" && s !== "publishing" && !due && (
                  <button
                    onClick={() => remove(r)}
                    disabled={busy === r.id}
                    className="rounded-xl border border-red-500/40 px-3 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-500/10 disabled:opacity-50"
                  >
                    {s === "published" ? "Remove" : s === "skipped" ? "Unskip" : "Unschedule"}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <Pagination page={data?.page ?? 1} totalPages={totalPages} onChange={(page) => setQuery((c) => ({ ...c, page }))} />

      {editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <div className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-3xl border border-border bg-surface p-6 shadow-2xl">
            <div className="flex items-start justify-between gap-4 border-b border-border pb-4">
              <div className="min-w-0">
                <h2 className="text-xl font-black">
                  {editingStatus === "published" ? `Edit on ${label}` : `Compose for ${label}`}
                </h2>
                <p className="truncate text-xs text-muted">{editing.title}</p>
              </div>
              <button onClick={closeEditor} aria-label="Close" className="rounded-lg p-1.5 text-muted hover:bg-surface-2">
                ✕
              </button>
            </div>

            <div className="mt-5 grid grid-cols-1 gap-6 lg:grid-cols-2">
              <div className="space-y-4">
                <label className="block text-xs font-bold">
                  <span className="flex justify-between">
                    Post text
                    {max && (
                      <span className={tooLong ? "text-red-600" : "font-normal text-muted"}>
                        {caption.length}/{max}
                      </span>
                    )}
                  </span>
                  <textarea
                    rows={9}
                    value={caption}
                    onChange={(e) => setCaption(e.target.value)}
                    className={`mt-1 w-full rounded-xl border bg-surface-2 p-3 text-xs font-normal focus:outline-none ${
                      tooLong ? "border-red-500" : "border-border focus:border-accent"
                    }`}
                  />
                </label>
                <div className="flex flex-wrap items-center gap-3">
                  {platform === "threads" && editingStatus !== "published" && (
                    <button
                      onClick={() => void generateDraft(editing)}
                      disabled={drafting}
                      className="rounded-lg bg-gradient-to-r from-fuchsia-600 to-orange-500 px-3 py-1.5 text-xs font-bold text-white shadow hover:opacity-90 disabled:opacity-60"
                    >
                      {drafting ? "✨ Writing… (20–60 s)" : "✨ GenZ rewrite"}
                    </button>
                  )}
                  <button onClick={() => setCaption(editing.defaultCaption)} className="text-xs text-accent hover:underline">
                    Reset to default text
                  </button>
                </div>
                {data?.supportsTopicTag && editingStatus !== "published" && (
                  <div className="text-xs">
                    <label className="block font-bold">
                      Topic tag
                      <span className="ml-1 font-normal text-muted">(one per post — it lists the post under that topic)</span>
                      <div className="mt-1 flex gap-2">
                        <span className="flex flex-1 items-center rounded-xl border border-border bg-surface-2 focus-within:border-accent">
                          <span className="pl-3 text-muted">#</span>
                          <input
                            value={topicTag}
                            maxLength={50}
                            onChange={(e) => setTopicTag(e.target.value.replace(/^#+/, ""))}
                            placeholder="e.g. Viral"
                            className="min-w-0 flex-1 bg-transparent p-2.5 text-sm font-normal outline-none"
                          />
                        </span>
                        {topicTag && (
                          <button
                            onClick={() => setTopicTag("")}
                            className="rounded-xl border border-border px-3 font-semibold text-muted hover:border-accent hover:text-accent"
                          >
                            No tag
                          </button>
                        )}
                      </div>
                    </label>
                    {/[.&]/.test(topicTag) && (
                      <p className="mt-1 font-semibold text-red-600">Threads doesn’t accept “.” or “&” in topic tags.</p>
                    )}
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {editing.topicSuggestions.map((t) => (
                        <button
                          key={t}
                          onClick={() => setTopicTag(t)}
                          className={`rounded-full border px-2.5 py-1 font-semibold transition ${
                            topicTag.trim().toLowerCase() === t.toLowerCase()
                              ? "border-fuchsia-500 bg-fuchsia-500 text-white"
                              : "border-border hover:border-fuchsia-500 hover:text-fuchsia-600"
                          }`}
                        >
                          # {t}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                <label className="block text-xs font-bold">
                  First comment (article link)
                  <textarea
                    rows={3}
                    value={comment}
                    onChange={(e) => setComment(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-border bg-surface-2 p-3 text-xs font-normal focus:border-accent focus:outline-none"
                  />
                </label>
                {editingStatus !== "published" && (
                  <label className="block text-xs font-bold">
                    Post time
                    <input
                      type="datetime-local"
                      value={when}
                      onChange={(e) => setWhen(e.target.value)}
                      className="mt-1 w-full rounded-xl border border-border bg-surface-2 p-2.5 text-sm font-normal focus:border-accent focus:outline-none"
                    />
                    <span className="mt-1 block font-normal text-muted">
                      Defaults to the next free golden hour. Golden hours: {data?.goldenHours.join(", ")}.
                    </span>
                  </label>
                )}
                {editingStatus === "published" && (
                  <p className="text-xs text-muted">
                    Saving edits the live post and its comment on {label} directly; nothing new is posted.
                  </p>
                )}
              </div>

              <div>
                <div className="text-xs font-bold uppercase tracking-wider text-muted">Preview</div>
                <div className="mt-2 rounded-2xl border border-border bg-white p-4 text-black shadow-md dark:bg-zinc-900 dark:text-zinc-100">
                  <div className="flex items-center gap-2.5">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src="/genz-news-logo.png" alt="" className="size-10 rounded-full border" />
                    <div>
                      <div className="text-sm font-bold">{data?.accountName}</div>
                      <div className="text-[11px] text-zinc-500">
                        {editingStatus === "published" ? vnTime(editing.post?.postedAt ?? null) : "Upcoming"}
                      </div>
                    </div>
                  </div>
                  <div className="mt-3 whitespace-pre-wrap text-xs leading-relaxed">{caption}</div>
                  {data?.supportsTopicTag && topicTag.trim() && (
                    <div className="mt-2 inline-block rounded-full bg-zinc-100 px-2.5 py-1 text-[11px] font-semibold text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
                      # {topicTag.trim()}
                    </div>
                  )}
                  {editing.coverImage && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={mediaUrl(editing.coverImage)} alt="" className="mt-3 max-h-56 w-full rounded-xl object-cover" />
                  )}
                  <div className="mt-3 rounded-xl bg-zinc-100 p-2.5 text-xs dark:bg-zinc-800/60">
                    <span className="font-bold">{data?.accountName}</span> <span className="break-all">{comment}</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-6 flex flex-wrap items-center justify-end gap-3 border-t border-border pt-4">
              {tooLong && <span className="mr-auto text-xs font-semibold text-red-600">Over {max} characters</span>}
              <button
                onClick={closeEditor}
                className="rounded-xl border border-border px-4 py-2 text-xs font-semibold hover:bg-surface-2"
              >
                Cancel
              </button>
              {editingStatus !== "published" && (
                <button
                  onClick={() => publishNow(editing, { caption, comment, ...(data?.supportsTopicTag ? { topicTag } : {}) })}
                  disabled={busy === editing.id || tooLong || badTag || drafting}
                  className="rounded-xl border border-accent px-4 py-2 text-xs font-bold text-accent hover:bg-accent/10 disabled:opacity-50"
                >
                  Post now
                </button>
              )}
              <button
                onClick={saveEditor}
                disabled={busy === editing.id || tooLong || badTag || drafting}
                className="rounded-xl bg-accent px-6 py-2 text-xs font-bold text-white shadow-lg hover:opacity-90 disabled:opacity-50"
              >
                {busy === editing.id ? "Saving…" : editingStatus === "published" ? `Save & update on ${label}` : "Schedule"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Last on purpose: same z-index as the editor, and the later element wins —
          a confirmation opened from inside the editor must sit on top of it. */}
      <Modal open={!!confirmBox} title={confirmBox?.title ?? ""} onClose={() => setConfirmBox(null)}>
        {confirmBox && (
          <div className="space-y-5 text-sm">
            <div>{confirmBox.body}</div>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setConfirmBox(null)}
                className="rounded-xl border border-border px-4 py-2 text-xs font-semibold hover:bg-surface-2"
              >
                Cancel
              </button>
              <button
                autoFocus
                onClick={() => {
                  const action = confirmBox.onConfirm;
                  setConfirmBox(null);
                  action();
                }}
                className={`rounded-xl px-5 py-2 text-xs font-bold text-white shadow ${
                  confirmBox.danger ? "bg-red-600 hover:bg-red-700" : "bg-accent hover:opacity-90"
                }`}
              >
                {confirmBox.confirmLabel}
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
