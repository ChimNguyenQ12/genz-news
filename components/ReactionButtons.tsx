"use client";

import { useState, useSyncExternalStore } from "react";
import { readLocalPref, subscribeLocalPref, writeLocalPref } from "@/lib/localPref";

type Reaction = "like" | "dislike";

/** Khoá nhớ "máy này đã đánh giá bài này rồi" — chỉ nằm ở trình duyệt. */
const storageKey = (articleId: string) => `genz-react:v1:${articleId}`;

/**
 * Hai nút đánh giá nhỏ dưới mỗi bài.
 *
 * Không cần đăng nhập: máy chủ chỉ cộng thêm 1 vào cột đếm. Đổi lại, việc chặn
 * bấm lặp nằm hoàn toàn ở TRÌNH DUYỆT (localStorage) — xoá dữ liệu trình duyệt
 * hoặc mở trình duyệt khác là bấm lại được. Đây là chủ ý, không phải thiếu sót:
 * muốn chặn thật thì phải lưu IP (trái trang Quyền riêng tư) hoặc bắt đăng nhập
 * (mất phần lớn lượt bấm). Vì vậy con số là thăm dò ý kiến.
 *
 * Mỗi máy chỉ đánh giá một lần cho mỗi bài và không đổi ý được — đổi ý thì phải
 * trừ số đã cộng, mà API cố tình chỉ biết cộng.
 */
export default function ReactionButtons({
  articleId,
  initialLikes,
  initialDislikes,
}: {
  articleId: string;
  initialLikes: number;
  initialDislikes: number;
}) {
  const [likes, setLikes] = useState(initialLikes);
  const [dislikes, setDislikes] = useState(initialDislikes);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  // Đã bấm gì ở máy này (chưa bấm = null). Đọc qua useSyncExternalStore: lúc
  // SSR trả về null, sau khi hydrate mới đọc localStorage — không lệch hydration.
  const mine = useSyncExternalStore(
    subscribeLocalPref,
    () => readLocalPref(storageKey(articleId)),
    () => null,
  );

  async function react(type: Reaction) {
    if (mine || pending) return;
    setPending(true);
    setError("");
    try {
      const res = await fetch(`/api/articles/${articleId}/react`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Không gửi được đánh giá");
        return;
      }
      setLikes(data.likeCount);
      setDislikes(data.dislikeCount);
      // Nhớ ở máy này; không nhớ được thì lần sau bấm lại cũng chỉ cộng thêm 1.
      writeLocalPref(storageKey(articleId), type);
    } catch {
      setError("Không kết nối được. Thử lại sau.");
    } finally {
      setPending(false);
    }
  }

  const base =
    "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-bold transition disabled:opacity-60";

  return (
    <div className="mt-8 flex flex-wrap items-center gap-2.5">
      <span className="text-xs font-semibold text-muted">Bài này hữu ích?</span>

      <button
        type="button"
        onClick={() => void react("like")}
        disabled={pending || mine !== null}
        aria-pressed={mine === "like"}
        aria-label={`Hữu ích (${likes} lượt)`}
        className={`${base} ${
          mine === "like"
            ? "border-accent bg-accent/10 text-accent"
            : "border-border text-muted hover:border-accent hover:text-accent"
        }`}
      >
        <span aria-hidden>👍</span>
        <span className="tabular-nums">{likes}</span>
      </button>

      <button
        type="button"
        onClick={() => void react("dislike")}
        disabled={pending || mine !== null}
        aria-pressed={mine === "dislike"}
        aria-label={`Chưa hay (${dislikes} lượt)`}
        className={`${base} ${
          mine === "dislike"
            ? "border-accent bg-accent/10 text-accent"
            : "border-border text-muted hover:border-accent hover:text-accent"
        }`}
      >
        <span aria-hidden>👎</span>
        <span className="tabular-nums">{dislikes}</span>
      </button>

      {mine && <span className="text-xs text-muted">Cảm ơn bạn đã đánh giá.</span>}
      {error && <span className="text-xs text-red-500">{error}</span>}
    </div>
  );
}
