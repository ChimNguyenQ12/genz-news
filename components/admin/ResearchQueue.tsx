"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import type { RequestPage, RequestStatus, ResearchRequest } from "@/lib/queue";
import type { NewsroomRunStatus } from "@/lib/newsroom";
import type { NewsroomSettings } from "@/lib/settings";
import Pagination from "@/components/admin/Pagination";
import Modal from "@/components/admin/Modal";
import NewsroomSwitch from "@/components/admin/NewsroomSwitch";

const STATUS_LABEL: Record<RequestStatus, string> = {
  pending: "Queued",
  in_progress: "Writing",
  done: "Drafted",
  published: "Published",
  rejected: "Skipped",
};

const STATUS_STYLE: Record<RequestStatus, string> = {
  pending: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  in_progress: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
  done: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  published: "bg-accent/10 text-accent",
  rejected: "bg-neutral-500/10 text-neutral-500",
};

/**
 * Chỉ bốn tab, đúng bốn chặng của một đề tài: All → Queued → Writing → Drafted.
 *
 * Bài đã đăng và đề tài bị bỏ qua không có tab riêng — chúng đã xong việc, để
 * thêm tab chỉ làm thanh tab dài ra. Muốn xem lại thì vào All, nhãn trạng thái
 * trên từng dòng vẫn nói rõ mục đó đang ở đâu.
 *
 * Bốn tab này luôn hiện, kể cả khi đang có 0 mục — số 0 cũng là một thông tin.
 */
const TABS: (RequestStatus | "all")[] = ["all", "pending", "in_progress", "done"];

const TAB_LABEL: Record<RequestStatus | "all", string> = {
  all: "All",
  pending: "Queued",
  in_progress: "Writing",
  done: "Drafted",
  published: "Published",
  rejected: "Skipped",
};

const fieldClass =
  "rounded-lg border border-border bg-background px-2.5 py-1.5 text-sm outline-none focus:border-accent";

function minutesSince(iso: string) {
  return Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
}

function describeElapsed(min: number) {
  if (min < 1) return "just now";
  if (min < 60) return `${min} min`;
  const hours = Math.floor(min / 60);
  return `${hours}h ${min % 60}m`;
}

interface Query {
  tab: RequestStatus | "all";
  page: number;
  q: string;
  /** "" = mọi ngày. */
  date: string;
}

