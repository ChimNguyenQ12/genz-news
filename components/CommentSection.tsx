"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import type { CommentMedia, CommentNode } from "@/lib/comments";
import type { PublicUser } from "@/lib/users";
import { mediaUrl } from "@/lib/media";

const MAX = 1500;
const ACCEPT = "image/jpeg,image/png,image/webp,image/gif,video/mp4,video/webm";

function initials(name: string) {
  return name.trim().slice(0, 1).toUpperCase() || "?";
}

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

/** Nút đính kèm + xem trước ảnh/video, dùng chung cho ô bình luận gốc và trả lời. */
function MediaAttach({
  media,
  uploading,
  error,
  onAttach,
  onRemove,
}: {
  media: CommentMedia | null;
  uploading: boolean;
  error: string;
  onAttach: (file: File) => void;
  onRemove: () => void;
}) {
  const input = useRef<HTMLInputElement>(null);

  if (media) {
    return (
      <div className="mt-2 inline-flex max-w-full items-start gap-2 rounded-xl border border-border bg-surface-2 p-1.5">
        {media.type === "image" ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={mediaUrl(media.url)} alt="" className="max-h-32 max-w-40 rounded-lg object-cover" />
        ) : (
          <video src={mediaUrl(media.url)} controls className="max-h-32 max-w-52 rounded-lg" />
        )}
        <button
          type="button"
          onClick={onRemove}
          aria-label="Bỏ đính kèm"
          className="shrink-0 rounded-full bg-black/60 px-1.5 py-0.5 text-xs font-bold text-white hover:bg-red-600"
        >
          ✕
        </button>
      </div>
    );
  }

  return (
    <div className="mt-2 flex items-center gap-2">
      <button
        type="button"
        onClick={() => input.current?.click()}
        disabled={uploading}
        className="flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-xs font-semibold text-muted transition hover:border-accent hover:text-accent disabled:opacity-50"
      >
        📎 {uploading ? "Đang tải lên..." : "Ảnh/video"}
      </button>
      {error && <span className="text-xs text-red-500">{error}</span>}
      <input
        ref={input}
        type="file"
        accept={ACCEPT}
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) onAttach(file);
          e.target.value = "";
        }}
      />
    </div>
  );
}

function CommentForm({
  value,
  onChange,
  media,
  uploading,
  mediaError,
  onAttach,
  onRemoveMedia,
  onSubmit,
  onCancel,
  pending,
  placeholder,
  compact,
}: {
  value: string;
  onChange: (v: string) => void;
  media: CommentMedia | null;
  uploading: boolean;
  mediaError: string;
  onAttach: (file: File) => void;
  onRemoveMedia: () => void;
  onSubmit: () => void;
  onCancel?: () => void;
  pending: boolean;
  placeholder: string;
  compact?: boolean;
}) {
  return (
    <div className={compact ? "mt-2" : ""}>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value.slice(0, MAX))}
        rows={compact ? 2 : 3}
        placeholder={placeholder}
        className="w-full resize-y rounded-xl border border-border bg-surface px-4 py-2.5 text-sm outline-none focus:border-accent"
      />
      <MediaAttach
        media={media}
        uploading={uploading}
        error={mediaError}
        onAttach={onAttach}
        onRemove={onRemoveMedia}
      />
      <div className="mt-2 flex items-center justify-between gap-2">
        <span className="text-xs text-muted">
          {value.length}/{MAX}
        </span>
        <div className="flex gap-2">
          {onCancel && (
            <button
              type="button"
              onClick={onCancel}
              className="rounded-lg border border-border px-3 py-1.5 text-xs font-semibold hover:border-accent"
            >
              Huỷ
            </button>
          )}
          <button
            type="button"
            onClick={onSubmit}
            disabled={pending || uploading || (!value.trim() && !media)}
            className="rounded-lg bg-accent px-4 py-1.5 text-xs font-bold text-white transition hover:opacity-90 disabled:opacity-40"
          >
            {pending ? "Đang gửi..." : "Gửi"}
          </button>
        </div>
      </div>
    </div>
  );
}

