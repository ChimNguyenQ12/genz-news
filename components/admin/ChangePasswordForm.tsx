"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

const inputCls =
  "w-full rounded-xl border border-border bg-surface px-4 py-2.5 text-sm outline-none focus:border-accent";

export default function ChangePasswordForm() {
  const router = useRouter();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setMessage("");

    if (newPassword !== confirm) {
      setError("The two new passwords do not match.");
      return;
    }

    setPending(true);
    const res = await fetch("/api/auth/password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ currentPassword, newPassword }),
    });
    setPending(false);

    if (res.ok) {
      setMessage("Password changed.");
      setCurrentPassword("");
      setNewPassword("");
      setConfirm("");
      router.refresh();
    } else {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "Could not change the password.");
    }
  }

  return (
    <form onSubmit={onSubmit} className="mt-3 space-y-3">
      <input
        type="password"
        value={currentPassword}
        onChange={(e) => setCurrentPassword(e.target.value)}
        placeholder="Current password"
        autoComplete="current-password"
        className={inputCls}
      />
      <input
        type="password"
        value={newPassword}
        onChange={(e) => setNewPassword(e.target.value)}
        placeholder="New password (at least 8 characters)"
        autoComplete="new-password"
        className={inputCls}
      />
      <input
        type="password"
        value={confirm}
        onChange={(e) => setConfirm(e.target.value)}
        placeholder="Repeat the new password"
        autoComplete="new-password"
        className={inputCls}
      />
      {error && <p className="text-sm text-red-500">{error}</p>}
      {message && (
        <p className="text-sm text-emerald-600 dark:text-emerald-400">{message}</p>
      )}
      <button
        type="submit"
        disabled={pending || !currentPassword || !newPassword}
        className="w-full rounded-xl bg-accent px-5 py-2.5 text-sm font-bold text-white transition hover:opacity-90 disabled:opacity-50 sm:w-auto"
      >
        {pending ? "Saving..." : "Change password"}
      </button>
    </form>
  );
}
