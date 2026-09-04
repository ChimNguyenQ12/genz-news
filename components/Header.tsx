"use client";

import Link from "next/link";
import { useState } from "react";
import { categories } from "@/lib/data";
import { categoryStyles } from "@/lib/categoryStyles";
import ThemeToggle from "./ThemeToggle";

export default function Header() {
  const [open, setOpen] = useState(false);

  return (
    <header className="sticky top-0 z-50 border-b border-border bg-background/80 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4">
        <Link href="/" className="flex items-center gap-2 shrink-0">
          <span className="flex size-8 items-center justify-center rounded-lg bg-accent text-sm font-black text-white">
            L
          </span>
          <span className="font-display text-xl font-black tracking-tight">
            LƯỢC<span className="text-accent">.</span>
          </span>
        </Link>

        <nav className="hidden items-center gap-1 lg:flex">
          {categories.map((c) => {
            const style = categoryStyles[c.slug];
            return (
              <Link
                key={c.slug}
                href={`/chuyen-muc/${c.slug}`}
                className={`rounded-full px-3 py-1.5 text-sm font-semibold text-foreground/80 transition hover:${style.pill.split(" ")[0]} hover:${style.text}`}
              >
                {c.name}
              </Link>
            );
          })}
        </nav>

        <div className="flex items-center gap-2">
          <button
            aria-label="Tìm kiếm"
            className="flex size-9 items-center justify-center rounded-full border border-border bg-surface text-foreground transition hover:border-accent hover:text-accent"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="7" />
              <path d="M21 21l-4.3-4.3" />
            </svg>
          </button>
          <ThemeToggle />
          <button
            onClick={() => setOpen((v) => !v)}
            aria-label="Mở menu"
            className="flex size-9 items-center justify-center rounded-full border border-border bg-surface text-foreground lg:hidden"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              {open ? <path d="M18 6L6 18M6 6l12 12" /> : <path d="M3 6h18M3 12h18M3 18h18" />}
            </svg>
          </button>
        </div>
      </div>

      {open && (
        <nav className="flex flex-col gap-1 border-t border-border px-4 py-3 lg:hidden">
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
        </nav>
      )}
    </header>
  );
}
