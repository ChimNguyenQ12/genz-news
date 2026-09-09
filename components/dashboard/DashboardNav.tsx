"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import ThemeToggle from "@/components/ThemeToggle";
import type { PublicUser } from "@/lib/users";

export default function DashboardNav({ user }: { user: PublicUser }) {
  const pathname = usePathname();
  const isAdmin = user.role === "admin";

  const links = [
    { href: "/dashboard", label: "Bài của tôi" },
    { href: "/dashboard/tai-khoan", label: "Tài khoản" },
  ];

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.assign("/dang-nhap");
  }

  return (
    <header className="border-b border-border bg-surface">
      <div className="mx-auto max-w-6xl px-3 sm:px-4">
        <div className="flex h-14 items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-4">
          <Link href="/dashboard" className="flex shrink-0 items-center gap-2">
            <span className="flex size-7 items-center justify-center rounded-lg bg-accent text-[10px] font-black text-white">
              GZ
            </span>
            <span className="font-display hidden text-sm font-black tracking-tight sm:block">
              GenZ<span className="text-accent"> Studio</span>
            </span>
          </Link>
          <nav className="no-scrollbar hidden items-center gap-1 overflow-x-auto sm:flex">
            {links.map((l) => {
              const active =
                l.href === "/dashboard"
                  ? pathname === "/dashboard"
                  : pathname.startsWith(l.href);
              return (
                <Link
                  key={l.href}
                  href={l.href}
                  className={`shrink-0 rounded-lg px-3 py-1.5 text-sm font-semibold transition ${
                    active
                      ? "bg-accent/10 text-accent"
                      : "text-foreground/70 hover:bg-surface-2"
                  }`}
                >
                  {l.label}
                </Link>
              );
            })}
            {isAdmin && (
              <Link
                href="/admin"
                className="shrink-0 rounded-lg bg-amber-500/10 px-2.5 py-1 text-xs font-bold text-amber-600 transition hover:bg-amber-500/20 dark:text-amber-400"
              >
                Vào trang Quản trị →
              </Link>
            )}
          </nav>
        </div>

          <div className="flex shrink-0 items-center gap-2">
          <Link
            href="/"
            target="_blank"
            className="hidden rounded-lg px-3 py-1.5 text-sm font-semibold text-foreground/70 hover:bg-surface-2 lg:block"
          >
            Xem trang ↗
          </Link>
          <ThemeToggle />
          <span className="hidden text-sm text-muted sm:block">
            {user.displayName || user.username}
          </span>
          <button
            onClick={logout}
            className="rounded-lg border border-border px-2.5 py-1.5 text-xs font-semibold transition hover:border-accent hover:text-accent sm:px-3 sm:text-sm"
          >
            Thoát
          </button>
        </div>
      </div>
      <nav className="no-scrollbar -mx-3 flex gap-1 overflow-x-auto border-t border-border px-3 py-2 sm:hidden">
        {links.map((l) => {
          const active = l.href === "/dashboard" ? pathname === "/dashboard" : pathname.startsWith(l.href);
          return (
            <Link
              key={l.href}
              href={l.href}
              className={`shrink-0 rounded-lg px-3 py-1.5 text-sm font-semibold transition ${
                active ? "bg-accent/10 text-accent" : "text-foreground/70 hover:bg-surface-2"
              }`}
            >
              {l.label}
            </Link>
          );
        })}
        {isAdmin && (
          <Link
            href="/admin"
            className="shrink-0 rounded-lg bg-amber-500/10 px-2.5 py-1.5 text-xs font-bold text-amber-600 transition hover:bg-amber-500/20 dark:text-amber-400"
          >
            Quản trị →
          </Link>
        )}
      </nav>
      </div>
    </header>
  );
}
