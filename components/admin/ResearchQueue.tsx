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

  async function convert(id: string) {
    setBusy(id);
    setError("");
    const res = await fetch(`/api/admin/requests/${id}/convert`, { method: "POST" });
    setBusy(null);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "Tạo bài thất bại");
      return;
    }
    const { article } = await res.json();
    router.push(`/admin/articles/${article.id}`);
  }

  const pendingCount = requests.filter((r) => r.status === "pending").length;

  return (
    <div>
      <div className="mb-6">
        <h1 className="font-display text-2xl font-black">Đặt đề tài</h1>
        <div className="mt-2 max-w-2xl space-y-2 text-sm text-muted">
          <p>
            <strong className="text-foreground">Cách 1 — tự viết:</strong> bấm{" "}
            <strong className="text-foreground">Tạo bài</strong> ở đề tài bất kỳ. Hệ
            thống tạo sẵn bản nháp, đưa các link vào mục nguồn tham khảo, bạn viết nội
            dung.
          </p>
          <p>
            <strong className="text-foreground">Cách 2 — nhờ AI tổng hợp:</strong> mở
            Claude Code trong thư mục dự án rồi nói{" "}
            <code className="rounded bg-surface-2 px-1.5 py-0.5 text-xs">
              xử lý hàng đợi đề tài
            </code>
            . AI sẽ tìm nguồn trên web, đối chiếu, viết thành bản nháp cho bạn duyệt.
          </p>
        </div>
      </div>

      <form
        onSubmit={submit}
        className="mb-8 space-y-3 rounded-2xl border border-border bg-surface p-5"
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
            Ghi chú cho phóng viên
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
          className="rounded-xl bg-accent px-5 py-2.5 text-sm font-bold text-white transition hover:opacity-90 disabled:opacity-50"
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
                <div className="flex shrink-0 flex-wrap items-center gap-2">
                  {r.articleIds && r.articleIds.length > 0 ? (
                    <a
                      href={`/admin/articles/${r.articleIds[r.articleIds.length - 1]}`}
                      className="rounded-lg border border-border px-3 py-1.5 text-xs font-semibold hover:border-accent hover:text-accent"
                    >
                      Mở bài nháp →
                    </a>
                  ) : (
                    <button
                      onClick={() => convert(r.id)}
                      disabled={busy === r.id}
                      title="Tạo bản nháp từ đề tài này, kèm sẵn các link làm nguồn"
                      className="rounded-lg bg-accent px-3 py-1.5 text-xs font-bold text-white transition hover:opacity-90 disabled:opacity-50"
                    >
                      {busy === r.id ? "Đang tạo..." : "Tạo bài"}
                    </button>
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