export default function ResearchQueue({
  initial,
  initialRun,
  initialSettings,
  staleAfterMin,
}: {
  initial: RequestPage;
  initialRun: NewsroomRunStatus;
  initialSettings: NewsroomSettings;
  staleAfterMin: number;
}) {
  const router = useRouter();

  const [topic, setTopic] = useState("");
  const [urls, setUrls] = useState("");
  const [notes, setNotes] = useState("");
  const [sending, setSending] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [settings, setSettings] = useState(initialSettings);

  // Ngày mặc định do máy chủ quyết định (ngày gần nhất còn đề tài) — màn hình
  // không đoán được ngày nào có việc mà không hỏi thêm một lượt.
  const [query, setQuery] = useState<Query>({
    tab: "all",
    page: 1,
    q: "",
    date: initial.date,
  });
  const [data, setData] = useState<RequestPage>(initial);
  const [run, setRun] = useState<NewsroomRunStatus>(initialRun);
  const [loading, setLoading] = useState(false);

  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  // Đồng hồ cho các mục đang viết: vẽ lại theo nhịp hỏi lại để con số "đã chạy
  // bao lâu" không đứng im cho tới lúc tải lại trang.
  const [, setTick] = useState(0);
  const requestSeq = useRef(0);
  const firstRender = useRef(true);

  const load = useCallback(async (next: Query, opts?: { quiet?: boolean }) => {
    const seq = ++requestSeq.current;
    if (!opts?.quiet) setLoading(true);
    const params = new URLSearchParams({
      status: next.tab,
      page: String(next.page),
      // Luôn gửi date, kể cả rỗng: bỏ hẳn tham số thì máy chủ hiểu là "lấy
      // ngày mới nhất", mà rỗng lại có nghĩa "mọi ngày".
      date: next.date,
    });
    if (next.q.trim()) params.set("q", next.q.trim());
    try {
      const res = await fetch(`/api/admin/requests?${params}`);
      if (!res.ok) throw new Error("load failed");
      const body: RequestPage & { run?: NewsroomRunStatus } = await res.json();
      if (seq !== requestSeq.current) return;
      setData(body);
      if (body.run) setRun(body.run);
      setError("");
    } catch {
      if (seq === requestSeq.current) setError("Could not load the queue.");
    } finally {
      if (seq === requestSeq.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    const timer = setTimeout(() => void load(query), query.q ? 300 : 0);
    return () => clearTimeout(timer);
  }, [query, load]);

  const working = data.counts.in_progress > 0 || run.running;

  // Còn bài đang viết thì tự hỏi lại: một lượt mất 8–10 phút và kết thúc ở
  // phía máy chủ, không có gì báo về màn hình.
  useEffect(() => {
    if (!working) return;
    const timer = setInterval(() => {
      setTick((t) => t + 1);
      void load(query, { quiet: true });
    }, 20000);
    return () => clearInterval(timer);
  }, [working, query, load]);

  const reload = useCallback(() => load(query, { quiet: true }), [query, load]);

  function update(patch: Partial<Query>) {
    setQuery((current) => ({ ...current, page: 1, ...patch }));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!topic.trim()) return;
    setSending(true);
    await fetch("/api/admin/requests", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ topic, urls, notes }),
    });
    setTopic("");
    setUrls("");
    setNotes("");
    setSending(false);
    setModalOpen(false);
    // Đề tài vừa đặt mang ngày hôm nay, nên nhảy về hôm nay để thấy nó ngay —
    // nếu đang đứng ở một ngày cũ thì nó nằm ngoài bộ lọc.
    const today = new Date(Date.now() + 7 * 60 * 60 * 1000).toISOString().slice(0, 10);
    setNotice("Topic added to the queue.");
    setQuery((current) => ({ ...current, page: 1, date: today }));
  }

  async function remove(id: string) {
    if (!confirm("Delete this topic?")) return;
    await fetch(`/api/admin/requests/${id}`, { method: "DELETE" });
    await reload();
  }

  async function convert(id: string, mode: "ai" | "manual") {
    setBusy(id);
    setError("");
    setNotice("");
    const res = await fetch(`/api/admin/requests/${id}/convert`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode }),
    });
    setBusy(null);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "Could not assign the topic.");
      await reload();
      return;
    }
    const body = await res.json();
    // Nhờ AI thì không có bài ngay — nó cần vài phút để tìm nguồn và viết.
    //
    // Đề tài tự chuyển sang tab "Writing", nhưng màn hình thì Ở YÊN chỗ cũ:
    // giao xong thường là giao tiếp mấy đề tài nữa, mà bị đẩy sang tab khác
    // sau mỗi lần bấm thì phải bấm quay lại rồi dò chỗ cũ từ đầu.
    if (body.queued) {
      setNotice(body.message ?? "Assigned to the AI reporter.");
      await reload();
      return;
    }
    router.push(`/admin/articles/${body.article.id}`);
  }

  /** Gỡ một lượt viết đã treo, trả đề tài về hàng đợi. */
  async function requeue(id: string) {
    if (!confirm("Put this topic back in the queue so it can be assigned again?")) return;
    setBusy(id);
    setError("");
    const res = await fetch(`/api/admin/requests/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "requeue" }),
    });
    setBusy(null);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "Could not requeue the topic.");
      return;
    }
    setNotice("Topic is back in the queue.");
    await reload();
  }

  const totalPages = Math.max(1, Math.ceil(data.total / data.perPage));

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-black">Research queue</h1>
          <p className="mt-1 text-sm text-muted">
            Topics waiting to be written. The AI finds its own sources, cross-checks
            them, and leaves the finished article for your review.
          </p>
        </div>

        <div className="flex w-full items-center gap-2 sm:w-auto">
          <button
            onClick={() => setModalOpen(true)}
            className="flex-1 rounded-xl border border-border px-3 py-2.5 text-sm font-semibold transition hover:border-accent hover:text-accent sm:flex-none sm:py-2"
          >
            <span
              className={`mr-1.5 inline-block size-2 rounded-full align-middle ${
                settings.enabled ? "bg-emerald-500" : "bg-neutral-400"
              }`}
            />
            Auto {settings.enabled ? "on" : "off"}
          </button>
          <button
            onClick={() => setModalOpen(true)}
            className="flex-1 rounded-xl bg-accent px-4 py-2.5 text-sm font-bold text-white transition hover:opacity-90 sm:flex-none sm:py-2"
          >
            + New topic
          </button>
        </div>
      </div>

      <RunBanner run={run} />

      <div className="mb-3 flex flex-col gap-2 lg:flex-row lg:items-center">
        <div className="no-scrollbar flex w-full gap-1 overflow-x-auto rounded-xl border border-border bg-surface p-1 lg:w-auto">
          {TABS.map((key) => (
            <button
              key={key}
              onClick={() => update({ tab: key })}
              className={`shrink-0 rounded-lg px-3 py-1.5 text-sm font-semibold transition ${
                query.tab === key
                  ? "bg-accent text-white"
                  : "text-foreground/70 hover:bg-surface-2"
              }`}
            >
              {key === "in_progress" && data.counts.in_progress > 0 && (
                <span className="mr-1.5 inline-block size-1.5 animate-pulse rounded-full bg-current align-middle" />
              )}
              {TAB_LABEL[key]} ({data.counts[key]})
            </button>
          ))}
        </div>

        {/* Điện thoại: ô tìm chiếm cả hàng, ngày và nút chia đôi hàng dưới. */}
        <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center">
          <input
            value={query.q}
            onChange={(e) => update({ q: e.target.value })}
            placeholder="Search topics..."
            className={`${fieldClass} col-span-2 min-w-0 sm:w-52`}
          />
          <input
            type="date"
            value={query.date}
            max={data.latestDate || undefined}
            onChange={(e) => update({ date: e.target.value })}
            className={`${fieldClass} min-w-0`}
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
              onClick={() => update({ date: data.latestDate })}
              className="rounded-lg border border-border px-3 py-2 text-xs font-semibold hover:border-accent hover:text-accent sm:py-1.5"
            >
              Latest day
            </button>
          )}
        </div>

        <span className="text-xs text-muted lg:ml-auto">
          {loading ? "Loading..." : `${data.total} topics`}
        </span>
      </div>

      {error && (
        <p className="mb-3 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-2 text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      )}

      {notice && (
        <p className="mb-3 rounded-xl border border-blue-500/30 bg-blue-500/10 px-4 py-2 text-sm text-blue-600 dark:text-blue-400">
          {notice}
        </p>
      )}

      {/* Hàng đợi có gần trăm đề tài. Phân trang ở cả trên lẫn dưới để nhảy
          trang mà không phải cuộn hết danh sách mới thấy nút. */}
      <Pagination
        page={data.page}
        totalPages={totalPages}
        onChange={(page) => setQuery((current) => ({ ...current, page }))}
        className="mb-3"
      />

      {data.items.length === 0 ? (
        <p className="rounded-2xl border border-border bg-surface p-8 text-center text-sm text-muted">
          {query.tab === "in_progress"
            ? "Nothing is being written right now."
            : query.date
              ? "No topics on this date. Try another day, or “All dates”."
              : "No topics in this tab yet."}
        </p>
      ) : (
        <div className={`space-y-2 transition-opacity ${loading ? "opacity-50" : ""}`}>
          {data.items.map((r) => (
            <RequestRow
              key={r.id}
              request={r}
              run={run}
              busy={busy === r.id}
              staleAfterMin={staleAfterMin}
              onConvert={convert}
              onRequeue={requeue}
              onRemove={remove}
            />
          ))}
        </div>
      )}

      <Pagination
        page={data.page}
        totalPages={totalPages}
        onChange={(page) => setQuery((current) => ({ ...current, page }))}
      />

      <Modal
        open={modalOpen}
        title="New topic & automation"
        onClose={() => setModalOpen(false)}
      >
        <form onSubmit={submit} className="space-y-3">
          <div>
            <label className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-muted">
              Topic or keyword
            </label>
            <input
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              autoFocus
              placeholder="e.g. AI in Vietnamese hiring, 2026"
              className="w-full rounded-xl border border-border bg-background px-4 py-2.5 text-sm outline-none focus:border-accent"
            />
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-muted">
              Suggested source links{" "}
              <span className="font-normal normal-case">(optional)</span>
            </label>
            <textarea
              value={urls}
              onChange={(e) => setUrls(e.target.value)}
              rows={2}
              placeholder="One link per line"
              className="w-full resize-none rounded-xl border border-border bg-background px-4 py-2.5 text-sm outline-none focus:border-accent"
            />
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-muted">
              Notes for the AI
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              placeholder="Angle to take, section, length..."
              className="w-full resize-none rounded-xl border border-border bg-background px-4 py-2.5 text-sm outline-none focus:border-accent"
            />
          </div>

          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setModalOpen(false)}
              className="rounded-xl border border-border px-4 py-2.5 text-sm font-semibold hover:border-accent hover:text-accent"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={sending || !topic.trim()}
              className="rounded-xl bg-accent px-5 py-2.5 text-sm font-bold text-white transition hover:opacity-90 disabled:opacity-50"
            >
              {sending ? "Adding..." : "Add to queue"}
            </button>
          </div>
        </form>

        <div className="mt-5 border-t border-border pt-5">
          <NewsroomSwitch initial={settings} onChanged={setSettings} />
        </div>
      </Modal>
    </div>
  );
}

function RequestRow({
  request: r,
  run,
  busy,
  staleAfterMin,
  onConvert,
  onRequeue,
  onRemove,
}: {
  request: ResearchRequest;
  run: NewsroomRunStatus;
  busy: boolean;
  staleAfterMin: number;
  onConvert: (id: string, mode: "ai" | "manual") => void;
  onRequeue: (id: string) => void;
  onRemove: (id: string) => void;
}) {
  const working = r.status === "in_progress";
  const elapsed = working && r.assignedAt ? minutesSince(r.assignedAt) : 0;
  // Máy chỉ viết được MỘT bài một lúc (các lượt tranh nhau một cái khoá), nên
  // "in_progress" thật ra gộp hai tình huống rất khác nhau. Nhịp tim tách được:
  //   - đúng đề tài đang chạy  → đang viết thật
  //   - máy đang chạy đề tài khác → mục này mới xếp hàng, chưa bắt đầu
  //   - máy không chạy gì cả  → lượt viết đã chết, mục kẹt lại
  const writingNow = working && run.known && run.running && run.requestId === r.id;
  const waitingTurn = working && run.known && run.running && run.requestId !== r.id;
  const orphaned = working && run.known && !run.running;
  const stale = working && (orphaned || elapsed >= staleAfterMin);
  const done = (r.articleIds?.length ?? 0) > 0;
  const live = r.status === "published";
  // Đã giao rồi mà lại nằm ở "chờ xử lý" nghĩa là lượt trước hỏng — khác hẳn
  // đề tài chưa ai đụng tới, và đó chính là chỗ trước đây nhìn không ra.
  const retried = r.status === "pending" && r.attempts > 0;

  return (
    <div
      className={`rounded-2xl border bg-surface p-4 ${
        working ? "border-blue-500/40" : "border-border"
      }`}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${STATUS_STYLE[r.status]}`}
            >
              {working && (
                <span className="mr-1 inline-block size-1.5 animate-pulse rounded-full bg-current align-middle" />
              )}
              {STATUS_LABEL[r.status]}
            </span>
            {working && r.assignedAt && (
              <span className="text-xs text-muted">
                {waitingTurn ? "waiting" : "running"} {describeElapsed(elapsed)}
              </span>
            )}
            {retried && (
              <span className="rounded-full bg-red-500/10 px-2 py-0.5 text-[11px] font-bold text-red-600 dark:text-red-400">
                last run failed · assigned {r.attempts}×
              </span>
            )}
            <span className="text-xs text-muted">
              {new Date(r.createdAt).toLocaleString("en-GB")}
            </span>
          </div>

          <p className="mt-1.5 font-semibold">{r.topic}</p>
          {r.notes && <p className="mt-1 text-sm text-muted">{r.notes}</p>}

          {r.urls.length > 0 && (
            <ul className="mt-1.5 space-y-0.5">
              {r.urls.map((u) => (
                <li key={u}>
                  <a
                    href={u}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-accent hover:underline"
                  >
                    {u}
                  </a>
                </li>
              ))}
            </ul>
          )}

          {working && (
            <div className="mt-2 rounded-lg bg-blue-500/10 p-2 text-xs text-blue-700 dark:text-blue-300">
              {orphaned ? (
                <>
                  The server reports no run in progress — the last one died partway.
                  Hit <strong>Requeue</strong> to assign it again.
                </>
              ) : stale ? (
                <>
                  Over {staleAfterMin} minutes and still not finished — the run most
                  likely died. Hit <strong>Requeue</strong> to assign it again.
                </>
              ) : waitingTurn ? (
                <>
                  Waiting its turn — the machine writes one article at a time and is
                  currently on <strong>{run.topic}</strong>.
                </>
              ) : writingNow ? (
                <>
                  The AI is researching and writing this one. Takes 8–10 minutes; it
                  moves to review when done.
                </>
              ) : (
                <>
                  Assigned. Takes 8–10 minutes; it moves to review when done.
                </>
              )}
            </div>
          )}

          {r.reporterNote && (
            <p className="mt-2 rounded-lg bg-surface-2 p-2 text-xs text-muted">
              <strong>Reporter:</strong> {r.reporterNote}
            </p>
          )}
        </div>

        <div className="flex w-full shrink-0 flex-wrap items-center gap-2 [&>*]:min-w-[calc(50%-0.25rem)] [&>*]:flex-1 [&>*]:text-center sm:w-auto sm:[&>*]:min-w-0 sm:[&>*]:flex-none">
          {done && (
            <a
              href={`/admin/articles/${r.articleIds![r.articleIds!.length - 1]}`}
              className="rounded-lg border border-border px-3 py-1.5 text-xs font-semibold hover:border-accent hover:text-accent"
            >
              {live ? "Open article →" : "Open draft →"}
            </a>
          )}

          {working && (
            <button
              onClick={() => onRequeue(r.id)}
              disabled={busy}
              title="Clear a stuck run and put the topic back in the queue"
              className={`rounded-lg border px-3 py-1.5 text-xs font-semibold disabled:opacity-50 ${
                stale
                  ? "border-red-500/50 text-red-500 hover:border-red-500"
                  : "border-border hover:border-accent hover:text-accent"
              }`}
            >
              Requeue
            </button>
          )}

          {!working && !done && (
            <>
              <button
                onClick={() => onConvert(r.id, "ai")}
                disabled={busy}
                title="The AI finds sources, cross-checks them and writes the full article"
                className="rounded-lg bg-accent px-3 py-1.5 text-xs font-bold text-white transition hover:opacity-90 disabled:opacity-50"
              >
                {busy ? "Assigning..." : retried ? "Assign again" : "Create post"}
              </button>
              <button
                onClick={() => onConvert(r.id, "manual")}
                disabled={busy}
                title="Just create an empty draft with the source links, to write yourself"
                className="rounded-lg border border-border px-3 py-1.5 text-xs font-semibold hover:border-accent hover:text-accent disabled:opacity-50"
              >
                Empty draft
              </button>
            </>
          )}

          <button
            onClick={() => onRemove(r.id)}
            className="rounded-lg border border-border px-3 py-1.5 text-xs font-semibold text-red-500 hover:border-red-500"
          >
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Máy có đang viết bài hay không — đọc từ nhịp tim mà lượt viết trên host ghi
 * xuống thư mục dữ liệu dùng chung.
 *
 * Đây là câu hỏi trước đây không màn hình nào trả lời được: trạng thái
 * "in_progress" trong cơ sở dữ liệu chỉ nói "đã giao việc", không nói tiến
 * trình còn sống hay đã chết.
 */
function RunBanner({ run }: { run: NewsroomRunStatus }) {
  if (!run.known) {
    return (
      <p className="mb-3 rounded-xl border border-border bg-surface px-4 py-2.5 text-xs text-muted">
        No heartbeat from the server yet — deploy the current
        <code className="mx-1">newsroom-run.sh</code> and this panel will show whether
        the machine is writing.
      </p>
    );
  }

  if (run.running) {
    const elapsed = run.startedAt ? describeElapsed(minutesSince(run.startedAt)) : "";
    return (
      <div className="mb-3 rounded-xl border border-blue-500/40 bg-blue-500/10 px-4 py-2.5 text-sm text-blue-700 dark:text-blue-300">
        <span className="mr-2 inline-block size-2 animate-pulse rounded-full bg-current align-middle" />
        <strong>Writing now</strong>
        {run.topic ? `: ${run.topic}` : ""}
        {elapsed ? ` — running ${elapsed}` : ""}
      </div>
    );
  }

  if (run.stalled) {
    return (
      <div className="mb-3 rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-2.5 text-sm text-red-600 dark:text-red-400">
        <strong>A run died partway.</strong> The server still claims it is writing
        {run.topic ? ` “${run.topic}”` : ""} but the heartbeat stopped. Requeue the
        topic and assign it again.
      </div>
    );
  }

  const failed = run.lastResult === "failed";
  return (
    <div
      className={`mb-3 rounded-xl border px-4 py-2.5 text-sm ${
        failed
          ? "border-red-500/40 bg-red-500/10 text-red-600 dark:text-red-400"
          : "border-border bg-surface text-muted"
      }`}
    >
      <strong className={failed ? "" : "text-foreground"}>
        Idle — no run in progress.
      </strong>{" "}
      {run.finishedAt && (
        <>Last run finished {new Date(run.finishedAt).toLocaleString("en-GB")}. </>
      )}
      {failed && run.lastError && <>Error: {run.lastError}</>}
    </div>
  );
}
