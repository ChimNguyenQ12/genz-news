"use client";

import { useState } from "react";
import Link from "next/link";
import type { CommentNode } from "@/lib/comments";
import { mediaUrl } from "@/lib/media";
import Modal from "./Modal";

/**
 * Quản lý bình luận của MỘT bài, sống ngay trong trang sửa bài (chỉ admin
 * thấy — trang public đã tự chặn xoá bình luận của người khác ở
 * lib/comments.ts:deleteComment, component này chỉ thêm chỗ NHÌN THẤY và
 * XOÁ được tất cả mà không phải mở từng bài công khai).
 *
 * Không có API riêng: dùng lại đúng GET /api/articles/:id/comments và
 * DELETE /api/comments/:id mà trang public đã có — server đã cho admin xoá
 * bình luận của bất kỳ ai, ở đây chỉ cần hiện nút cho mọi bình luận.
 */

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.round(diff / 60000);
  if (m < 1) return "vừa xong";
  if (m < 60) return `${m} phút trước`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} giờ trước`;
  const d = Math.round(h / 24);
  if (d < 30) return `${d} ngày trước`;
  return new Date(iso).toLocaleDateString("vi-VN");
}

function Row({
  comment,
  isReply,
  onDelete,
  busyId,
}: {
  comment: CommentNode;
  isReply?: boolean;
  onDelete: (c: CommentNode) => void;
  busyId: string | null;
}) {
  return (
    <div className={`flex gap-2.5 rounded-xl border border-border bg-background p-3 ${isReply ? "ml-6" : ""}`}>
      <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-surface-2 text-[11px] font-black text-muted">
        {comment.author.displayName.trim().slice(0, 1).toUpperCase() || "?"}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5 text-xs">
          <span className="font-bold">{comment.author.displayName}</span>
          {comment.author.role === "admin" && (
            <span className="rounded-full bg-accent/10 px-1.5 py-0.5 text-[10px] font-bold text-accent">Quản trị</span>
          )}
          <span className="text-muted">{timeAgo(comment.createdAt)}</span>
        </div>
        {comment.body && <p className="mt-1 whitespace-pre-wrap break-words text-sm">{comment.body}</p>}
        {comment.media &&
          (comment.media.type === "image" ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={mediaUrl(comment.media.url)} alt="" className="mt-1.5 max-h-32 rounded-lg border border-border" />
          ) : (
            <video src={mediaUrl(comment.media.url)} controls className="mt-1.5 max-h-32 rounded-lg border border-border" />
          ))}
      </div>
      <button
        onClick={() => onDelete(comment)}
        disabled={busyId === comment.id}
        className="h-fit shrink-0 rounded-lg border border-red-500/40 px-2.5 py-1 text-xs font-semibold text-red-600 hover:bg-red-500/10 disabled:opacity-40"
      >
        Xoá
      </button>
    </div>
  );
}

export default function CommentModerationPanel({ articleId, slug }: { articleId: string; slug: string }) {
  const [open, setOpen] = useState(false);
  const [comments, setComments] = useState<CommentNode[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [confirmTarget, setConfirmTarget] = useState<CommentNode | null>(null);

  const total = (comments ?? []).reduce((n, c) => n + 1 + c.replies.length, 0);

  const load = async () => {
    setLoading(true);
    setError("");
    const res = await fetch(`/api/articles/${articleId}/comments`);
    setLoading(false);
    if (!res.ok) {
      setError("Không tải được danh sách bình luận.");
      return;
    }
    const { comments } = await res.json();
    setComments(comments);
  };

  const toggle = () => {
    const next = !open;
    setOpen(next);
    if (next && comments === null) void load();
  };

  const remove = async (c: CommentNode) => {
    setBusyId(c.id);
    setError("");
    const res = await fetch(`/api/comments/${c.id}`, { method: "DELETE" });
    setBusyId(null);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "Xoá thất bại.");
      return;
    }
    setComments((prev) =>
      (prev ?? [])
        .filter((r) => r.id !== c.id)
        .map((r) => ({ ...r, replies: r.replies.filter((x) => x.id !== c.id) })),
    );
  };

  return (
    <div className="rounded-2xl border border-border bg-surface p-4">
      <button
        type="button"
        onClick={toggle}
        className="flex w-full items-center justify-between text-left"
      >
        <span className="text-xs font-bold uppercase tracking-wide text-muted">
          Bình luận{comments !== null && ` (${total})`}
        </span>
        <span className="text-xs text-muted">{open ? "Thu gọn ▲" : "Xem ▾"}</span>
      </button>

      {open && (
        <div className="mt-3 space-y-2">
          {loading && <p className="text-sm text-muted">Đang tải...</p>}
          {error && <p className="text-sm text-red-500">{error}</p>}
          {!loading && comments?.length === 0 && (
            <p className="text-sm text-muted">Bài chưa có bình luận nào.</p>
          )}
          {comments?.map((c) => (
            <div key={c.id} className="space-y-2">
              <Row comment={c} onDelete={setConfirmTarget} busyId={busyId} />
              {c.replies.map((r) => (
                <Row key={r.id} comment={r} isReply onDelete={setConfirmTarget} busyId={busyId} />
              ))}
            </div>
          ))}
          {comments && comments.length > 0 && (
            <p className="pt-1 text-xs text-muted">
              Xem đầy đủ ngoài trang công khai:{" "}
              <Link href={`/bai-viet/${slug}`} target="_blank" className="text-accent hover:underline">
                mở bài viết ↗
              </Link>
            </p>
          )}
        </div>
      )}

      <Modal
        open={!!confirmTarget}
        title="Xoá bình luận?"
        onClose={() => setConfirmTarget(null)}
      >
        {confirmTarget && (
          <div className="space-y-4 text-sm">
            <p>
              Xoá bình luận của <strong>{confirmTarget.author.displayName}</strong>
              {confirmTarget.replies.length > 0 && (
                <>
                  {" "}
                  và <strong>{confirmTarget.replies.length}</strong> trả lời bên dưới nó
                </>
              )}
              . Không hoàn tác được.
            </p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setConfirmTarget(null)}
                className="rounded-xl border border-border px-4 py-2 text-xs font-semibold hover:bg-surface-2"
              >
                Thôi
              </button>
              <button
                autoFocus
                onClick={() => {
                  const target = confirmTarget;
                  setConfirmTarget(null);
                  if (target) void remove(target);
                }}
                className="rounded-xl bg-red-600 px-5 py-2 text-xs font-bold text-white shadow hover:bg-red-700"
              >
                Xoá
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
