"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import type { RequestPage, RequestStatus, ResearchRequest } from "@/lib/queue";
import type { NewsroomRunStatus } from "@/lib/newsroom";
import Pagination from "@/components/admin/Pagination";

const STATUS_LABEL: Record<RequestStatus, string> = {
  pending: "Chờ xử lý",
  in_progress: "Đang viết",
  done: "Đã có nháp",
  rejected: "Bỏ qua",
};

const STATUS_STYLE: Record<RequestStatus, string> = {
  pending: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  in_progress: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
  done: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  rejected: "bg-neutral-500/10 text-neutral-500",
};

/** Tab luôn hiện đủ, kể cả khi đang có 0 mục — số 0 cũng là một thông tin. */
const TABS: (RequestStatus | "all")[] = [
  "all",
  "pending",
  "in_progress",
  "done",
  "rejected",
];

const TAB_LABEL: Record<RequestStatus | "all", string> = {
  all: "Tất cả",
  pending: "Chờ xử lý",
  in_progress: "Đang viết",
  done: "Đã có nháp",
  rejected: "Bỏ qua",
};

/** "12 phút trước" — đủ để biết lượt viết đã chạy bao lâu. */
function minutesSince(iso: string) {
  return Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
}

function describeElapsed(min: number) {
  if (min < 1) return "vừa xong";
  if (min < 60) return `${min} phút`;
  const hours = Math.floor(min / 60);
  return `${hours} giờ ${min % 60} phút`;
}

