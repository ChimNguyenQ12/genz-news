"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { mediaUrl } from "@/lib/media";

type Status = "scheduled" | "publishing" | "published" | "failed";

interface FacebookPost {
  status: Status;
  caption: string;
  comment: string;
  scheduledAt: string | null;
  fbPostId: string | null;
  postedAt: string | null;
  lastError: string | null;
}

interface Row {
  id: string;
  slug: string;
  title: string;
  dek: string;
  category: string;
  coverImage: string | null;
  publishedAt: string;
  defaultCaption: string;
  defaultComment: string;
  facebookPost: FacebookPost | null;
}

interface ListResponse {
  configured: boolean;
  goldenHours: string[];
  perDay: number;
  nextSlot: string | null;
  articles: Row[];
}

type Filter = "all" | "none" | "scheduled" | "published" | "failed";

const vnTime = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleString("vi-VN", {
        timeZone: "Asia/Ho_Chi_Minh",
        hour: "2-digit",
        minute: "2-digit",
        day: "2-digit",
        month: "2-digit",
      })
    : "";

/** ISO → giá trị cho <input type="datetime-local"> theo giờ máy người dùng. */
const toLocalInput = (iso: string | null) => {
  if (!iso) return "";
  const d = new Date(iso);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
};

const statusOf = (r: Row): "none" | Status => r.facebookPost?.status ?? "none";

