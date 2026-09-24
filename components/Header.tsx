"use client";

import Link from "next/link";
import { useState } from "react";
import { categories } from "@/lib/data";
import type { PublicUser } from "@/lib/users";
import ThemeToggle from "./ThemeToggle";

export default function Header({ user }: { user: PublicUser | null }) {
  const [open, setOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);

  const destination = user
    ? user.role === "admin"
      ? "/admin"
      : "/dashboard"
    : "/dang-nhap";
  const userLabel = user
    ? user.role === "admin"
      ? "Quản trị"
      : "Bài của tôi"
    : "Viết bài";

  return (
    <header className="sticky top-0 z-50 border-b border-border bg-background/80 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4">
        <Link href="/" className="group flex shrink-0 items-center gap-2.5">
          <img
            src="/genz-news-logo.png"
            alt="GenZ News"
            className="size-8 rounded-lg object-contain transition-transform group-hover:scale-105 sm:size-9"
          />
          <span className="font-display text-xl font-black tracking-tight">
            GenZ<span className="text-accent"> News</span>
          </span>
        </Link>

        <nav className="hidden items-center gap-0.5 xl:flex">
          {categories.map((c) => (
            <Link
              key={c.slug}
              href={`/chuyen-muc/${c.slug}`}
              className="rounded-full px-3 py-1.5 text-sm font-semibold text-foreground/80 transition hover:bg-surface-2 hover:text-accent"
            >
              {c.name}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-1.5 sm:gap-2">
          {/* Nút Viết bài hiển thị trực tiếp trên mobile và desktop */}
          <Link
            href={destination}
            className="flex items-center gap-1.5 rounded-full bg-accent px-3 py-1.5 text-xs font-bold text-white shadow-sm transition hover:opacity-90 sm:px-3.5 sm:py-2 sm:text-sm"
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              className="shrink-0"
            >
              <path d="M12 20h9" />
              <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
            </svg>
            <span>{userLabel}</span>
          </Link>

          <button
            onClick={() => {
              setSearchOpen((v) => !v);
              setOpen(false);
            }}
            aria-label="Tìm kiếm"
            aria-expanded={searchOpen}
            className="flex size-9 items-center justify-center rounded-full border border-border bg-surface text-foreground transition hover:border-accent hover:text-accent"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="7" />
              <path d="M21 21l-4.3-4.3" />
            </svg>
          </button>

          <ThemeToggle />

          <button
            onClick={() => {
              setOpen((v) => !v);
              setSearchOpen(false);
            }}
            aria-label="Mở menu"
            className="flex size-9 items-center justify-center rounded-full border border-border bg-surface text-foreground xl:hidden"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              {open ? <path d="M18 6L6 18M6 6l12 12" /> : <path d="M3 6h18M3 12h18M3 18h18" />}
            </svg>
          </button>
        </div>
      </div>

      {searchOpen && (
        <div className="border-t border-border px-4 py-3">
          {/* Form GET thường: trình duyệt tự dựng /tim-kiem?q=..., không cần JS. */}
          <form
            action="/tim-kiem"
            role="search"
            onSubmit={() => setSearchOpen(false)}
            className="mx-auto flex max-w-6xl gap-2"
          >
            <input
              type="search"
              name="q"
              autoFocus
              placeholder="Tìm theo tít hoặc tóm tắt bài…"
              aria-label="Từ khoá tìm kiếm"
              maxLength={100}
              className="min-w-0 flex-1 rounded-full border border-border bg-surface px-4 py-2 text-sm outline-none focus:border-accent"
            />
            <button
              type="submit"
              className="shrink-0 rounded-full bg-accent px-4 py-2 text-sm font-bold text-white transition hover:opacity-90"
            >
              Tìm
            </button>
          </form>
        </div>
      )}

      {open && (
        <nav className="flex flex-col gap-1 border-t border-border px-4 py-3 xl:hidden">
          {categories.map((c) => (
            <Link
              key={c.slug}
              href={`/chuyen-muc/${c.slug}`}
              onClick={() => setOpen(false)}
              className="rounded-lg px-3 py-2 text-sm font-semibold text-foreground/80 hover:bg-surface-2"
            >
              {c.name}
            </Link>
          ))}
          <Link
            href={destination}
            onClick={() => setOpen(false)}
            className="mt-1 flex items-center justify-center gap-1.5 rounded-lg bg-accent px-3 py-2 text-sm font-bold text-white"
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              className="shrink-0"
            >
              <path d="M12 20h9" />
              <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
            </svg>
            <span>{userLabel}</span>
          </Link>
        </nav>
      )}
    </header>
  );
}