function CommentItem({
  comment,
  user,
  isReply,
  onReply,
  onDelete,
  busyId,
}: {
  comment: CommentNode;
  user: PublicUser | null;
  isReply?: boolean;
  onReply?: () => void;
  onDelete: (id: string) => void;
  busyId: string | null;
}) {
  const canDelete = user && (user.role === "admin" || user.id === comment.author.id);

  return (
    <div className="flex gap-3">
      <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full bg-surface-2 text-xs font-black text-muted">
        {initials(comment.author.displayName)}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-bold">{comment.author.displayName}</span>
          {comment.author.role === "admin" && (
            <span className="rounded-full bg-accent/10 px-2 py-0.5 text-[10px] font-bold text-accent">
              Quản trị
            </span>
          )}
          <span className="text-xs text-muted">{timeAgo(comment.createdAt)}</span>
        </div>

        {comment.body && (
          <p className="mt-1 whitespace-pre-wrap break-words text-[15px] leading-relaxed">
            {comment.body}
          </p>
        )}

        {comment.media && (
          <div className="mt-2">
            {comment.media.type === "image" ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={mediaUrl(comment.media.url)}
                alt=""
                loading="lazy"
                className="max-h-80 max-w-full rounded-xl border border-border object-contain"
              />
            ) : (
              <video
                src={mediaUrl(comment.media.url)}
                controls
                className="max-h-80 max-w-full rounded-xl border border-border"
              />
            )}
          </div>
        )}

        <div className="mt-1.5 flex items-center gap-4 text-xs font-semibold text-muted">
          {!isReply && user && onReply && (
            <button onClick={onReply} className="-my-2 py-2 hover:text-accent">
              Trả lời
            </button>
          )}
          {canDelete && (
            <button
              onClick={() => onDelete(comment.id)}
              disabled={busyId === comment.id}
              className="hover:text-red-500 disabled:opacity-40"
            >
              Xoá
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/** Đính kèm rỗng dùng chung để không phải viết lại object literal nhiều chỗ. */
const EMPTY_ATTACH = { media: null as CommentMedia | null, uploading: false, error: "" };

export default function CommentSection({
  articleId,
  initialComments,
  user,
}: {
  articleId: string;
  initialComments: CommentNode[];
  user: PublicUser | null;
}) {
  const [comments, setComments] = useState(initialComments);
  const [text, setText] = useState("");
  const [attach, setAttach] = useState(EMPTY_ATTACH);
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const [replyText, setReplyText] = useState("");
  const [replyAttach, setReplyAttach] = useState(EMPTY_ATTACH);
  const [pending, setPending] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState("");

  const total = comments.reduce((n, c) => n + 1 + c.replies.length, 0);

  async function upload(file: File, setState: typeof setAttach) {
    setState({ media: null, uploading: true, error: "" });
    const form = new FormData();
    form.append("file", file);
    const res = await fetch("/api/upload", { method: "POST", body: form });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setState({ media: null, uploading: false, error: data.error ?? "Tải lên thất bại" });
      return;
    }
    setState({
      media: { type: data.kind === "video" ? "video" : "image", url: data.url },
      uploading: false,
      error: "",
    });
  }

  async function send(body: string, media: CommentMedia | null, parentId: string | null) {
    setPending(true);
    setError("");
    const res = await fetch(`/api/articles/${articleId}/comments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body, media, parentId }),
    });
    setPending(false);

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "Gửi bình luận thất bại");
      return false;
    }

    const { comment, parentId: resolvedParent } = await res.json();
    if (resolvedParent) {
      setComments((prev) =>
        prev.map((c) =>
          c.id === resolvedParent ? { ...c, replies: [...c.replies, comment] } : c,
        ),
      );
    } else {
      setComments((prev) => [comment, ...prev]);
    }
    return true;
  }

  async function remove(id: string) {
    if (!confirm("Xoá bình luận này?")) return;
    setBusyId(id);
    setError("");
    const res = await fetch(`/api/comments/${id}`, { method: "DELETE" });
    setBusyId(null);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "Xoá thất bại");
      return;
    }
    setComments((prev) =>
      prev
        .filter((c) => c.id !== id)
        .map((c) => ({ ...c, replies: c.replies.filter((r) => r.id !== id) })),
    );
  }

  return (
    <section className="mt-14 border-t border-border pt-8">
      <h2 className="font-display text-xl font-black">
        Bình luận {total > 0 && <span className="text-muted">({total})</span>}
      </h2>

      {user ? (
        <div className="mt-4">
          <CommentForm
            value={text}
            onChange={setText}
            media={attach.media}
            uploading={attach.uploading}
            mediaError={attach.error}
            onAttach={(file) => void upload(file, setAttach)}
            onRemoveMedia={() => setAttach(EMPTY_ATTACH)}
            onSubmit={async () => {
              if (await send(text, attach.media, null)) {
                setText("");
                setAttach(EMPTY_ATTACH);
              }
            }}
            pending={pending}
            placeholder="Viết bình luận..."
          />
        </div>
      ) : (
        <p className="mt-4 rounded-xl border border-border bg-surface px-4 py-3 text-sm text-muted">
          <Link href="/dang-nhap" className="font-bold text-accent hover:underline">
            Đăng nhập
          </Link>{" "}
          để bình luận.
        </p>
      )}

      {error && <p className="mt-3 text-sm text-red-500">{error}</p>}

      {comments.length === 0 ? (
        <p className="mt-6 text-sm text-muted">Chưa có bình luận nào.</p>
      ) : (
        <div className="mt-6 space-y-6">
          {comments.map((c) => (
            <div key={c.id}>
              <CommentItem
                comment={c}
                user={user}
                onReply={() => {
                  setReplyTo(replyTo === c.id ? null : c.id);
                  setReplyText("");
                  setReplyAttach(EMPTY_ATTACH);
                }}
                onDelete={remove}
                busyId={busyId}
              />

              {replyTo === c.id && user && (
                <div className="ml-4 mt-2 sm:ml-11">
                  <CommentForm
                    value={replyText}
                    onChange={setReplyText}
                    media={replyAttach.media}
                    uploading={replyAttach.uploading}
                    mediaError={replyAttach.error}
                    onAttach={(file) => void upload(file, setReplyAttach)}
                    onRemoveMedia={() => setReplyAttach(EMPTY_ATTACH)}
                    onSubmit={async () => {
                      if (await send(replyText, replyAttach.media, c.id)) {
                        setReplyText("");
                        setReplyAttach(EMPTY_ATTACH);
                        setReplyTo(null);
                      }
                    }}
                    onCancel={() => setReplyTo(null)}
                    pending={pending}
                    placeholder={`Trả lời ${c.author.displayName}...`}
                    compact
                  />
                </div>
              )}

              {c.replies.length > 0 && (
                <div className="ml-4 mt-4 space-y-4 border-l-2 border-border pl-3 sm:ml-11 sm:pl-4">
                  {c.replies.map((r) => (
                    <CommentItem
                      key={r.id}
                      comment={r}
                      user={user}
                      isReply
                      onDelete={remove}
                      busyId={busyId}
                    />
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
