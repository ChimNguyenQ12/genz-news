"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

interface Status {
  connected: boolean;
  username?: string;
  savedAt?: string;
  method?: "login" | "cookie";
  expiresAt?: string;
  lastCheck?: { at: string; ok: boolean; message: string };
}

type Result =
  | { state: "ok"; username?: string; message?: string }
  | { state: "code"; flowId: string; message: string }
  | { state: "error"; message: string };

const fieldClass =
  "w-full rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent";

const when = (iso?: string) =>
  iso
    ? new Date(iso).toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh", dateStyle: "short", timeStyle: "short" })
    : "—";

async function call(init: RequestInit) {
  const res = await fetch("/api/admin/threads-session", {
    ...init,
    headers: { "Content-Type": "application/json", ...init.headers },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Error ${res.status}`);
  return data;
}

/**
 * Tài khoản threads.com mà bước research (collect-trends) dùng để đọc trang
 * tìm kiếm. Mật khẩu chỉ đi một lượt lên máy chủ để đăng nhập, không được lưu;
 * máy chủ chỉ giữ cookie phiên.
 */
export default function ThreadsAccountPanel() {
  const [status, setStatus] = useState<Status | null>(null);
  const [open, setOpen] = useState(false);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [flow, setFlow] = useState<{ id: string; message: string } | null>(null);
  const [cookieMode, setCookieMode] = useState(false);
  const [cookie, setCookie] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ text: string; ok: boolean } | null>(null);

  useEffect(() => {
    const t = setTimeout(() => {
      call({ method: "GET" })
        .then(setStatus)
        .catch(() => setStatus({ connected: false }));
    }, 0);
    return () => clearTimeout(t);
  }, []);

  function handle(data: { result: Result; status: Status }) {
    setStatus(data.status);
    const r = data.result;
    if (r.state === "code") {
      setFlow({ id: r.flowId, message: r.message });
      setNotice({ text: r.message, ok: true });
      return;
    }
    setFlow(null);
    setCode("");
    if (r.state === "ok") {
      setPassword("");
      setCookie("");
      setOpen(false);
      setNotice({ text: r.message ?? "Đã lưu phiên Threads.", ok: true });
    } else {
      setNotice({ text: r.message, ok: false });
    }
  }

  async function run(label: string, init: RequestInit) {
    setBusy(label);
    setNotice(null);
    try {
      handle(await call(init));
    } catch (e) {
      setNotice({ text: (e as Error).message, ok: false });
    } finally {
      setBusy(null);
    }
  }

  async function logout() {
    if (!confirm("Xoá phiên Threads đang lưu? Bước research Threads sẽ chạy không đăng nhập.")) return;
    setBusy("logout");
    try {
      setStatus(await call({ method: "DELETE" }));
      setNotice({ text: "Đã xoá phiên.", ok: true });
    } finally {
      setBusy(null);
    }
  }

  const s = status;

  return (
    <section className="mb-6 rounded-2xl border border-border bg-surface p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="font-bold">🧵 Threads account for research</h2>
          <p className="mt-0.5 text-sm text-muted">
            Used by the daily trend collector to search threads.com — results land in{" "}
            <Link href="/admin/research" className="text-accent hover:underline">
              Research → Threads
            </Link>
            . Use a secondary account: automated reading can get an account locked.
          </p>
        </div>
        {s?.connected && (
          <div className="flex shrink-0 gap-2">
            <button
              disabled={!!busy}
              onClick={() => run("check", { method: "POST", body: JSON.stringify({ action: "check" }) })}
              className="rounded-lg border border-border px-3 py-1.5 text-sm font-semibold hover:border-accent hover:text-accent disabled:opacity-50"
            >
              {busy === "check" ? "Checking…" : "Check session"}
            </button>
            <button
              disabled={!!busy}
              onClick={() => setOpen((v) => !v)}
              className="rounded-lg border border-border px-3 py-1.5 text-sm font-semibold hover:border-accent hover:text-accent disabled:opacity-50"
            >
              Switch account
            </button>
            <button
              disabled={!!busy}
              onClick={logout}
              className="rounded-lg border border-border px-3 py-1.5 text-sm font-semibold hover:border-red-500 hover:text-red-500 disabled:opacity-50"
            >
              Log out
            </button>
          </div>
        )}
      </div>

      <div className="mt-3 text-sm">
        {!s ? (
          <p className="text-muted">Loading…</p>
        ) : s.connected ? (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
            <span>
              <span className="mr-1.5 inline-block size-2 rounded-full bg-emerald-500 align-middle" />
              Signed in as <b>@{s.username}</b>
            </span>
            <span className="text-muted">
              saved {when(s.savedAt)} {s.method === "cookie" ? "(pasted cookie)" : ""}
            </span>
            {s.expiresAt && <span className="text-muted">expires {when(s.expiresAt)}</span>}
            {s.lastCheck && (
              <span className={s.lastCheck.ok ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}>
                {s.lastCheck.ok ? "✓" : "✗"} {s.lastCheck.message} · {when(s.lastCheck.at)}
              </span>
            )}
          </div>
        ) : (
          <p className="text-muted">
            <span className="mr-1.5 inline-block size-2 rounded-full bg-border align-middle" />
            Not signed in — Threads search runs logged out, which usually returns nothing.
          </p>
        )}
      </div>

      {notice && (
        <p
          className={`mt-3 rounded-xl border px-3 py-2 text-sm ${
            notice.ok
              ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
              : "border-red-500/30 bg-red-500/10 text-red-600 dark:text-red-400"
          }`}
        >
          {notice.text}
        </p>
      )}

      {s && (!s.connected || open) && (
        <div className="mt-4 max-w-md">
          {flow ? (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void run("code", { method: "POST", body: JSON.stringify({ action: "code", flowId: flow.id, code }) });
              }}
              className="space-y-2"
            >
              <label className="block text-xs font-bold uppercase tracking-wide text-muted">Verification code</label>
              <input
                value={code}
                onChange={(e) => setCode(e.target.value)}
                inputMode="numeric"
                autoComplete="one-time-code"
                placeholder="6-digit code from SMS / email / authenticator"
                className={fieldClass}
                autoFocus
              />
              <div className="flex gap-2">
                <button disabled={!!busy || !code.trim()} className="rounded-xl bg-accent px-4 py-2 text-sm font-bold text-white disabled:opacity-50">
                  {busy === "code" ? "Verifying…" : "Submit code"}
                </button>
                <button type="button" onClick={() => setFlow(null)} className="rounded-xl border border-border px-4 py-2 text-sm font-semibold">
                  Cancel
                </button>
              </div>
              <p className="text-xs text-muted">The server keeps the login waiting for 5 minutes.</p>
            </form>
          ) : cookieMode ? (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void run("cookie", { method: "POST", body: JSON.stringify({ action: "cookie", username, cookie }) });
              }}
              className="space-y-2"
            >
              <input value={username} onChange={(e) => setUsername(e.target.value)} placeholder="Threads username (for display)" className={fieldClass} />
              <textarea
                value={cookie}
                onChange={(e) => setCookie(e.target.value)}
                rows={3}
                placeholder="sessionid=…; csrftoken=…  (or just the sessionid value)"
                className={`${fieldClass} font-mono text-xs`}
              />
              <p className="text-xs text-muted">
                In a browser logged in to threads.com: DevTools → Application → Cookies → copy <code>sessionid</code>.
              </p>
              <div className="flex gap-2">
                <button disabled={!!busy || !cookie.trim()} className="rounded-xl bg-accent px-4 py-2 text-sm font-bold text-white disabled:opacity-50">
                  {busy === "cookie" ? "Saving…" : "Save cookie"}
                </button>
                <button type="button" onClick={() => setCookieMode(false)} className="rounded-xl border border-border px-4 py-2 text-sm font-semibold">
                  Back to login
                </button>
              </div>
            </form>
          ) : (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void run("login", { method: "POST", body: JSON.stringify({ action: "login", username, password }) });
              }}
              className="space-y-2"
            >
              <input
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Threads / Instagram username"
                autoComplete="off"
                className={fieldClass}
              />
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Password"
                autoComplete="new-password"
                className={fieldClass}
              />
              <div className="flex flex-wrap items-center gap-2">
                <button
                  disabled={!!busy || !username.trim() || !password}
                  className="rounded-xl bg-accent px-4 py-2 text-sm font-bold text-white disabled:opacity-50"
                >
                  {busy === "login" ? "Signing in… (up to 40 s)" : "Sign in"}
                </button>
                <button type="button" onClick={() => setCookieMode(true)} className="text-sm font-semibold text-accent hover:underline">
                  Paste a cookie instead
                </button>
              </div>
              <p className="text-xs text-muted">
                The password is sent once to sign in and is never stored — only the session cookie is kept on the server.
              </p>
            </form>
          )}
        </div>
      )}
    </section>
  );
}
