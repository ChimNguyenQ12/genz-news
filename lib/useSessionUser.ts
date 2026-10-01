"use client";

import { useSyncExternalStore } from "react";
import type { PublicUser } from "@/lib/users";

/**
 * Người đang xem trang, hỏi từ trình duyệt qua /api/auth/me.
 *
 * Trang công khai cố ý KHÔNG đọc phiên đăng nhập ở máy chủ: đọc cookie là Next
 * phải dựng lại trang cho từng người, không cache được. Thay vào đó trang hiện
 * ra như cho khách, rồi phần nào cần biết người xem (header, bình luận, đếm
 * lượt đọc) dùng hook này.
 *
 * Mọi component dùng chung MỘT lần hỏi mỗi lượt tải trang (giữ trong bộ nhớ
 * module, sống qua cả các lần chuyển trang phía client).
 */

export interface SessionState {
  /** false cho tới khi có câu trả lời — trong lúc đó coi như khách. */
  ready: boolean;
  user: PublicUser | null;
}

const SERVER: SessionState = { ready: false, user: null };
let state: SessionState = SERVER;
let started = false;
const listeners = new Set<() => void>();

function set(next: SessionState) {
  state = next;
  for (const l of listeners) l();
}

function load() {
  if (started) return;
  started = true;
  fetch("/api/auth/me", { cache: "no-store", credentials: "same-origin" })
    .then((r) => (r.ok ? r.json() : { user: null }))
    .then((d: { user?: PublicUser | null }) => set({ ready: true, user: d.user ?? null }))
    .catch(() => set({ ready: true, user: null }));
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  load();
  return () => listeners.delete(cb);
}

/** Hỏi lại — sau khi đăng nhập/đăng xuất mà không tải lại trang. */
export function refreshSessionUser() {
  started = false;
  load();
}

export function useSessionUser(): SessionState {
  return useSyncExternalStore(subscribe, () => state, () => SERVER);
}
