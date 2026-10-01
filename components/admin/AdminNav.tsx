"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import ThemeToggle from "@/components/ThemeToggle";
import NotificationBell from "@/components/admin/NotificationBell";
import type { PublicUser } from "@/lib/users";

/**
 * Thanh điều hướng của khu quản trị.
 *
 * Các link đều bật `prefetch`: mọi trang ở đây là `force-dynamic`, mà Next
 * không tự tải trước loại trang đó. Không có prefetch thì mỗi lần bấm tab là
 * một vòng đi-về đầy đủ tới máy chủ mới thấy gì, nên bấm xong cứ như bị đơ.
 */
export default function AdminNav({ user }: { user: PublicUser }) {
  const pathname = usePathname();
  const isAdmin = user.role === "admin";

  const links = [
    { href: "/admin", label: isAdmin ? "Articles" : "My articles" },
    ...(isAdmin
      ? [
          { href: "/admin/homepage", label: "Homepage" },
          { href: "/admin/facebook", label: "Facebook" },
          { href: "/admin/threads", label: "Threads" },
          { href: "/admin/research", label: "Research" },
          { href: "/admin/users", label: "Users" },
          { href: "/admin/activity", label: "Activity" },
        ]
      : []),
    { href: "/admin/tai-khoan", label: "Profile" },
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
          <Link href="/admin" className="group flex shrink-0 items-center gap-2.5">
            <img
              src="/genz-news-logo.png"
              alt="GenZ News"
              className="size-7 rounded-lg object-contain transition-transform group-hover:scale-105"
            />
            <span className="font-display hidden text-sm font-black tracking-tight sm:block">
              GenZ<span className="text-accent"> News</span>
            </span>
          </Link>
          <nav className="no-scrollbar hidden items-center gap-1 overflow-x-auto sm:flex">
            {links.map((l) => {
              const active =
                l.href === "/admin" ? pathname === "/admin" : pathname.startsWith(l.href);
              return (
                <Link
                  key={l.href}
                  href={l.href}
                  prefetch
                  className={`shrink-0 rounded-lg px-3 py-1.5 text-sm font-semibold transition ${active
                      ? "bg-accent/10 text-accent"
                      : "text-foreground/70 hover:bg-surface-2"
                    }`}
                >
                  {l.label}
                </Link>
              );
            })}
          </nav>
        </div>

          <div className="flex shrink-0 items-center gap-2">
          <Link
            href="/"
            target="_blank"
            className="hidden rounded-lg px-3 py-1.5 text-sm font-semibold text-foreground/70 hover:bg-surface-2 2xl:block"
          >
            View site ↗
          </Link>
          {isAdmin && <NotificationBell />}
          <ThemeToggle />
          <span className="hidden text-sm text-muted sm:block">{user.username}</span>
          <button
            onClick={logout}
            className="rounded-lg border border-border px-2.5 py-1.5 text-xs font-semibold transition hover:border-accent hover:text-accent sm:px-3 sm:text-sm"
          >
            Sign out
          </button>
        </div>
      </div>
      <nav className="no-scrollbar -mx-3 flex gap-1 overflow-x-auto border-t border-border px-3 py-2 sm:hidden">
        {links.map((l) => {
          const active = l.href === "/admin" ? pathname === "/admin" : pathname.startsWith(l.href);
          return (
            <Link
              key={l.href}
              href={l.href}
              prefetch
              className={`shrink-0 rounded-lg px-3 py-1.5 text-sm font-semibold transition ${
                active ? "bg-accent/10 text-accent" : "text-foreground/70 hover:bg-surface-2"
              }`}
            >
              {l.label}
            </Link>
          );
        })}
      </nav>
      </div>
    </header>
  );
}
