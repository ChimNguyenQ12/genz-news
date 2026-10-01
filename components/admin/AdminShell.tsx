"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import ThemeToggle from "@/components/ThemeToggle";
import NotificationBell from "@/components/admin/NotificationBell";
import type { PublicUser } from "@/lib/users";

/**
 * Khung của khu quản trị: điều hướng + vùng nội dung.
 *
 * Thanh ngang cũ hết chỗ khi lên 9 mục (mục cuối bị cắt mất), mà khu này còn
 * thêm mục nữa. Nên:
 *   - Máy tính (lg+): thanh bên trái, chia nhóm — thêm mục chỉ dài thêm một dòng.
 *   - Điện thoại: thanh trên gọn (logo, chuông, nút menu), menu trượt từ trái,
 *     và thanh tab dưới đáy cho mấy mục dùng nhiều nhất — với tới bằng ngón cái.
 *
 * Mọi link đều bật `prefetch`: các trang ở đây là `force-dynamic`, Next không
 * tự tải trước, không có prefetch thì bấm tab nào cũng như bị đơ.
 */

type IconName =
  | "articles"
  | "home"
  | "research"
  | "facebook"
  | "threads"
  | "activity"
  | "users"
  | "profile"
  | "menu"
  | "close"
  | "external"
  | "logout";

interface NavItem {
  href: string;
  label: string;
  icon: IconName;
}

const GROUPS: { title: string; items: NavItem[] }[] = [
  {
    title: "Content",
    items: [
      { href: "/admin", label: "Articles", icon: "articles" },
      { href: "/admin/homepage", label: "Homepage", icon: "home" },
      { href: "/admin/research", label: "Research", icon: "research" },
    ],
  },
  {
    title: "Social",
    items: [
      { href: "/admin/facebook", label: "Facebook", icon: "facebook" },
      { href: "/admin/threads", label: "Threads", icon: "threads" },
    ],
  },
  {
    title: "Site",
    items: [
      { href: "/admin/activity", label: "Activity", icon: "activity" },
      { href: "/admin/users", label: "Users", icon: "users" },
      { href: "/admin/tai-khoan", label: "Profile", icon: "profile" },
    ],
  },
];

/** Thanh tab dưới đáy trên điện thoại: 4 mục hay dùng + "Menu" mở phần còn lại. */
const BOTTOM: NavItem[] = [
  { href: "/admin", label: "Articles", icon: "articles" },
  { href: "/admin/research", label: "Research", icon: "research" },
  { href: "/admin/homepage", label: "Homepage", icon: "home" },
  { href: "/admin/activity", label: "Activity", icon: "activity" },
];

const isActive = (pathname: string, href: string) =>
  href === "/admin"
    ? pathname === "/admin" || pathname.startsWith("/admin/articles")
    : pathname.startsWith(href);

function Icon({ name, className = "size-5" }: { name: IconName; className?: string }) {
  const paths: Record<IconName, React.ReactNode> = {
    articles: (
      <>
        <path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" />
        <path d="M14 3v6h6M8 13h8M8 17h5" />
      </>
    ),
    home: (
      <>
        <rect x="3" y="3" width="18" height="8" rx="2" />
        <rect x="3" y="14" width="8" height="7" rx="2" />
        <rect x="14" y="14" width="7" height="7" rx="2" />
      </>
    ),
    research: (
      <>
        <circle cx="11" cy="11" r="7" />
        <path d="m20 20-3.5-3.5" />
      </>
    ),
    facebook: <path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z" />,
    threads: (
      <>
        <path d="M16.5 11.5c-.3-3-2.1-4.5-4.6-4.5-2.8 0-4.4 2-4.4 5s1.6 5 4.5 5c2 0 3.3-1 3.3-2.6 0-1.7-1.6-2.4-3.4-2.4-1.5 0-2.4.7-2.4 1.7" />
        <path d="M12 21a9 9 0 1 1 8.5-12" />
      </>
    ),
    activity: <path d="M3 12h4l3-8 4 16 3-8h4" />,
    users: (
      <>
        <circle cx="9" cy="8" r="4" />
        <path d="M2 21a7 7 0 0 1 14 0M16 3.5a4 4 0 0 1 0 9M22 21a7 7 0 0 0-4-6.3" />
      </>
    ),
    profile: (
      <>
        <circle cx="12" cy="8" r="4" />
        <path d="M4 21a8 8 0 0 1 16 0" />
      </>
    ),
    menu: <path d="M4 6h16M4 12h16M4 18h16" />,
    close: <path d="M6 6l12 12M18 6 6 18" />,
    external: <path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" />,
    logout: <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" />,
  };
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      {paths[name]}
    </svg>
  );
}

function Brand({ badge = true }: { badge?: boolean }) {
  return (
    <Link href="/admin" prefetch className="group flex items-center gap-2.5">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/genz-news-logo.png"
        alt="GenZ News"
        className="size-8 rounded-lg object-contain transition-transform group-hover:scale-105"
      />
      <span className="whitespace-nowrap font-display text-sm font-black tracking-tight">
        GenZ<span className="text-accent"> News</span>
        {badge && (
          <span className="ml-1.5 rounded bg-surface-2 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-muted">
            Admin
          </span>
        )}
      </span>
    </Link>
  );
}

async function logout() {
  await fetch("/api/auth/logout", { method: "POST" });
  window.location.href = "/dang-nhap";
}

