"use client";

import { useEffect } from "react";

/**
 * Hộp thoại dùng chung cho khu quản trị.
 *
 * Có mặt vì màn hình Research chỉ nên bày một thứ: hàng đợi. Công tắc tự động
 * và ô đặt đề tài là việc thỉnh thoảng mới làm, để chình ình trên đầu thì mỗi
 * lần vào phải cuộn qua chúng mới tới phần cần xem.
 */
export default function Modal({
  open,
  title,
  onClose,
  children,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  // Esc để đóng, và khoá cuộn nền: mở hộp thoại rồi lăn chuột mà trang phía
  // sau chạy là cảm giác hỏng.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4 py-8 backdrop-blur-sm"
      onClick={onClose}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        // Bấm bên trong không được đóng — chỉ bấm ra nền mới đóng.
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-2xl rounded-2xl border border-border bg-background shadow-2xl"
      >
        <div className="flex items-center justify-between gap-3 border-b border-border px-5 py-3.5">
          <h2 className="font-display text-base font-black">{title}</h2>
          <button
            onClick={onClose}
            aria-label="Close"
            className="rounded-lg px-2.5 py-1 text-lg leading-none text-muted transition hover:bg-surface-2 hover:text-foreground"
          >
            ×
          </button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}
