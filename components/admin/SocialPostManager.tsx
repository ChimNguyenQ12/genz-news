"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import Modal from "@/components/admin/Modal";
import { mediaUrl } from "@/lib/media";

type Status = "scheduled" | "publishing" | "published" | "failed" | "skipped";

interface Post {
  status: Status;
  caption: string;
  comment: string;
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
  /** Điểm nóng từ đề tài sinh ra bài; null = bài không gắn đề tài có điểm. */
  score: number | null;
  defaultCaption: string;
  defaultComment: string;
  post: Post | null;
}

interface ListResponse {
  platform: string;
  label: string;
  accountName: string;
  maxCaption: number | null;
  canEditPublished: boolean;
  autoPick: boolean;
  autoNext: { slot: string | null; article: { id: string; title: string; score: number } | null } | null;
  configured: boolean;
  goldenHours: string[];
  perDay: number;
  nextSlot: string | null;
  articles: Row[];
}

type Filter = "all" | "none" | "scheduled" | "published" | "failed" | "skipped";

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

const statusOf = (r: Row): "none" | Status => r.post?.status ?? "none";

/** Đã tới giờ nhưng chưa đăng: đang trong hàng đợi, chờ lượt chạy nền. */
const isDue = (r: Row) =>
  r.post?.status === "scheduled" && !!r.post.scheduledAt && new Date(r.post.scheduledAt).getTime() <= Date.now();

/** Chọn được để thao tác hàng loạt: chưa đăng và không đang đăng dở. */
const selectable = (r: Row) => {
  const s = statusOf(r);
  return s === "none" || s === "scheduled" || s === "failed" || s === "skipped";
};

