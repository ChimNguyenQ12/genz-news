"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { NOTIFICATION_META, timeAgo, type NotificationItem } from "@/components/admin/notificationMeta";

/** Hỏi số chưa đọc bao lâu một lần. Chỉ là một lệnh COUNT, rẻ. */
const POLL_MS = 30_000;

/**
 * Chuông thông báo trên thanh điều hướng /admin.
 *
 * Hỏi số chưa đọc mỗi 30 giây (tạm dừng khi tab bị ẩn), mở ra thì tải 8 thông
 * báo mới nhất. Đầy đủ ở /admin/activity.
 */
export default function NotificationBell({
  align = "right",
}: {
  /** Bung bảng thông báo về phía nào — "left" khi chuông nằm ở thanh bên trái. */
  align?: "left" | "right";
}) {
  const router = useRouter();
  const [unread, setUnread] = useState(0);
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<NotificationItem[] | null>(null);
  const [error, setError] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  const poll = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/notifications?count=1", { cache: "no-store" });
      if (!res.ok) return;
      const data = await res.json();
      setUnread(data.unread ?? 0);
    } catch {
      // mất mạng thoáng qua — lần sau hỏi lại
    }
  }, []);

  useEffect(() => {
    const first = setTimeout(poll, 0);
    const t = setInterval(() => {
      if (document.visibilityState === "visible") void poll();
    }, POLL_MS);
    const onVisible = () => document.visibilityState === "visible" && void poll();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearTimeout(first);
      clearInterval(t);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [poll]);

  // Đóng khi bấm ra ngoài hoặc nhấn Esc.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  async function toggle() {
    const next = !open;
    setOpen(next);
    if (!next) return;
    setError(false);
    try {
      const res = await fetch("/api/admin/notifications?perPage=8", { cache: "no-store" });
      if (!res.ok) throw new Error();
      const data = await res.json();
      setItems(data.items);
      setUnread(data.unread);
    } catch {
      setError(true);
    }
  }

  async function markAll() {
    const res = await fetch("/api/admin/notifications", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ all: true }),
    });
    if (!res.ok) return;
    setUnread(0);
    setItems((list) => list?.map((n) => ({ ...n, read: true })) ?? null);
  }

  async function openItem(n: NotificationItem) {
    setOpen(false);
    if (!n.read) {
      setUnread((u) => Math.max(0, u - 1));
      void fetch("/api/admin/notifications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: [n.id] }),
      });
    }
    router.push(n.link ?? "/admin/activity");
  }

  return (
    <div ref={box} className="relative">
      <button
        type="button"
        onClick={toggle}
        aria-label={unread ? `Notifications (${unread} unread)` : "Notifications"}
        aria-expanded={open}
        className="relative grid size-9 place-items-center rounded-lg text-foreground/70 transition hover:bg-surface-2"
      >
        <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
          <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
        </svg>
        {unread > 0 && (
          <span className="absolute -right-0.5 -top-0.5 grid min-w-[18px] place-items-center rounded-full bg-red-500 px-1 text-[10px] font-bold leading-[18px] text-white">
            {unread > 99 ? "99+" : unread}
          </span>
        )}
      </button>

      {open && (
        <div
          className={`fixed inset-x-3 top-16 z-50 overflow-hidden rounded-2xl border border-border bg-surface shadow-xl sm:absolute sm:inset-x-auto sm:top-11 sm:w-96 ${
            align === "left" ? "sm:left-0" : "sm:right-0"
          }`}
        >
          <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
            <span className="text-sm font-bold">Notifications</span>
            {unread > 0 && (
              <button onClick={markAll} className="text-xs font-semibold text-accent hover:underline">
                Mark all read
              </button>
            )}
          </div>

          <div className="max-h-[60vh] overflow-y-auto">
            {error && <p className="p-4 text-sm text-red-500">Could not load notifications.</p>}
            {!error && !items && <p className="p-4 text-sm text-muted">Loading…</p>}
            {items && !items.length && (
              <p className="p-6 text-center text-sm text-muted">Nothing yet.</p>
            )}
            {items?.map((n) => {
              const meta = NOTIFICATION_META[n.type];
              return (
                <button
                  key={n.id}
                  onClick={() => openItem(n)}
                  className={`flex w-full gap-3 border-b border-border px-4 py-3 text-left transition last:border-0 hover:bg-surface-2 ${
                    n.read ? "opacity-60" : ""
                  }`}
                >
                  <span className={`mt-0.5 grid size-7 shrink-0 place-items-center rounded-full text-sm ${meta.cls(n.level)}`} aria-hidden>
                    {meta.icon}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="line-clamp-2 text-sm font-semibold">
                      {n.title}
                      {n.count > 1 && (
                        <span className="ml-1.5 rounded-full bg-accent/10 px-1.5 text-xs text-accent">×{n.count}</span>
                      )}
                    </span>
                    {n.body && <span className="mt-0.5 line-clamp-2 block text-xs text-muted">{n.body}</span>}
                    <span className="mt-1 block text-[11px] text-muted">{timeAgo(n.updatedAt)}</span>
                  </span>
                  {!n.read && <span className="mt-2 size-2 shrink-0 rounded-full bg-accent" aria-label="unread" />}
                </button>
              );
            })}
          </div>

          <Link
            href="/admin/activity"
            onClick={() => setOpen(false)}
            className="block border-t border-border px-4 py-2.5 text-center text-sm font-semibold text-accent hover:bg-surface-2"
          >
            See all activity →
          </Link>
        </div>
      )}
    </div>
  );
}
