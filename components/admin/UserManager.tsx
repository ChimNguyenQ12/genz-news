"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import Modal from "@/components/admin/Modal";
import Pagination from "@/components/admin/Pagination";

type Role = "admin" | "contributor";
type Filter = "all" | "contributor" | "admin" | "locked";

interface Stats {
  total: number;
  published: number;
  pending: number;
  draft: number;
  rejected: number;
}

interface UserItem {
  id: string;
  username: string;
  displayName: string;
  role: Role;
  disabledAt: string | null;
  createdAt: string;
  articles: Stats;
  lastArticleAt: string | null;
}

interface ListResponse {
  items: UserItem[];
  total: number;
  page: number;
  perPage: number;
  counts: Record<Filter, number>;
}

interface UserArticle {
  id: string;
  slug: string;
  title: string;
  status: "draft" | "pending" | "published" | "rejected";
  category: string;
  publishedAt: string;
  createdAt: string;
  updatedAt: string;
}

interface UserDetail {
  id: string;
  username: string;
  displayName: string;
  role: Role;
  disabledAt: string | null;
  createdAt: string;
  articles: UserArticle[];
}

interface Confirm {
  title: string;
  body: React.ReactNode;
  confirmLabel: string;
  danger?: boolean;
  onConfirm: () => void;
}

const FILTERS: { key: Filter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "contributor", label: "Contributors" },
  { key: "admin", label: "Admins" },
  { key: "locked", label: "Locked" },
];

const STATUS: Record<UserArticle["status"], { label: string; cls: string }> = {
  published: { label: "Published", cls: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400" },
  pending: { label: "Pending review", cls: "bg-amber-500/15 text-amber-600 dark:text-amber-400" },
  draft: { label: "Draft", cls: "bg-surface-2 text-muted" },
  rejected: { label: "Sent back", cls: "bg-red-500/15 text-red-600 dark:text-red-400" },
};

/**
 * Tài khoản bot viết bài tự động (NEWSROOM_USER trong /etc/genz-news/newsroom.env
 * trên host). Khoá nó là lượt viết 06:00/18:00 dừng lặng lẽ — nên gắn nhãn và cảnh báo.
 */
const BOT_USERNAMES = ["newsroom-bot"];
const isBot = (username: string) => BOT_USERNAMES.includes(username);

const fieldClass =
  "rounded-lg border border-border bg-background px-2.5 py-1.5 text-sm outline-none focus:border-accent";

const day = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) : "—";

