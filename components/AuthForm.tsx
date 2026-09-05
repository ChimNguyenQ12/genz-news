"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

const inputCls =
  "w-full rounded-xl border border-border bg-surface px-4 py-2.5 text-sm outline-none focus:border-accent";

export default function AuthForm({ mode }: { mode: "login" | "register" }) {
  const router = useRouter();
  const isRegister = mode === "register";

  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    setError("");

    const res = await fetch(isRegister ? "/api/auth/register" : "/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(
        isRegister ? { username, password, displayName } : { username, password },
      ),
    });

    if (res.ok) {
      router.replace("/admin");
      router.refresh();
    } else {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "Có lỗi xảy ra");
      setPending(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <input
        value={username}
        onChange={(e) => setUsername(e.target.value)}
        placeholder="Tên đăng nhập"
        autoComplete="username"
        className={inputCls}
      />
      {isRegister && (
        <input
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          placeholder="Tên hiển thị (đứng tên bài viết)"
          autoComplete="name"
          className={inputCls}
        />
      )}
      <input
        type="password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        placeholder={isRegister ? "Mật khẩu (tối thiểu 8 ký tự)" : "Mật khẩu"}
        autoComplete={isRegister ? "new-password" : "current-password"}
        className={inputCls}
      />
      {error && <p className="text-sm text-red-500">{error}</p>}
      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-xl bg-accent px-4 py-2.5 text-sm font-bold text-white transition hover:opacity-90 disabled:opacity-50"
      >
        {pending
          ? isRegister
            ? "Đang tạo tài khoản..."
            : "Đang đăng nhập..."
          : isRegister
            ? "Tạo tài khoản"
            : "Đăng nhập"}
      </button>
    </form>
  );
}
