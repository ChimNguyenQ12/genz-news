"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import ThemeToggle from "@/components/ThemeToggle";
import type { PublicUser } from "@/lib/users";

export default function AdminNav({ user }: { user: PublicUser }) {
  const pathname = usePathname();
  const router = useRouter();
  const isAdmin = user.role === "admin";

  const links = [
    { href: "/admin", label: isAdmin ? "Bài viết" : "Bài của tôi" },
    ...(isAdmin ? [{ href: "/admin/research", label: "Đặt đề tài" }] : []),
    { href: "/admin/tai-khoan", label: "Tài khoản" },
  ];

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.replace("/dang-nhap");
    router.refresh();
  }

  return (
    <header className="border-b border-border bg-surface">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-3 px-4">
        <div className="flex min-w-0 items-center gap-4">
          <Link href="/admin" className="flex shrink-0 items-center gap-2">
            <span className="flex size-7 items-center justify-center rounded-lg bg-accent text-[10px] font-black text-white">
              GZ
            </span>
            <span className="font-display hidden text-sm font-black tracking-tight sm:block">
              GenZ<span className="text-accent"> News</span>
            </span>
          </Link>
          <nav className="no-scrollbar flex items-center gap-1 overflow-x-auto">
            {links.map((l) => {
              const active =
                l.href === "/admin" ? pathname === "/admin" : pathname.startsWith(l.href);
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
          <span className="hidden text-sm text-muted sm:block">{user.username}</span>
          <button
            onClick={logout}
            className="rounded-lg border border-border px-3 py-1.5 text-sm font-semibold transition hover:border-accent hover:text-accent"
          >
            Thoát
          </button>
        </div>
      </div>
    </header>
  );
}
