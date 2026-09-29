"use client";

/**
 * Đọc/ghi vài giá trị nhỏ trong localStorage của trình duyệt — dùng chung cho
 * nút đánh giá và ô nick khi bình luận.
 *
 * Vì sao cần một "store" tử tế chứ không gọi localStorage trong useEffect:
 * đọc xong rồi setState trong effect là một vòng render thừa, và eslint của dự
 * án báo lỗi (react-hooks/set-state-in-effect). useSyncExternalStore là đúng
 * công cụ cho việc đọc một nguồn ngoài React: nó tự dùng giá trị mặc định lúc
 * SSR/hydrate rồi cập nhật sau, nên không lệch hydration.
 *
 * Mọi hàm ở đây đều nuốt lỗi: trình duyệt chặn localStorage (chế độ riêng tư,
 * iframe bị hạn chế) thì coi như không có gì được nhớ — không được làm vỡ trang.
 */

const listeners = new Set<() => void>();

export function subscribeLocalPref(onChange: () => void): () => void {
  listeners.add(onChange);
  return () => {
    listeners.delete(onChange);
  };
}

export function readLocalPref(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function writeLocalPref(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
    for (const fn of listeners) fn();
  } catch {
    /* không ghi được thì thôi */
  }
}
