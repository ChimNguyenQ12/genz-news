"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { ResearchRequest } from "@/lib/queue";

const STATUS_LABEL: Record<ResearchRequest["status"], string> = {
  pending: "Chờ xử lý",
  in_progress: "Đang làm",
  done: "Đã có nháp",
  rejected: "Bỏ qua",
};

const STATUS_STYLE: Record<ResearchRequest["status"], string> = {
  pending: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  in_progress: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
  done: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  rejected: "bg-neutral-500/10 text-neutral-500",
};

export default function ResearchQueue({ requests }: { requests: ResearchRequest[] }) {
  const router = useRouter();
  const [topic, setTopic] = useState("");
  const [urls, setUrls] = useState("");
  const [notes, setNotes] = useState("");
  const [pending, setPending] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!topic.trim()) return;
    setPending(true);
    await fetch("/api/admin/requests", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ topic, urls, notes }),
    });
    setTopic("");
    setUrls("");
    setNotes("");
    setPending(false);
    router.refresh();
  }

  async function remove(id: string) {
    if (!confirm("Xoá đề tài này?")) return;
    await fetch(`/api/admin/requests/${id}`, { method: "DELETE" });
    router.refresh();
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
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "Giao bài thất bại");
      return;
    }
    const data = await res.json();
    // Nhờ AI thì không có bài ngay — nó cần vài phút để tìm nguồn và viết.
    if (data.queued) {
      setNotice(data.message ?? "Đã giao cho AI.");
      router.refresh();
      return;
    }
    router.push(`/admin/articles/${data.article.id}`);
  }

  const pendingCount = requests.filter((r) => r.status === "pending").length;

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
            phút; xong bài sẽ nằm ở mục <strong className="text-foreground">chờ
              duyệt</strong> để bạn đọc và quyết định đăng hay không.
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
            Link nguồn gợi ý <span className="font-normal normal-case">(không bắt buộc)</span>
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
          disabled={pending || !topic.trim()}
          className="w-full rounded-xl bg-accent px-5 py-2.5 text-sm font-bold text-white transition hover:opacity-90 disabled:opacity-50 sm:w-auto"
        >
          {pending ? "Đang gửi..." : "Gửi đề tài"}
        </button>
      </form>

      <h2 className="mb-3 font-display text-lg font-black">
        Hàng đợi{" "}
        {pendingCount > 0 && (
          <span className="text-sm font-semibold text-muted">
            ({pendingCount} chờ xử lý)
          </span>
        )}
      </h2>

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

      {requests.length === 0 ? (
        <p className="rounded-2xl border border-border bg-surface p-8 text-center text-sm text-muted">
          Chưa có đề tài nào.
        </p>
      ) : (
        <div className="space-y-2">
          {requests.map((r) => (
            <div key={r.id} className="rounded-2xl border border-border bg-surface p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${STATUS_STYLE[r.status]}`}
                    >
                      {STATUS_LABEL[r.status]}
                    </span>
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
                  {r.reporterNote && (
                    <p className="mt-2 rounded-lg bg-surface-2 p-2 text-xs text-muted">
                      <strong>Phóng viên:</strong> {r.reporterNote}
                    </p>
                  )}
                </div>
                <div className="flex w-full shrink-0 flex-wrap items-center gap-2 [&>*]:flex-1 sm:w-auto sm:[&>*]:flex-none">
                  {r.articleIds && r.articleIds.length > 0 ? (
                    <a
                      href={`/admin/articles/${r.articleIds[r.articleIds.length - 1]}`}
                      className="rounded-lg border border-border px-3 py-1.5 text-xs font-semibold hover:border-accent hover:text-accent"
                    >
                      Mở bài nháp →
                    </a>
                  ) : (
                    <>
                      <button
                        onClick={() => convert(r.id, "ai")}
                        disabled={busy === r.id || r.status === "in_progress"}
                        title="AI tìm nguồn, đối chiếu rồi tổng hợp thành bài hoàn chỉnh"
                        className="rounded-lg bg-accent px-3 py-1.5 text-xs font-bold text-white transition hover:opacity-90 disabled:opacity-50"
                      >
                        {busy === r.id
                          ? "Assigning..."
                          : r.status === "in_progress"
                            ? "Creating..."
                            : "Create Post"}
                      </button>
                      <button
                        onClick={() => convert(r.id, "manual")}
                        disabled={busy === r.id}
                        title="Chỉ dựng bản nháp trống kèm sẵn link nguồn, để tự viết"
                        className="rounded-lg border border-border px-3 py-1.5 text-xs font-semibold hover:border-accent hover:text-accent disabled:opacity-50"
                      >
                        Nháp trống
                      </button>
                    </>
                  )}
                  <button
                    onClick={() => remove(r.id)}
                    className="rounded-lg border border-border px-3 py-1.5 text-xs font-semibold text-red-500 hover:border-red-500"
                  >
                    Xoá
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