async function api(url: string, init?: RequestInit) {
  const res = await fetch(url, { ...init, headers: { "Content-Type": "application/json", ...init?.headers } });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Error ${res.status}`);
  return data;
}

export default function UserManager({ currentUserId }: { currentUserId: string }) {
  const [query, setQuery] = useState({ filter: "all" as Filter, q: "", page: 1 });
  const [data, setData] = useState<ListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [detail, setDetail] = useState<UserDetail | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmBox, setConfirmBox] = useState<Confirm | null>(null);
  const [notice, setNotice] = useState<{ text: string; kind: "ok" | "error" } | null>(null);
  const [tempPassword, setTempPassword] = useState<string | null>(null);
  const seq = useRef(0);

  useEffect(() => {
    const mine = ++seq.current;
    const params = new URLSearchParams({ filter: query.filter, page: String(query.page) });
    if (query.q.trim()) params.set("q", query.q.trim());
    const t = setTimeout(
      () =>
        api(`/api/admin/users?${params}`)
          .then((d: ListResponse) => {
            if (mine !== seq.current) return;
            setData(d);
            setError(null);
          })
          .catch((err: Error) => mine === seq.current && setError(err.message))
          .finally(() => mine === seq.current && setLoading(false)),
      query.q ? 300 : 0,
    );
    return () => clearTimeout(t);
  }, [query, reloadKey]);

  // Detail loads whenever a user is opened (and after each action on them).
  useEffect(() => {
    if (!detailId) return;
    let active = true;
    api(`/api/admin/users/${detailId}`)
      .then((d: { user: UserDetail }) => active && setDetail(d.user))
      .catch((err: Error) => active && setNotice({ text: err.message, kind: "error" }));
    return () => {
      active = false;
    };
  }, [detailId, reloadKey]);

  const reload = useCallback(() => setReloadKey((k) => k + 1), []);
  const update = (patch: Partial<typeof query>) => {
    setLoading(true);
    setQuery((c) => ({ ...c, page: 1, ...patch }));
  };

  const act = async (fn: () => Promise<{ message?: string }>) => {
    setBusy(true);
    try {
      const out = await fn();
      if (out.message) setNotice({ text: out.message, kind: "ok" });
      reload();
    } catch (err) {
      setNotice({ text: (err as Error).message, kind: "error" });
    } finally {
      setBusy(false);
    }
  };

  const open = (id: string) => {
    setDetail(null);
    setTempPassword(null);
    setNotice(null);
    setDetailId(id);
  };
  const close = () => {
    setDetailId(null);
    setDetail(null);
    setTempPassword(null);
  };

  const toggleLock = (u: UserDetail) =>
    setConfirmBox({
      title: u.disabledAt ? `Unlock @${u.username}?` : `Lock @${u.username}?`,
      body: u.disabledAt ? (
        <p className="text-muted">They can sign in and write again.</p>
      ) : (
        <>
          <p className="text-muted">
            They are signed out immediately and can’t sign in or submit articles. Their existing articles stay as they are.
          </p>
          {isBot(u.username) && (
            <p className="mt-2 font-semibold text-red-600 dark:text-red-400">
              This is the newsroom bot. Locking it stops the automatic 06:00 / 18:00 article runs until you unlock it.
            </p>
          )}
        </>
      ),
      confirmLabel: u.disabledAt ? "Unlock" : "Lock account",
      danger: !u.disabledAt,
      onConfirm: () =>
        void act(() =>
          api(`/api/admin/users/${u.id}`, {
            method: "PATCH",
            body: JSON.stringify({ action: u.disabledAt ? "unlock" : "lock" }),
          }),
        ),
    });

  const changeRole = (u: UserDetail) => {
    const role: Role = u.role === "admin" ? "contributor" : "admin";
    setConfirmBox({
      title: role === "admin" ? `Make @${u.username} an admin?` : `Make @${u.username} a contributor?`,
      body:
        role === "admin" ? (
          <p className="text-red-600 dark:text-red-400">
            Admins can publish any article, manage Facebook/Threads, the research queue and every account — including
            yours.
          </p>
        ) : (
          <p className="text-muted">They keep their articles but can only submit for review from now on.</p>
        ),
      confirmLabel: role === "admin" ? "Make admin" : "Make contributor",
      danger: role === "admin",
      onConfirm: () =>
        void act(() => api(`/api/admin/users/${u.id}`, { method: "PATCH", body: JSON.stringify({ action: "role", role }) })),
    });
  };

  const resetPassword = (u: UserDetail) =>
    setConfirmBox({
      title: `Reset the password for @${u.username}?`,
      body: (
        <p className="text-muted">
          Their current password stops working. You’ll see a temporary password once — send it to them, and ask them to
          change it under Profile.
        </p>
      ),
      confirmLabel: "Reset password",
      danger: true,
      onConfirm: () =>
        void act(async () => {
          const { password } = await api(`/api/admin/users/${u.id}/reset-password`, { method: "POST" });
          setTempPassword(password);
          return {};
        }),
    });

  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.perPage)) : 1;
  const isSelf = detail?.id === currentUserId;

  return (
    <div className="space-y-5 pb-12">
      <div>
        <h1 className="font-display text-2xl font-black">Users</h1>
        <p className="mt-1 text-sm text-muted">
          Everyone who registered can write and submit articles for review. See who is writing what, and lock accounts
          that misuse it.
        </p>
      </div>

      {notice && !detailId && (
        <p
          className={`rounded-xl border px-4 py-2 text-sm ${
            notice.kind === "error"
              ? "border-red-500/30 bg-red-500/10 text-red-600 dark:text-red-400"
              : "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
          }`}
        >
          {notice.text}
        </p>
      )}

      <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
        <div className="no-scrollbar flex w-full gap-1 overflow-x-auto rounded-xl border border-border bg-surface p-1 lg:w-auto">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              onClick={() => update({ filter: f.key })}
              className={`shrink-0 rounded-lg px-3 py-1.5 text-sm font-semibold transition ${
                query.filter === f.key ? "bg-accent text-white" : "text-foreground/70 hover:bg-surface-2"
              }`}
            >
              {f.label} ({data?.counts[f.key] ?? 0})
            </button>
          ))}
        </div>
        <input
          value={query.q}
          onChange={(e) => update({ q: e.target.value })}
          placeholder="Search username or name…"
          className={`${fieldClass} w-full sm:w-64`}
        />
        <span className="text-xs text-muted lg:ml-auto">{loading ? "Loading…" : `${data?.total ?? 0} users`}</span>
      </div>

      {error && <p className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-500">{error}</p>}

      <div className={`overflow-hidden rounded-2xl border border-border transition-opacity ${loading ? "opacity-50" : ""}`}>
        <div className="hidden grid-cols-[minmax(0,2fr)_110px_minmax(0,2fr)_110px_110px] gap-3 border-b border-border bg-surface-2 px-4 py-2 text-xs font-bold uppercase tracking-wide text-muted md:grid">
          <span>User</span>
          <span>Joined</span>
          <span>Articles</span>
          <span>Last article</span>
          <span />
        </div>
        {data?.items.length === 0 && <p className="p-8 text-center text-sm text-muted">No users match.</p>}
        {data?.items.map((u) => (
          <button
            key={u.id}
            onClick={() => open(u.id)}
            className="grid w-full grid-cols-1 gap-2 border-b border-border bg-surface px-4 py-3 text-left text-sm transition last:border-b-0 hover:bg-surface-2 md:grid-cols-[minmax(0,2fr)_110px_minmax(0,2fr)_110px_110px] md:items-center md:gap-3"
          >
            <span className="flex min-w-0 items-center gap-3">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-accent/15 font-black text-accent">
                {u.displayName.slice(0, 1).toUpperCase()}
              </span>
              <span className="min-w-0">
                <span className="flex flex-wrap items-center gap-1.5">
                  <span className="truncate font-bold">{u.displayName}</span>
                  {isBot(u.username) && (
                    <span className="rounded-md bg-sky-500/15 px-1.5 py-0.5 text-[10px] font-bold uppercase text-sky-600">
                      Bot
                    </span>
                  )}
                  {u.role === "admin" && (
                    <span className="rounded-md bg-accent/15 px-1.5 py-0.5 text-[10px] font-bold uppercase text-accent">
                      Admin
                    </span>
                  )}
                  {u.disabledAt && (
                    <span className="rounded-md bg-red-500/15 px-1.5 py-0.5 text-[10px] font-bold uppercase text-red-600">
                      Locked
                    </span>
                  )}
                </span>
                <span className="block truncate text-xs text-muted">@{u.username}</span>
              </span>
            </span>
            <span className="text-xs text-muted md:text-sm md:text-foreground">
              <span className="md:hidden">Joined </span>
              {day(u.createdAt)}
            </span>
            <span className="flex flex-wrap gap-1.5 text-xs">
              <span className="font-bold">{u.articles.total} total</span>
              {u.articles.published > 0 && <span className={`rounded px-1.5 ${STATUS.published.cls}`}>{u.articles.published} published</span>}
              {u.articles.pending > 0 && <span className={`rounded px-1.5 ${STATUS.pending.cls}`}>{u.articles.pending} pending</span>}
              {u.articles.draft > 0 && <span className={`rounded px-1.5 ${STATUS.draft.cls}`}>{u.articles.draft} drafts</span>}
              {u.articles.rejected > 0 && <span className={`rounded px-1.5 ${STATUS.rejected.cls}`}>{u.articles.rejected} sent back</span>}
            </span>
            <span className="text-xs text-muted">
              <span className="md:hidden">Last article </span>
              {day(u.lastArticleAt)}
            </span>
            <span className="text-xs font-semibold text-accent md:text-right">View →</span>
          </button>
        ))}
      </div>

      <Pagination page={data?.page ?? 1} totalPages={totalPages} onChange={(page) => setQuery((c) => ({ ...c, page }))} />

      <Modal open={!!detailId} title={detail ? `${detail.displayName} (@${detail.username})` : "Loading…"} onClose={close}>
        {!detail ? (
          <p className="py-6 text-center text-sm text-muted">Loading…</p>
        ) : (
          <div className="space-y-5 text-sm">
            {notice && (
              <p
                className={`rounded-lg px-3 py-2 text-xs font-semibold ${
                  notice.kind === "error" ? "bg-red-500/10 text-red-600" : "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
                }`}
              >
                {notice.text}
              </p>
            )}

            <div className="grid grid-cols-2 gap-3 rounded-xl border border-border bg-surface p-3 text-xs sm:grid-cols-4">
              <div>
                <div className="text-muted">Role</div>
                <div className="font-bold capitalize">{detail.role}</div>
              </div>
              <div>
                <div className="text-muted">Status</div>
                <div className={`font-bold ${detail.disabledAt ? "text-red-600" : "text-emerald-600"}`}>
                  {detail.disabledAt ? `Locked ${day(detail.disabledAt)}` : "Active"}
                </div>
              </div>
              <div>
                <div className="text-muted">Joined</div>
                <div className="font-bold">{day(detail.createdAt)}</div>
              </div>
              <div>
                <div className="text-muted">Articles</div>
                <div className="font-bold">{detail.articles.length}</div>
              </div>
            </div>

            {tempPassword && (
              <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-xs">
                <div className="font-bold text-amber-700 dark:text-amber-400">Temporary password — shown only once</div>
                <div className="mt-2 flex items-center gap-2">
                  <code className="flex-1 rounded bg-background px-2 py-1.5 font-mono text-sm">{tempPassword}</code>
                  <button
                    onClick={() => void navigator.clipboard?.writeText(tempPassword)}
                    className="rounded-lg border border-border px-2.5 py-1.5 font-semibold hover:border-accent hover:text-accent"
                  >
                    Copy
                  </button>
                </div>
              </div>
            )}

            {isSelf ? (
              <p className="text-xs text-muted">This is your own account — manage it under Profile.</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => toggleLock(detail)}
                  disabled={busy}
                  className={`rounded-lg px-3 py-1.5 text-xs font-bold disabled:opacity-50 ${
                    detail.disabledAt
                      ? "bg-emerald-600 text-white hover:bg-emerald-700"
                      : "border border-red-500/40 text-red-600 hover:bg-red-500/10"
                  }`}
                >
                  {detail.disabledAt ? "Unlock account" : "Lock account"}
                </button>
                <button
                  onClick={() => resetPassword(detail)}
                  disabled={busy}
                  className="rounded-lg border border-border px-3 py-1.5 text-xs font-semibold hover:border-accent hover:text-accent disabled:opacity-50"
                >
                  Reset password
                </button>
                <button
                  onClick={() => changeRole(detail)}
                  disabled={busy}
                  className="rounded-lg border border-border px-3 py-1.5 text-xs font-semibold hover:border-accent hover:text-accent disabled:opacity-50"
                >
                  {detail.role === "admin" ? "Make contributor" : "Make admin"}
                </button>
              </div>
            )}

            <div>
              <div className="mb-2 text-xs font-bold uppercase tracking-wide text-muted">Their articles</div>
              {detail.articles.length === 0 ? (
                <p className="rounded-xl border border-border p-4 text-center text-xs text-muted">No articles yet.</p>
              ) : (
                <ul className="max-h-[45vh] divide-y divide-border overflow-y-auto rounded-xl border border-border">
                  {detail.articles.map((a) => (
                    <li key={a.id} className="flex items-center gap-3 px-3 py-2">
                      <span className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold ${STATUS[a.status].cls}`}>
                        {STATUS[a.status].label}
                      </span>
                      <span className="min-w-0 flex-1">
                        <Link href={`/admin/articles/${a.id}`} className="line-clamp-1 font-semibold hover:text-accent">
                          {a.title || "(untitled)"}
                        </Link>
                        <span className="text-[11px] text-muted">
                          Created {day(a.createdAt)}
                          {a.status === "published" && ` · published ${a.publishedAt}`}
                        </span>
                      </span>
                      {a.status === "published" && (
                        <a
                          href={`/bai-viet/${a.slug}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="shrink-0 text-xs font-semibold text-accent hover:underline"
                        >
                          View ↗
                        </a>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}
      </Modal>

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
