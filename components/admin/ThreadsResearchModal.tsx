"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import Modal from "@/components/admin/Modal";
import type { ResearchItem, ResearchJob } from "@/lib/threadsResearch";

const MAX = 12;

const STATE: Record<ResearchItem["state"], { icon: string; label: string; cls: string }> = {
  waiting: { icon: "○", label: "waiting", cls: "text-muted" },
  searching: { icon: "◌", label: "searching…", cls: "text-accent animate-pulse" },
  added: { icon: "✓", label: "added to queue", cls: "text-emerald-600 dark:text-emerald-400" },
  skipped: { icon: "–", label: "skipped", cls: "text-muted" },
  duplicate: { icon: "=", label: "already queued", cls: "text-muted" },
};

async function api(init?: RequestInit, query = "") {
  const res = await fetch(`/api/admin/threads-research${query}`, {
    cache: "no-store",
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Error ${res.status}`);
  return data as { job: ResearchJob | null };
}

/**
 * Research trên Threads ngay, không chờ cron. Chạy nền trên máy chủ (mỗi từ
 * khoá ~10 giây), màn hình hỏi tiến độ mỗi 2 giây. Đóng cửa sổ giữa chừng
 * cũng không sao — mở lại là thấy lượt đang chạy.
 */
export default function ThreadsResearchModal({
  open,
  onClose,
  onFinished,
}: {
  open: boolean;
  onClose: () => void;
  /** Gọi khi một lượt xong — để hàng đợi tải lại và chuyển sang mục Threads. */
  onFinished: (job: ResearchJob) => void;
}) {
  const [text, setText] = useState("");
  const [job, setJob] = useState<ResearchJob | null>(null);
  const [error, setError] = useState("");
  const [starting, setStarting] = useState(false);
  const reported = useRef<string | null>(null);

  // Mở cửa sổ: nếu đang có lượt chạy (bấm từ máy khác / đóng giữa chừng) thì hiện nó.
  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => {
      api(undefined, "")
        .then((d) => d.job && setJob(d.job))
        .catch(() => {});
    }, 0);
    return () => clearTimeout(t);
  }, [open]);

  const poll = useCallback(async (id: string) => {
    try {
      const d = await api(undefined, `?id=${id}`);
      if (d.job) setJob(d.job);
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  useEffect(() => {
    if (!job || job.status !== "running") return;
    const t = setInterval(() => void poll(job.id), 2000);
    return () => clearInterval(t);
  }, [job, poll]);

  useEffect(() => {
    if (job && job.status !== "running" && reported.current !== job.id) {
      reported.current = job.id;
      onFinished(job);
    }
  }, [job, onFinished]);

  async function start(body: object) {
    setStarting(true);
    setError("");
    try {
      const d = await api({ method: "POST", body: JSON.stringify(body) });
      setJob(d.job);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setStarting(false);
    }
  }

  const keywords = text
    .split(/[\n,]/)
    .map((k) => k.trim())
    .filter(Boolean);
  const running = job?.status === "running";
  const doneCount = job?.items.filter((i) => i.state !== "waiting" && i.state !== "searching").length ?? 0;

  return (
    <Modal open={open} title="🧵 Research on Threads now" onClose={onClose}>
      {!job || (!running && !job.items.length) ? (
        <div className="space-y-3">
          <p className="text-sm text-muted">
            Search Threads right away instead of waiting for the 06:00 run. Keywords people are actually discussing
            land in <b>Research → Threads</b>, ranked by engagement.
          </p>
          <button
            disabled={starting}
            onClick={() => start({ fromTrends: true })}
            className="w-full rounded-xl border border-accent bg-accent/10 px-4 py-3 text-left text-sm font-semibold text-accent transition hover:bg-accent/15 disabled:opacity-50"
          >
            🔥 Use today&apos;s trending keywords (Google Trends VN)
            <span className="mt-0.5 block text-xs font-normal text-muted">Top 10 searches in Vietnam right now, checked on Threads</span>
          </button>
          <div className="flex items-center gap-3 text-xs text-muted">
            <span className="h-px flex-1 bg-border" />
            or type your own
            <span className="h-px flex-1 bg-border" />
          </div>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={4}
            placeholder={"One keyword per line, e.g.\niPhone 17\nbão Ragasa\nSơn Tùng"}
            className="w-full resize-none rounded-xl border border-border bg-background px-4 py-2.5 text-sm outline-none focus:border-accent"
          />
          <div className="flex items-center justify-between gap-2">
            <span className={`text-xs ${keywords.length > MAX ? "text-red-500" : "text-muted"}`}>
              {keywords.length}/{MAX} keywords · ~10 s each
            </span>
            <button
              disabled={starting || !keywords.length || keywords.length > MAX}
              onClick={() => start({ keywords })}
              className="rounded-xl bg-accent px-4 py-2.5 text-sm font-bold text-white transition hover:opacity-90 disabled:opacity-50"
            >
              {starting ? "Starting…" : "Search Threads"}
            </button>
          </div>
          {error && <p className="text-sm text-red-500">{error}</p>}
          <p className="text-xs text-muted">
            Uses the account signed in at{" "}
            <Link href="/admin/threads" className="text-accent hover:underline">
              Threads → research account
            </Link>
            .
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-2 text-sm">
            <span className="font-semibold">
              {running
                ? `Searching… ${doneCount}/${job.items.length}`
                : job.status === "error"
                  ? "Stopped with an error"
                  : `Done — ${job.added} topic${job.added === 1 ? "" : "s"} added`}
            </span>
            <span className="text-xs text-muted">{job.source === "trends" ? "Google Trends VN" : "your keywords"}</span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-surface-2">
            <div
              className="h-full rounded-full bg-accent transition-all"
              style={{ width: `${job.items.length ? (doneCount / job.items.length) * 100 : 0}%` }}
            />
          </div>

          <ul className="max-h-[50vh] divide-y divide-border overflow-y-auto rounded-xl border border-border">
            {job.items.map((i) => {
              const st = STATE[i.state];
              return (
                <li key={i.keyword} className="px-3 py-2.5 text-sm">
                  <div className="flex items-start justify-between gap-2">
                    <span className="min-w-0">
                      <span className={`mr-2 inline-block w-3 text-center font-bold ${st.cls}`}>{st.icon}</span>
                      <span className="font-semibold">{i.keyword}</span>
                      {i.traffic && <span className="ml-1.5 text-xs text-muted">{i.traffic} searches</span>}
                    </span>
                    <span className={`shrink-0 text-xs ${st.cls}`}>{st.label}</span>
                  </div>
                  {(i.buzz !== undefined || i.reason) && (
                    <p className="ml-5 mt-0.5 text-xs text-muted">
                      {i.recentCount ? `${i.recentCount} posts in 72 h · engagement ${i.buzz?.toLocaleString("en-US")}` : ""}
                      {i.recentCount && i.reason ? " · " : ""}
                      {i.reason}
                    </p>
                  )}
                  {i.state === "added" && i.top?.[0] && (
                    <p className="ml-5 mt-0.5 line-clamp-1 text-xs text-muted">
                      @{i.top[0].username}: {i.top[0].text}
                    </p>
                  )}
                </li>
              );
            })}
          </ul>

          {job.aborted && <p className="text-sm text-amber-600 dark:text-amber-400">Stopped early: {job.aborted}</p>}
          {job.error && <p className="text-sm text-red-500">{job.error}</p>}
          {error && <p className="text-sm text-red-500">{error}</p>}

          <div className="flex justify-end gap-2">
            {!running && (
              <button
                onClick={() => {
                  setJob(null);
                  setText("");
                }}
                className="rounded-xl border border-border px-4 py-2 text-sm font-semibold hover:border-accent hover:text-accent"
              >
                New search
              </button>
            )}
            <button onClick={onClose} className="rounded-xl bg-accent px-4 py-2 text-sm font-bold text-white hover:opacity-90">
              {running ? "Run in background" : "Close"}
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}