const BADGE: Record<"none" | Status, { label: string; cls: string }> = {
  none: { label: "Chưa lên Facebook", cls: "bg-surface-2 text-muted" },
  scheduled: { label: "Đã lên lịch", cls: "bg-blue-500/15 text-blue-600 dark:text-blue-400" },
  publishing: { label: "Đang đăng…", cls: "bg-amber-500/15 text-amber-600 dark:text-amber-400" },
  published: { label: "Đã đăng", cls: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400" },
  failed: { label: "Lỗi", cls: "bg-red-500/15 text-red-600 dark:text-red-400" },
};

async function api(url: string, init?: RequestInit) {
  const res = await fetch(url, {
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Lỗi ${res.status}`);
  return data;
}

export default function FacebookAdminPage() {
  const [data, setData] = useState<ListResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [filter, setFilter] = useState<Filter>("all");
  const [busy, setBusy] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const [editing, setEditing] = useState<Row | null>(null);
  const [caption, setCaption] = useState("");
  const [comment, setComment] = useState("");
  const [when, setWhen] = useState("");

  // Tải qua promise: setState chỉ chạy khi có kết quả, không đồng bộ trong effect.
  useEffect(() => {
    let active = true;
    api("/api/admin/facebook")
      .then((d: ListResponse) => {
        if (!active) return;
        setData(d);
        setError(null);
      })
      .catch((err: Error) => active && setError(err.message));
    return () => {
      active = false;
    };
  }, [reloadKey]);

  const reload = useCallback(() => setReloadKey((k) => k + 1), []);

  const notify = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 4000);
  };

  const run = async (key: string, fn: () => Promise<{ message?: string }>) => {
    setBusy(key);
    try {
      const out = await fn();
      if (out?.message) notify(out.message);
      reload();
      return true;
    } catch (err) {
      alert((err as Error).message);
      return false;
    } finally {
      setBusy(null);
    }
  };

  const rows = useMemo(() => data?.articles ?? [], [data]);
  const counts = useMemo(() => {
    const c: Record<Filter, number> = { all: rows.length, none: 0, scheduled: 0, published: 0, failed: 0 };
    for (const r of rows) {
      const s = statusOf(r);
      if (s === "publishing") c.scheduled++;
      else c[s]++;
    }
    return c;
  }, [rows]);
  const visible = rows.filter((r) => {
    if (filter === "all") return true;
    const s = statusOf(r);
    return filter === "scheduled" ? s === "scheduled" || s === "publishing" : s === filter;
  });

  const openEditor = (r: Row) => {
    setEditing(r);
    setCaption(r.facebookPost?.caption ?? r.defaultCaption);
    setComment(r.facebookPost?.comment ?? r.defaultComment);
    setWhen(toLocalInput(r.facebookPost?.scheduledAt ?? data?.nextSlot ?? null));
  };

  const scheduleToday = () =>
    run("today", () =>
      api("/api/admin/facebook/schedule-today", {
        method: "POST",
        body: JSON.stringify({ perDay: data?.perDay }),
      }),
    );

  const publishNow = (r: Row, text?: { caption: string; comment: string }) => {
    if (!confirm(`Đăng ngay lên Facebook Page (bỏ qua giờ vàng)?\n\n${r.title}`)) return;
    return run(r.id, () =>
      api("/api/admin/facebook/post", {
        method: "POST",
        body: JSON.stringify({ articleId: r.id, mode: "now", ...text }),
      }),
    ).then((ok) => ok && setEditing(null));
  };

  const saveEditor = async () => {
    if (!editing) return;
    const s = statusOf(editing);
    const scheduledAt = when ? new Date(when).toISOString() : undefined;
    const ok =
      s === "none"
        ? await run(editing.id, () =>
            api("/api/admin/facebook/post", {
              method: "POST",
              body: JSON.stringify({ articleId: editing.id, caption, comment, mode: "schedule", scheduledAt }),
            }),
          )
        : await run(editing.id, () =>
            api(`/api/admin/facebook/${editing.id}`, {
              method: "PATCH",
              body: JSON.stringify({ caption, comment, scheduledAt: s === "published" ? undefined : scheduledAt }),
            }),
          );
    if (ok) setEditing(null);
  };

  const remove = (r: Row) => {
    const published = statusOf(r) === "published";
    const q = published
      ? `GỠ bài này khỏi Facebook Page? Lượt thích và bình luận trên bài sẽ mất.\n\n${r.title}`
      : `Huỷ lịch đăng Facebook của bài này?\n\n${r.title}`;
    if (!confirm(q)) return;
    return run(r.id, () => api(`/api/admin/facebook/${r.id}`, { method: "DELETE" }));
  };

  const editingStatus = editing ? statusOf(editing) : "none";

  return (
    <div className="space-y-6 pb-12">
      {toast && (
        <div className="fixed top-5 right-5 z-50 rounded-xl bg-accent px-5 py-3 text-sm font-bold text-white shadow-2xl">
          {toast}
        </div>
      )}

      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-black tracking-tight sm:text-3xl">Facebook Page</h1>
          <p className="mt-1 text-sm text-muted">
            Lên lịch, đăng, sửa và gỡ bài trên Page. Bài mới đăng web được tự xếp vào giờ vàng kế tiếp.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={reload}
            className="rounded-xl border border-border bg-surface px-4 py-2 text-sm font-semibold hover:bg-surface-2"
          >
            Làm mới
          </button>
          <button
            onClick={scheduleToday}
            disabled={busy === "today" || !data?.configured}
            className="rounded-xl bg-accent px-5 py-2 text-sm font-bold text-white shadow-md hover:opacity-90 disabled:opacity-50"
          >
            {busy === "today" ? "Đang xếp lịch…" : "Xếp lịch bài hôm nay vào giờ vàng"}
          </button>
        </div>
      </div>

      {data && !data.configured && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-600 dark:text-red-400">
          Máy chủ chưa có <code>FB_PAGE_ID</code> / <code>FB_PAGE_ACCESS_TOKEN</code>. Thêm vào biến CI/CD
          của GitLab rồi deploy lại; trước lúc đó không đăng hay lên lịch được.
        </div>
      )}

      {data && (
        <div className="grid grid-cols-1 gap-3 rounded-2xl border border-border bg-surface p-4 text-sm sm:grid-cols-3">
          <div>
            <div className="text-xs font-bold text-accent">Giờ vàng (giờ VN)</div>
            <div className="mt-1 font-extrabold">{data.goldenHours.join(" · ")}</div>
            <div className="text-xs text-muted">Tối đa {data.perDay} bài/ngày, mỗi giờ một bài</div>
          </div>
          <div>
            <div className="text-xs font-bold text-emerald-600">Link ở bình luận đầu</div>
            <div className="mt-1 text-xs text-muted">
              Caption không chứa link ngoài để không bị hạ tiếp cận; link bài nằm ở bình luận đầu tiên.
            </div>
          </div>
          <div>
            <div className="text-xs font-bold text-blue-600">Giờ trống kế tiếp</div>
            <div className="mt-1 font-extrabold">{data.nextSlot ? vnTime(data.nextSlot) : "—"}</div>
          </div>
        </div>
      )}

      <div className="flex flex-wrap gap-2 border-b border-border pb-3">
        {(
          [
            ["all", "Tất cả"],
            ["none", "Chưa lên Facebook"],
            ["scheduled", "Đã lên lịch"],
            ["published", "Đã đăng"],
            ["failed", "Lỗi"],
          ] as [Filter, string][]
        ).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setFilter(key)}
            className={`rounded-lg px-3.5 py-1.5 text-sm font-semibold ${
              filter === key ? "bg-accent text-white" : "bg-surface text-muted hover:bg-surface-2"
            }`}
          >
            {label} ({counts[key]})
          </button>
        ))}
      </div>

      {error && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-500">{error}</div>
      )}
      {!data && !error && <div className="py-12 text-center text-sm text-muted">Đang tải…</div>}
      {data && visible.length === 0 && (
        <div className="py-12 text-center text-sm text-muted">Không có bài nào.</div>
      )}

      <div className="space-y-3">
        {visible.map((r) => {
          const s = statusOf(r);
          const fb = r.facebookPost;
          return (
            <div
              key={r.id}
              className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-4 md:flex-row md:items-center md:justify-between"
            >
              <div className="flex min-w-0 items-start gap-3.5">
                {r.coverImage ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={mediaUrl(r.coverImage)}
                    alt=""
                    loading="lazy"
                    className="size-16 shrink-0 rounded-xl object-cover"
                  />
                ) : (
                  <div className="size-16 shrink-0 rounded-xl bg-surface-2" />
                )}
                <div className="min-w-0 space-y-1">
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <span className={`rounded-md px-2 py-0.5 font-bold ${BADGE[s].cls}`}>{BADGE[s].label}</span>
                    {(s === "scheduled" || s === "publishing") && fb?.scheduledAt && (
                      <span className="font-semibold text-blue-600 dark:text-blue-400">
                        {vnTime(fb.scheduledAt)}
                      </span>
                    )}
                    {s === "published" && fb?.postedAt && <span className="text-muted">{vnTime(fb.postedAt)}</span>}
                    <span className="text-muted">Web: {r.publishedAt}</span>
                  </div>
                  <h3 className="truncate font-bold">
                    <Link href={`/bai-viet/${r.slug}`} target="_blank" className="hover:underline">
                      {r.title}
                    </Link>
                  </h3>
                  {fb?.lastError && <p className="text-xs text-red-500">{fb.lastError}</p>}
                </div>
              </div>

              <div className="flex shrink-0 flex-wrap items-center gap-2 self-end md:self-center">
                {s === "published" && fb?.fbPostId && (
                  <a
                    href={`https://www.facebook.com/${fb.fbPostId}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="rounded-xl border border-border px-3 py-1.5 text-xs font-semibold hover:border-accent hover:text-accent"
                  >
                    Xem trên FB ↗
                  </a>
                )}
                {s !== "publishing" && (
                  <button
                    onClick={() => openEditor(r)}
                    disabled={!data?.configured}
                    className="rounded-xl border border-border px-3 py-1.5 text-xs font-bold hover:bg-surface-2 disabled:opacity-50"
                  >
                    {s === "none" ? "Soạn & lên lịch" : "Sửa"}
                  </button>
                )}
                {(s === "none" || s === "scheduled" || s === "failed") && (
                  <button
                    onClick={() => publishNow(r)}
                    disabled={busy === r.id || !data?.configured}
                    className="rounded-xl bg-accent px-3.5 py-1.5 text-xs font-bold text-white hover:opacity-90 disabled:opacity-50"
                  >
                    {busy === r.id ? "Đang đăng…" : "Đăng ngay"}
                  </button>
                )}
                {s !== "none" && s !== "publishing" && (
                  <button
                    onClick={() => remove(r)}
                    disabled={busy === r.id}
                    className="rounded-xl border border-red-500/40 px-3 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-500/10 disabled:opacity-50"
                  >
                    {s === "published" ? "Gỡ khỏi Page" : "Huỷ lịch"}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <div className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-3xl border border-border bg-surface p-6 shadow-2xl">
            <div className="flex items-start justify-between gap-4 border-b border-border pb-4">
              <div className="min-w-0">
                <h2 className="text-xl font-black">
                  {editingStatus === "published" ? "Sửa bài trên Facebook" : "Soạn bài Facebook"}
                </h2>
                <p className="truncate text-xs text-muted">{editing.title}</p>
              </div>
              <button onClick={() => setEditing(null)} className="rounded-lg p-1.5 text-muted hover:bg-surface-2">
                ✕
              </button>
            </div>

            <div className="mt-5 grid grid-cols-1 gap-6 lg:grid-cols-2">
              <div className="space-y-4">
                <label className="block text-xs font-bold">
                  Caption
                  <textarea
                    rows={9}
                    value={caption}
                    onChange={(e) => setCaption(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-border bg-surface-2 p-3 text-xs font-normal focus:border-accent focus:outline-none"
                  />
                </label>
                <button
                  onClick={() => setCaption(editing.defaultCaption)}
                  className="text-xs text-accent hover:underline"
                >
                  Dùng lại caption mặc định
                </button>
                <label className="block text-xs font-bold">
                  Bình luận đầu tiên (chứa link bài)
                  <textarea
                    rows={3}
                    value={comment}
                    onChange={(e) => setComment(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-border bg-surface-2 p-3 text-xs font-normal focus:border-accent focus:outline-none"
                  />
                </label>
                {editingStatus !== "published" && (
                  <label className="block text-xs font-bold">
                    Giờ đăng
                    <input
                      type="datetime-local"
                      value={when}
                      onChange={(e) => setWhen(e.target.value)}
                      className="mt-1 w-full rounded-xl border border-border bg-surface-2 p-2.5 text-sm font-normal focus:border-accent focus:outline-none"
                    />
                    <span className="mt-1 block font-normal text-muted">
                      Để nguyên là giờ vàng trống kế tiếp. Giờ vàng: {data?.goldenHours.join(", ")}.
                    </span>
                  </label>
                )}
                {editingStatus === "published" && (
                  <p className="text-xs text-muted">
                    Lưu sẽ sửa trực tiếp bài và bình luận đang có trên Page, không đăng thêm bài mới.
                  </p>
                )}
              </div>

              <div>
                <div className="text-xs font-bold uppercase tracking-wider text-muted">Xem trước</div>
                <div className="mt-2 rounded-2xl border border-border bg-white p-4 text-black shadow-md dark:bg-zinc-900 dark:text-zinc-100">
                  <div className="flex items-center gap-2.5">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src="/genz-news-logo.png" alt="" className="size-10 rounded-full border" />
                    <div>
                      <div className="text-sm font-bold">GenZ News</div>
                      <div className="text-[11px] text-zinc-500">
                        {editingStatus === "published" ? vnTime(editing.facebookPost?.postedAt ?? null) : "Sắp đăng"} · 🌐
                      </div>
                    </div>
                  </div>
                  <div className="mt-3 whitespace-pre-wrap text-xs leading-relaxed">{caption}</div>
                  {editing.coverImage && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={mediaUrl(editing.coverImage)}
                      alt=""
                      className="mt-3 max-h-56 w-full rounded-xl object-cover"
                    />
                  )}
                  <div className="mt-3 rounded-xl bg-zinc-100 p-2.5 text-xs dark:bg-zinc-800/60">
                    <span className="font-bold">GenZ News</span> <span className="break-all">{comment}</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-6 flex flex-wrap items-center justify-end gap-3 border-t border-border pt-4">
              <button
                onClick={() => setEditing(null)}
                className="rounded-xl border border-border px-4 py-2 text-xs font-semibold hover:bg-surface-2"
              >
                Huỷ
              </button>
              {editingStatus !== "published" && (
                <button
                  onClick={() => publishNow(editing, { caption, comment })}
                  disabled={busy === editing.id}
                  className="rounded-xl border border-accent px-4 py-2 text-xs font-bold text-accent hover:bg-accent/10 disabled:opacity-50"
                >
                  Đăng ngay
                </button>
              )}
              <button
                onClick={saveEditor}
                disabled={busy === editing.id}
                className="rounded-xl bg-accent px-6 py-2 text-xs font-bold text-white shadow-lg hover:opacity-90 disabled:opacity-50"
              >
                {busy === editing.id
                  ? "Đang lưu…"
                  : editingStatus === "published"
                    ? "Lưu & sửa trên Facebook"
                    : "Lên lịch"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
