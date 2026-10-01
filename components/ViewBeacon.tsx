"use client";

import { useEffect } from "react";
import { useSessionUser } from "@/lib/useSessionUser";

/** Mỗi tab chỉ đếm một lần cho mỗi bài trong khoảng này (F5 liên tục không tính). */
const DEDUPE_MS = 30 * 60_000;
/** Ở lại ít nhất bấy lâu mới tính là "đọc" — bấm nhầm rồi quay ra thì không. */
const DELAY_MS = 5_000;

/**
 * Gửi một lượt đọc cho bài. Không hiển thị gì.
 *
 * Trang bài là ISR nên máy chủ không thấy từng lượt tải; beacon này là cách
 * đếm. Chống đếm lặp nằm ở sessionStorage — chỉ trong tab này, không dựng hồ sơ
 * gì (xem lib/views.ts). Con số vì vậy là ước lượng, đủ để so bài với bài.
 */
export default function ViewBeacon({ articleId }: { articleId: string }) {
  // Chờ biết người xem là ai: admin mở bài để kiểm tra thì không tính lượt đọc.
  const { ready, user } = useSessionUser();
  const skip = !ready || user?.role === "admin";

  useEffect(() => {
    if (skip) return;
    const key = `genz-view:${articleId}`;
    try {
      const last = Number(sessionStorage.getItem(key));
      if (last && Date.now() - last < DEDUPE_MS) return;
    } catch {
      // Trình duyệt chặn storage: vẫn đếm, chấp nhận lặp.
    }

    const timer = setTimeout(() => {
      try {
        sessionStorage.setItem(key, String(Date.now()));
      } catch {}
      fetch(`/api/articles/${articleId}/view`, { method: "POST", keepalive: true }).catch(() => {});
    }, DELAY_MS);
    return () => clearTimeout(timer);
  }, [articleId, skip]);

  return null;
}