const BADGE: Record<"none" | Status, { label: string; cls: string }> = {
  none: { label: "Chưa đăng", cls: "bg-surface-2 text-muted" },
  scheduled: { label: "Đã lên lịch", cls: "bg-blue-500/15 text-blue-600 dark:text-blue-400" },
  publishing: { label: "Đang đăng…", cls: "bg-amber-500/15 text-amber-600 dark:text-amber-400" },
  published: { label: "Đã đăng", cls: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400" },
  failed: { label: "Lỗi", cls: "bg-red-500/15 text-red-600 dark:text-red-400" },
  skipped: { label: "Bỏ qua", cls: "bg-zinc-500/15 text-zinc-500" },
};

const fire = (score: number | null) => (score === null ? null : `🔥 ${Math.round(score)}`);

async function api(url: string, init?: RequestInit) {
  const res = await fetch(url, {
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Lỗi ${res.status}`);
  return data;
}

/** Trang quản lý bài đăng trên một mạng xã hội (Facebook Page, Threads). */
export default function SocialPostManager({ platform }: { platform: "facebook" | "threads" }) {
  const base = `/api/admin/social/${platform}`;
  const [data, setData] = useState<ListResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [filter, setFilter] = useState<Filter>("all");
  const [byScore, setByScore] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [toast, setToast] = useState<Toast | null>(null);
  const [confirmBox, setConfirmBox] = useState<Confirm | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const [editing, setEditing] = useState<Row | null>(null);
  const [caption, setCaption] = useState("");
  const [comment, setComment] = useState("");
  const [when, setWhen] = useState("");
  const [drafting, setDrafting] = useState(false);
  // Mỗi lần mở/đóng khung soạn tăng số này; vòng hỏi kết quả "Tạo bài GenZ"
  // thấy số đổi thì dừng, không ghi đè nội dung của bài khác.
  const editorSession = useRef(0);

  // Tải qua promise: setState chỉ chạy khi có kết quả, không đồng bộ trong effect.
  useEffect(() => {
    let active = true;
    api(base)
      .then((d: ListResponse) => {
        if (!active) return;
        setData(d);
        setError(null);
      })
      .catch((err: Error) => active && setError(err.message));
    return () => {
      active = false;
    };
  }, [base, reloadKey]);

  const reload = useCallback(() => setReloadKey((k) => k + 1), []);

  // Còn bài chờ lượt đăng nền hoặc đang đăng dở thì tự làm mới, để thấy trạng
  // thái chuyển sang "Đã đăng" mà không phải bấm.
  const pending = useMemo(
    () => (data?.articles ?? []).some((r) => statusOf(r) === "publishing" || isDue(r)),
    [data],
  );
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
  const rows = useMemo(() => data?.articles ?? [], [data]);
  const counts = useMemo(() => {
    const c: Record<Filter, number> = { all: rows.length, none: 0, scheduled: 0, published: 0, failed: 0, skipped: 0 };
    for (const r of rows) {
      const s = statusOf(r);
      if (s === "publishing") c.scheduled++;
      else c[s]++;
    }
    return c;
  }, [rows]);
  const visible = rows
    .filter((r) => {
      if (filter === "all") return true;
      const s = statusOf(r);
      return filter === "scheduled" ? s === "scheduled" || s === "publishing" : s === filter;
    })
    .sort((a, b) => (byScore ? (b.score ?? -1) - (a.score ?? -1) : 0));
  const visibleSelectable = visible.filter(selectable);
  const allSelected = visibleSelectable.length > 0 && visibleSelectable.every((r) => selected.has(r.id));

  const max = data?.maxCaption ?? null;
  const tooLong = max !== null && caption.length > max;

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

  /** Nhờ Claude trên máy chủ viết 2–3 câu giọng GenZ; thường 20–60 giây. */
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
          notify("Đã viết xong, xem lại rồi lên lịch nhé");
          return;
        }
        if (d.status === "error") throw new Error(d.error);
      }
      throw new Error("Chờ quá lâu, thử lại sau");
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
    setWhen(toLocalInput(r.post?.scheduledAt ?? data?.nextSlot ?? null));
    if (opts.draft) void generateDraft(r);
  };

  const scheduleToday = () =>
    run("today", () =>
      api(`${base}/schedule-today`, { method: "POST", body: JSON.stringify({ perDay: data?.perDay }) }),
    );

  const publishNow = (r: Row, text?: { caption: string; comment: string }) =>
    setConfirmBox({
      title: `Đăng ngay lên ${label}?`,
      body: (
        <>
          <p className="font-semibold">{r.title}</p>
          <p className="mt-2 text-muted">Bài vào hàng đợi và lên trong giây lát, không đợi giờ vàng.</p>
        </>
      ),
      confirmLabel: "Đăng ngay",
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
    const actionLabel = { now: "Đăng ngay", golden: "Xếp vào giờ vàng", cancel: "Huỷ lịch", skip: "Bỏ qua" }[action];
    const explain = {
      now: `Các bài vào hàng đợi rồi lần lượt lên ${label}, không cần đợi ở trang này. Đăng dồn nhiều bài một lúc thì thường chỉ vài bài đầu được đẩy.`,
      golden: `Mỗi bài vào một giờ vàng trống kế tiếp (tối đa ${data?.perDay ?? 4} bài/ngày).`,
      cancel: "Huỷ lịch các bài chưa đăng (bài bỏ qua thì quay lại danh sách tự chọn). Bài đã lên giữ nguyên.",
      skip: "Các bài này sẽ không được máy tự chọn vào giờ vàng. Vẫn đăng tay được bất cứ lúc nào.",
    }[action];
    setConfirmBox({
      title: `${actionLabel} ${ids.length} bài?`,
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
              body: JSON.stringify({ articleId: editing.id, caption, comment, mode: "schedule", scheduledAt }),
            }),
          )
        : await run(editing.id, () =>
            api(`${base}/${editing.id}`, {
              method: "PATCH",
              body: JSON.stringify({ caption, comment, scheduledAt: s === "published" ? undefined : scheduledAt }),
            }),
          );
    if (ok) closeEditor();
  };

  const remove = (r: Row) => {
    const published = statusOf(r) === "published";
    const skippedRow = statusOf(r) === "skipped";
    setConfirmBox({
      title: published ? `Gỡ bài khỏi ${label}?` : skippedRow ? "Cho bài quay lại danh sách tự chọn?" : "Huỷ lịch đăng?",
      body: (
        <>
          <p className="font-semibold">{r.title}</p>
          {published && (
            <p className="mt-2 text-red-600 dark:text-red-400">
              Bài bị xoá khỏi {label}, kèm toàn bộ lượt thích và bình luận. Không hoàn tác được.
            </p>
          )}
        </>
      ),
      confirmLabel: published ? `Gỡ khỏi ${label}` : skippedRow ? "Bỏ đánh dấu" : "Huỷ lịch",
      danger: !skippedRow,
      onConfirm: () => void run(r.id, () => api(`${base}/${r.id}`, { method: "DELETE" })),
    });
  };

  const editingStatus = editing ? statusOf(editing) : "none";

  return (
    <div className="space-y-6 pb-12">
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
          <button onClick={() => setToast(null)} aria-label="Đóng" className="opacity-60 hover:opacity-100">
            ×
          </button>
        </div>
      )}

      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-black tracking-tight sm:text-3xl">{label}</h1>
          <p className="mt-1 text-sm text-muted">
            Lên lịch, đăng{data?.canEditPublished ? ", sửa" : ""} và gỡ bài trên {label}
            {data?.accountName ? ` (${data.accountName})` : ""}.{" "}
            {data?.autoPick
              ? `Tới mỗi giờ vàng còn trống, bài có điểm nóng cao nhất trong 2 ngày gần đây tự lên (tối đa ${data.perDay} bài/ngày).`
              : "Chỉ đăng những bài bạn tự đặt lịch hoặc bấm đăng."}
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
            {busy === "today" ? "Đang xếp lịch…" : "Xếp bài nóng nhất vào giờ trống hôm nay"}
          </button>
        </div>
      </div>

      {data && !data.configured && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-600 dark:text-red-400">
          Máy chủ chưa có token {label}. Thêm vào biến CI/CD của GitLab rồi deploy lại; trước lúc đó không đăng hay
          lên lịch được.
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
              Bài không chứa link ngoài để không bị hạ tiếp cận; link bài nằm ở bình luận đầu tiên.
              {max ? ` Tối đa ${max} ký tự mỗi bài.` : ""}
            </div>
          </div>
          {data.autoPick ? (
            <div>
              <div className="text-xs font-bold text-blue-600">
                Tự chọn lúc {data.autoNext?.slot ? vnTime(data.autoNext.slot) : "—"}
              </div>
              {data.autoNext?.article ? (
                <div className="mt-1 text-xs">
                  <span className="font-bold">{fire(data.autoNext.article.score)}</span>{" "}
                  <span className="line-clamp-2">{data.autoNext.article.title}</span>
                </div>
              ) : (
                <div className="mt-1 text-xs text-muted">
                  {data.autoNext?.slot ? "Chưa có bài nào để chọn" : "Hôm nay đã đủ bài / hết giờ vàng"}
                </div>
              )}
            </div>
          ) : (
            <div>
              <div className="text-xs font-bold text-blue-600">Giờ vàng trống kế tiếp</div>
              <div className="mt-1 font-extrabold">{data.nextSlot ? vnTime(data.nextSlot) : "—"}</div>
            </div>
          )}
        </div>
      )}

      <div className="flex flex-wrap gap-2 border-b border-border pb-3">
        {(
          [
            ["all", "Tất cả"],
            ["none", "Chưa đăng"],
            ["scheduled", "Đã lên lịch"],
            ["published", "Đã đăng"],
            ["failed", "Lỗi"],
            ...(data?.autoPick ? [["skipped", "Bỏ qua"]] : []),
          ] as [Filter, string][]
        ).map(([key, text]) => (
          <button
            key={key}
            onClick={() => setFilter(key)}
            className={`rounded-lg px-3.5 py-1.5 text-sm font-semibold ${
              filter === key ? "bg-accent text-white" : "bg-surface text-muted hover:bg-surface-2"
            }`}
          >
            {text} ({counts[key]})
          </button>
        ))}
        <button
          onClick={() => setByScore((v) => !v)}
          className={`ml-auto rounded-lg px-3.5 py-1.5 text-sm font-semibold ${
            byScore ? "bg-orange-500 text-white" : "bg-surface text-muted hover:bg-surface-2"
          }`}
        >
          🔥 {byScore ? "Đang sắp theo điểm nóng" : "Sắp theo điểm nóng"}
        </button>
      </div>

      {data?.configured && (
        <div className="sticky top-2 z-30 flex flex-wrap items-center gap-2 rounded-xl border border-border bg-background/95 px-3 py-2 text-sm shadow-sm backdrop-blur">
          <label className="flex items-center gap-2 font-semibold">
            <input
              type="checkbox"
              className="size-4"
              disabled={!visibleSelectable.length}
              checked={allSelected}
              onChange={(e) => setSelected(e.target.checked ? new Set(visibleSelectable.map((r) => r.id)) : new Set())}
            />
            {selected.size ? `Đã chọn ${selected.size} bài` : "Chọn tất cả"}
          </label>
          {selected.size > 0 && (
            <div className="ml-auto flex flex-wrap gap-2">
              <button
                onClick={() => setSelected(new Set())}
                className="rounded-lg px-3 py-1.5 text-xs font-semibold text-muted hover:bg-surface-2"
              >
                Bỏ chọn
              </button>
              <button
                onClick={() => bulk("cancel")}
                disabled={busy === "bulk"}
                className="rounded-lg border border-red-500/40 px-3 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-500/10 disabled:opacity-50"
              >
                Huỷ lịch
              </button>
              {data?.autoPick && (
                <button
                  onClick={() => bulk("skip")}
                  disabled={busy === "bulk"}
                  className="rounded-lg border border-border px-3 py-1.5 text-xs font-semibold hover:bg-surface-2 disabled:opacity-50"
                >
                  Bỏ qua
                </button>
              )}
              <button
                onClick={() => bulk("golden")}
                disabled={busy === "bulk"}
                className="rounded-lg border border-border px-3 py-1.5 text-xs font-bold hover:bg-surface-2 disabled:opacity-50"
              >
                Xếp vào giờ vàng
              </button>
              <button
                onClick={() => bulk("now")}
                disabled={busy === "bulk"}
                className="rounded-lg bg-accent px-3 py-1.5 text-xs font-bold text-white hover:opacity-90 disabled:opacity-50"
              >
                {busy === "bulk" ? "Đang xử lý…" : `Đăng ngay (${selected.size})`}
              </button>
            </div>
          )}
        </div>
      )}

      {error && <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-500">{error}</div>}
      {!data && !error && <div className="py-12 text-center text-sm text-muted">Đang tải…</div>}
      {data && visible.length === 0 && <div className="py-12 text-center text-sm text-muted">Không có bài nào.</div>}

      <div className="space-y-3">
        {visible.map((r) => {
          const s = statusOf(r);
          const p = r.post;
          const due = isDue(r);
          const badge = due ? { label: "Chờ đăng…", cls: BADGE.publishing.cls } : BADGE[s];
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
                  aria-label={`Chọn: ${r.title}`}
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
                    {s === "scheduled" && !due && p?.scheduledAt && (
                      <span className="font-semibold text-blue-600 dark:text-blue-400">{vnTime(p.scheduledAt)}</span>
                    )}
                    {s === "published" && p?.postedAt && <span className="text-muted">{vnTime(p.postedAt)}</span>}
                    <span className="text-muted">Web: {r.publishedAt}</span>
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
                    Xem ↗
                  </a>
                )}
                {platform === "threads" && canEdit && s !== "published" && (
                  <button
                    onClick={() => openEditor(r, { draft: true })}
                    disabled={!data?.configured}
                    className="rounded-xl bg-gradient-to-r from-fuchsia-600 to-orange-500 px-3 py-1.5 text-xs font-bold text-white hover:opacity-90 disabled:opacity-50"
                  >
                    ✨ Tạo bài
                  </button>
                )}
                {canEdit && (
                  <button
                    onClick={() => openEditor(r)}
                    disabled={!data?.configured}
                    className="rounded-xl border border-border px-3 py-1.5 text-xs font-bold hover:bg-surface-2 disabled:opacity-50"
                  >
                    {s === "none" || s === "skipped" ? "Soạn & lên lịch" : "Sửa"}
                  </button>
                )}
                {(s === "none" || s === "failed" || s === "skipped" || (s === "scheduled" && !due)) && (
                  <button
                    onClick={() => publishNow(r)}
                    disabled={busy === r.id || !data?.configured}
                    className="rounded-xl bg-accent px-3.5 py-1.5 text-xs font-bold text-white hover:opacity-90 disabled:opacity-50"
                  >
                    Đăng ngay
                  </button>
                )}
                {s !== "none" && s !== "publishing" && !due && (
                  <button
                    onClick={() => remove(r)}
                    disabled={busy === r.id}
                    className="rounded-xl border border-red-500/40 px-3 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-500/10 disabled:opacity-50"
                  >
                    {s === "published" ? "Gỡ bài" : s === "skipped" ? "Bỏ đánh dấu" : "Huỷ lịch"}
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
                  {editingStatus === "published" ? `Sửa bài trên ${label}` : `Soạn bài ${label}`}
                </h2>
                <p className="truncate text-xs text-muted">{editing.title}</p>
              </div>
              <button onClick={closeEditor} className="rounded-lg p-1.5 text-muted hover:bg-surface-2">
                ✕
              </button>
            </div>

            <div className="mt-5 grid grid-cols-1 gap-6 lg:grid-cols-2">
              <div className="space-y-4">
                <label className="block text-xs font-bold">
                  <span className="flex justify-between">
                    Nội dung bài
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
                      {drafting ? "✨ Đang viết… (20–60 giây)" : "✨ Tạo bài GenZ"}
                    </button>
                  )}
                  <button onClick={() => setCaption(editing.defaultCaption)} className="text-xs text-accent hover:underline">
                    Dùng lại nội dung mặc định
                  </button>
                </div>
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
                    Lưu sẽ sửa trực tiếp bài và bình luận đang có trên {label}, không đăng thêm bài mới.
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
                      <div className="text-sm font-bold">{data?.accountName}</div>
                      <div className="text-[11px] text-zinc-500">
                        {editingStatus === "published" ? vnTime(editing.post?.postedAt ?? null) : "Sắp đăng"}
                      </div>
                    </div>
                  </div>
                  <div className="mt-3 whitespace-pre-wrap text-xs leading-relaxed">{caption}</div>
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
              {tooLong && <span className="mr-auto text-xs font-semibold text-red-600">Nội dung vượt {max} ký tự</span>}
              <button
                onClick={closeEditor}
                className="rounded-xl border border-border px-4 py-2 text-xs font-semibold hover:bg-surface-2"
              >
                Huỷ
              </button>
              {editingStatus !== "published" && (
                <button
                  onClick={() => publishNow(editing, { caption, comment })}
                  disabled={busy === editing.id || tooLong || drafting}
                  className="rounded-xl border border-accent px-4 py-2 text-xs font-bold text-accent hover:bg-accent/10 disabled:opacity-50"
                >
                  Đăng ngay
                </button>
              )}
              <button
                onClick={saveEditor}
                disabled={busy === editing.id || tooLong || drafting}
                className="rounded-xl bg-accent px-6 py-2 text-xs font-bold text-white shadow-lg hover:opacity-90 disabled:opacity-50"
              >
                {busy === editing.id ? "Đang lưu…" : editingStatus === "published" ? `Lưu & sửa trên ${label}` : "Lên lịch"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Đặt cuối cùng: cùng z-index với khung soạn, phần tử sau nằm trên — hỏi
          xác nhận từ trong khung soạn thì hộp này phải nổi lên trên nó. */}
      <Modal open={!!confirmBox} title={confirmBox?.title ?? ""} onClose={() => setConfirmBox(null)}>
        {confirmBox && (
          <div className="space-y-5 text-sm">
            <div>{confirmBox.body}</div>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setConfirmBox(null)}
                className="rounded-xl border border-border px-4 py-2 text-xs font-semibold hover:bg-surface-2"
              >
                Thôi
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