/** Danh sách mục theo nhóm — dùng chung cho thanh bên và menu trượt. */
function NavList({ pathname, onNavigate }: { pathname: string; onNavigate?: () => void }) {
  return (
    <nav className="space-y-5">
      {GROUPS.map((g) => (
        <div key={g.title}>
          <p className="mb-1.5 px-3 text-[11px] font-bold uppercase tracking-wider text-muted">{g.title}</p>
          <ul className="space-y-0.5">
            {g.items.map((item) => {
              const active = isActive(pathname, item.href);
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    prefetch
                    onClick={onNavigate}
                    aria-current={active ? "page" : undefined}
                    className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition lg:py-2 ${
                      active ? "bg-accent/10 text-accent" : "text-foreground/75 hover:bg-surface-2 hover:text-foreground"
                    }`}
                  >
                    <Icon name={item.icon} />
                    {item.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}

function AccountFooter({ user }: { user: PublicUser }) {
  return (
    <div className="space-y-1 border-t border-border pt-3">
      <a
        href="/"
        target="_blank"
        className="flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-semibold text-foreground/75 hover:bg-surface-2"
      >
        <Icon name="external" />
        View site
      </a>
      <div className="flex items-center justify-between gap-2 px-3 py-1.5">
        <span className="min-w-0 truncate text-sm text-muted" title={user.displayName}>
          @{user.username}
        </span>
        <div className="flex shrink-0 items-center gap-1">
          <ThemeToggle />
          <button
            onClick={logout}
            title="Sign out"
            aria-label="Sign out"
            className="grid size-9 place-items-center rounded-lg text-foreground/70 transition hover:bg-red-500/10 hover:text-red-500"
          >
            <Icon name="logout" />
          </button>
        </div>
      </div>
    </div>
  );
}

export default function AdminShell({ user, children }: { user: PublicUser; children: React.ReactNode }) {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);

  // Menu đang mở: khoá cuộn trang phía sau, Esc để đóng.
  useEffect(() => {
    if (!menuOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setMenuOpen(false);
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      document.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);

  const inBottomBar = BOTTOM.some((b) => isActive(pathname, b.href));

  return (
    <div className="min-h-screen lg:flex">
      {/* ---------- máy tính: thanh bên ---------- */}
      {/* z-40: thanh bên sticky là một lớp hiển thị riêng — thiếu z-index thì
          bảng thông báo bung ra từ đây bị nội dung trang đè lên. */}
      <aside className="sticky top-0 z-40 hidden h-screen w-60 shrink-0 flex-col border-r border-border bg-surface px-3 py-4 lg:flex">
        <div className="mb-6 flex items-center justify-between gap-2 px-1">
          <Brand badge={false} />
          <NotificationBell align="left" />
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">
          <NavList pathname={pathname} />
        </div>
        <AccountFooter user={user} />
      </aside>

      {/* ---------- điện thoại / máy tính bảng: thanh trên ---------- */}
      <header className="sticky top-0 z-40 border-b border-border bg-surface/95 backdrop-blur lg:hidden">
        <div className="flex h-14 items-center justify-between gap-2 px-3">
          <Brand />
          <div className="flex items-center gap-1">
            <NotificationBell />
            <button
              onClick={() => setMenuOpen(true)}
              aria-label="Open menu"
              aria-expanded={menuOpen}
              className="grid size-10 place-items-center rounded-lg text-foreground/80 hover:bg-surface-2"
            >
              <Icon name="menu" className="size-6" />
            </button>
          </div>
        </div>
      </header>

      {/* ---------- menu trượt ---------- */}
      {menuOpen && (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="Admin menu">
          <button
            aria-label="Close menu"
            onClick={() => setMenuOpen(false)}
            className="absolute inset-0 bg-black/40 backdrop-blur-[2px]"
          />
          <div className="absolute inset-y-0 left-0 flex w-[min(20rem,85vw)] flex-col bg-surface px-3 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 shadow-2xl">
            <div className="mb-4 flex items-center justify-between px-1">
              <Brand />
              <button
                onClick={() => setMenuOpen(false)}
                aria-label="Close menu"
                className="grid size-10 place-items-center rounded-lg hover:bg-surface-2"
              >
                <Icon name="close" className="size-6" />
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto">
              <NavList pathname={pathname} onNavigate={() => setMenuOpen(false)} />
            </div>
            <AccountFooter user={user} />
          </div>
        </div>
      )}

      <main className="mx-auto w-full min-w-0 max-w-6xl px-3 pb-24 pt-4 sm:px-5 sm:pt-6 lg:px-8 lg:pb-10 lg:pt-8">
        {children}
      </main>

      {/* ---------- điện thoại: thanh tab dưới đáy ---------- */}
      <nav
        aria-label="Quick navigation"
        className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden"
      >
        <ul className="mx-auto grid max-w-lg grid-cols-5">
          {BOTTOM.map((item) => {
            const active = isActive(pathname, item.href);
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  prefetch
                  aria-current={active ? "page" : undefined}
                  className={`flex h-16 flex-col items-center justify-center gap-1 text-[11px] font-semibold ${
                    active ? "text-accent" : "text-foreground/60"
                  }`}
                >
                  <Icon name={item.icon} className="size-6" />
                  {item.label}
                </Link>
              </li>
            );
          })}
          <li>
            <button
              onClick={() => setMenuOpen(true)}
              className={`flex h-16 w-full flex-col items-center justify-center gap-1 text-[11px] font-semibold ${
                !inBottomBar ? "text-accent" : "text-foreground/60"
              }`}
            >
              <Icon name="menu" className="size-6" />
              More
            </button>
          </li>
        </ul>
      </nav>
    </div>
  );
}