export default function ResearchQueue({
  initial,
  initialRun,
  staleAfterMin,
}: {
  initial: RequestPage;
  initialRun: NewsroomRunStatus;
  staleAfterMin: number;
}) {
  const router = useRouter();
  const [topic, setTopic] = useState("");
  const [urls, setUrls] = useState("");
  const [notes, setNotes] = useState("");
  const [sending, setSending] = useState(false);

  const [tab, setTab] = useState<RequestStatus | "all">("all");
  const [page, setPage] = useState(1);
  const [q, setQ] = useState("");
  const [data, setData] = useState<RequestPage>(initial);
  const [run, setRun] = useState<NewsroomRunStatus>(initialRun);
  const [loading, setLoading] = useState(false);

  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  // Đồng hồ cho các mục đang viết: mỗi phút vẽ lại một lần để con số "đã chạy
  // bao lâu" không đứng im cho tới lúc tải lại trang.
  const [, setTick] = useState(0);
  const requestSeq = useRef(0);
  const firstRender = useRef(true);

  const load = useCallback(
    async (
      next: { tab: RequestStatus | "all"; page: number; q: string },
      opts?: { quiet?: boolean },
    ) => {
      const seq = ++requestSeq.current;
      if (!opts?.quiet) setLoading(true);
      const params = new URLSearchParams({ status: next.tab, page: String(next.page) });
      if (next.q.trim()) params.set("q", next.q.trim());
      try {
        const res = await fetch(`/api/admin/requests?${params}`);
        if (!res.ok) throw new Error("tải hỏng");
        const body: RequestPage & { run?: NewsroomRunStatus } = await res.json();
        if (seq !== requestSeq.current) return;
        setData(body);
        if (body.run) setRun(body.run);
        setError("");
      } catch {
        if (seq === requestSeq.current) setError("Không tải được hàng đợi");
      } finally {
        if (seq === requestSeq.current) setLoading(false);
      }
    },
    [],
  );

  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    const timer = setTimeout(() => void load({ tab, page, q }), q ? 300 : 0);
    return () => clearTimeout(timer);
  }, [tab, page, q, load]);

  const working = data.counts.in_progress > 0 || run.running;

  // Còn bài đang viết thì tự hỏi lại: một lượt mất 8–10 phút và kết thúc ở
  // phía máy chủ, không có gì báo về màn hình. 20 giây một lần là đủ nhanh để
  // thấy bài xong, đủ chậm để không quấy cơ sở dữ liệu.
  useEffect(() => {
    if (!working) return;
    const timer = setInterval(() => {
      setTick((t) => t + 1);
      void load({ tab, page, q }, { quiet: true });
    }, 20000);
    return () => clearInterval(timer);
  }, [working, tab, page, q, load]);

  const reload = useCallback(
    () => load({ tab, page, q }, { quiet: true }),
    [tab, page, q, load],
  );

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
    await reload();
  }

  async function remove(id: string) {
    if (!confirm("Xoá đề tài này?")) return;
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
      setError(body.error ?? "Giao bài thất bại");
      await reload();
      return;
    }
    const body = await res.json();
    // Nhờ AI thì không có bài ngay — nó cần vài phút để tìm nguồn và viết.
    if (body.queued) {
      setNotice(body.message ?? "Đã giao cho AI.");
      setTab("in_progress");
      setPage(1);
      await load({ tab: "in_progress", page: 1, q });
      return;
    }
    router.push(`/admin/articles/${body.article.id}`);
  }

  /** Gỡ một lượt viết đã treo, trả đề tài về hàng đợi. */
  async function requeue(id: string) {
    if (!confirm("Trả đề tài này về hàng đợi để giao lại?")) return;
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
      setError(body.error ?? "Không trả về hàng đợi được");
      return;
    }
    setNotice("Đã trả đề tài về hàng đợi.");
    await reload();
  }

  const totalPages = Math.max(1, Math.ceil(data.total / data.perPage));

  return (
    <div>
      <div className="mb-6">
        <h1 className="font-display text-2xl font-black">Đặt đề tài</h1>
        <div className="mt-2 max-w-2xl space-y-2 text-sm text-muted">
          <p>
            <strong className="text-foreground">Create Post:</strong> bấm{" "}
            <strong className="text-foreground">Create Post</strong> ở đề tài bất kỳ.
            AI sẽ tự tìm nguồn trên web (cả báo Việt lẫn quốc tế), đối chiếu số liệu
            giữa các nguồn, rồi tổng hợp thành bài hoàn chỉnh 800–1400 từ. Mất vài
            phút; theo dõi ở tab <strong className="text-foreground">Đang viết</strong>,
            xong bài sẽ nằm ở mục <strong className="text-foreground">chờ duyệt</strong>{" "}
            để bạn đọc và quyết định đăng hay không.
          </p>
          <p>
            <strong className="text-foreground">Tự viết:</strong> bấm{" "}
            <strong className="text-foreground">Nháp trống</strong> nếu bạn muốn tự
            viết — hệ thống chỉ dựng sẵn khung và đưa các link vào mục nguồn.
          </p>
        </div>
      </div>

      <form
        onSubmit={submit}
        className="mb-8 space-y-3 rounded-2xl border border-border bg-surface p-4 sm:p-5"
      >
        <div>
          <label className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-muted">
            Chủ đề / từ khoá
          </label>
          <input
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            placeholder="VD: xu hướng AI trong tuyển dụng 2026"
            className="w-full rounded-xl border border-border bg-background px-4 py-2.5 text-sm outline-none focus:border-accent"
          />
        </div>

        <div>
          <label className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-muted">
            Link nguồn gợi ý{" "}
            <span className="font-normal normal-case">(không bắt buộc)</span>
          </label>
          <textarea
            value={urls}
            onChange={(e) => setUrls(e.target.value)}
            rows={2}
            placeholder="Mỗi link một dòng"
            className="w-full resize-none rounded-xl border border-border bg-background px-4 py-2.5 text-sm outline-none focus:border-accent"
          />
        </div>

        <div>
          <label className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-muted">
            Ghi chú cho AI
          </label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            placeholder="Góc nhìn muốn khai thác, chuyên mục, độ dài..."
            className="w-full resize-none rounded-xl border border-border bg-background px-4 py-2.5 text-sm outline-none focus:border-accent"
          />
        </div>

        <button
          type="submit"
          disabled={sending || !topic.trim()}
          className="w-full rounded-xl bg-accent px-5 py-2.5 text-sm font-bold text-white transition hover:opacity-90 disabled:opacity-50 sm:w-auto"
        >
          {sending ? "Đang gửi..." : "Gửi đề tài"}
        </button>
      </form>

      <h2 className="mb-3 font-display text-lg font-black">Hàng đợi</h2>

      <RunBanner run={run} />

      <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="no-scrollbar flex w-full gap-1 overflow-x-auto rounded-xl border border-border bg-surface p-1 sm:w-auto">
          {TABS.map((key) => (
            <button
              key={key}
              onClick={() => {
                setTab(key);
                setPage(1);
              }}
              className={`shrink-0 rounded-lg px-3 py-1.5 text-sm font-semibold transition ${
                tab === key
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

        <input
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setPage(1);
          }}
          placeholder="Tìm đề tài..."
          className="w-full rounded-lg border border-border bg-background px-2.5 py-1.5 text-sm outline-none focus:border-accent sm:w-56"
        />

        <span className="text-xs text-muted sm:ml-auto">
          {loading ? "Đang tải..." : `${data.total} đề tài`}
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

      {data.items.length === 0 ? (
        <p className="rounded-2xl border border-border bg-surface p-8 text-center text-sm text-muted">
          {tab === "in_progress"
            ? "Không có đề tài nào đang được viết."
            : "Chưa có đề tài nào trong mục này."}
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

      <Pagination page={data.page} totalPages={totalPages} onChange={setPage} />
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
  // Hai đường đo độc lập: đồng hồ (đã quá lâu) và nhịp tim của máy chủ (không
  // thấy tiến trình nào chạy). Nhịp tim đáng tin hơn nên nó được xét trước —
  // nhưng chỉ khi máy chủ có ghi nhịp tim, tức đã deploy bản script mới.
  const orphaned =
    working && run.known && !run.running && run.requestId !== r.id;
  const stale = working && (orphaned || elapsed >= staleAfterMin);
  const done = (r.articleIds?.length ?? 0) > 0;
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
                đã chạy {describeElapsed(elapsed)}
              </span>
            )}
            {retried && (
              <span className="rounded-full bg-red-500/10 px-2 py-0.5 text-[11px] font-bold text-red-600 dark:text-red-400">
                lượt trước hỏng · đã giao {r.attempts} lần
              </span>
            )}
            <span className="text-xs text-muted">
              {new Date(r.createdAt).toLocaleString("vi-VN")}
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
                  Máy chủ báo không có lượt viết nào đang chạy cho đề tài này — lượt
                  vừa rồi đã chết giữa chừng. Bấm <strong>Trả về hàng đợi</strong> để
                  giao lại.
                </>
              ) : stale ? (
                <>
                  Đã quá {staleAfterMin} phút mà chưa xong — nhiều khả năng lượt viết
                  đã chết giữa chừng. Bấm <strong>Trả về hàng đợi</strong> để giao lại.
                </>
              ) : (
                <>
                  AI đang tìm nguồn và viết. Một bài mất 8–10 phút; xong sẽ tự nhảy
                  sang mục chờ duyệt.
                </>
              )}
            </div>
          )}

          {r.reporterNote && (
            <p className="mt-2 rounded-lg bg-surface-2 p-2 text-xs text-muted">
              <strong>Phóng viên:</strong> {r.reporterNote}
            </p>
          )}
        </div>

        <div className="flex w-full shrink-0 flex-wrap items-center gap-2 [&>*]:flex-1 sm:w-auto sm:[&>*]:flex-none">
          {done && (
            <a
              href={`/admin/articles/${r.articleIds![r.articleIds!.length - 1]}`}
              className="rounded-lg border border-border px-3 py-1.5 text-xs font-semibold hover:border-accent hover:text-accent"
            >
              Mở bài nháp →
            </a>
          )}

          {working && (
            <button
              onClick={() => onRequeue(r.id)}
              disabled={busy}
              title="Gỡ lượt viết bị treo, đưa đề tài trở lại hàng đợi"
              className={`rounded-lg border px-3 py-1.5 text-xs font-semibold disabled:opacity-50 ${
                stale
                  ? "border-red-500/50 text-red-500 hover:border-red-500"
                  : "border-border hover:border-accent hover:text-accent"
              }`}
            >
              Trả về hàng đợi
            </button>
          )}

          {!working && !done && (
            <>
              <button
                onClick={() => onConvert(r.id, "ai")}
                disabled={busy}
                title="AI tìm nguồn, đối chiếu rồi tổng hợp thành bài hoàn chỉnh"
                className="rounded-lg bg-accent px-3 py-1.5 text-xs font-bold text-white transition hover:opacity-90 disabled:opacity-50"
              >
                {busy ? "Đang giao..." : retried ? "Giao lại" : "Create Post"}
              </button>
              <button
                onClick={() => onConvert(r.id, "manual")}
                disabled={busy}
                title="Chỉ dựng bản nháp trống kèm sẵn link nguồn, để tự viết"
                className="rounded-lg border border-border px-3 py-1.5 text-xs font-semibold hover:border-accent hover:text-accent disabled:opacity-50"
              >
                Nháp trống
              </button>
            </>
          )}

          <button
            onClick={() => onRemove(r.id)}
            className="rounded-lg border border-border px-3 py-1.5 text-xs font-semibold text-red-500 hover:border-red-500"
          >
            Xoá
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
        Chưa có dữ liệu nhịp tim từ máy chủ — cần deploy bản
        <code className="mx-1">newsroom-run.sh</code> mới thì mục này mới báo được
        máy có đang viết hay không.
      </p>
    );
  }

  if (run.running) {
    const elapsed = run.startedAt ? describeElapsed(minutesSince(run.startedAt)) : "";
    return (
      <div className="mb-3 rounded-xl border border-blue-500/40 bg-blue-500/10 px-4 py-2.5 text-sm text-blue-700 dark:text-blue-300">
        <span className="mr-2 inline-block size-2 animate-pulse rounded-full bg-current align-middle" />
        <strong>Máy đang viết</strong>
        {run.topic ? `: ${run.topic}` : ""}
        {elapsed ? ` — đã chạy ${elapsed}` : ""}
      </div>
    );
  }

  if (run.stalled) {
    return (
      <div className="mb-3 rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-2.5 text-sm text-red-600 dark:text-red-400">
        <strong>Lượt viết đã chết giữa chừng.</strong> Máy chủ còn ghi là đang chạy
        {run.topic ? ` đề tài "${run.topic}"` : ""} nhưng nhịp tim đã ngừng. Trả đề
        tài về hàng đợi rồi giao lại.
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
        Máy đang rảnh, không có lượt viết nào chạy.
      </strong>{" "}
      {run.finishedAt && (
        <>Lượt gần nhất xong lúc {new Date(run.finishedAt).toLocaleString("vi-VN")}. </>
      )}
      {failed && run.lastError && <>Lỗi: {run.lastError}</>}
    </div>
  );
}
