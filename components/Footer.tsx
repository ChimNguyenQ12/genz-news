import Link from "next/link";
import { categories } from "@/lib/data";

export default function Footer() {
  return (
    <footer className="mt-20 border-t border-border bg-surface">
      <div className="mx-auto max-w-6xl px-4 py-12">
        <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <Link href="/" className="group flex items-center gap-2.5">
              <img
                src="/genz-news-logo.png"
                alt="GenZ News"
                className="size-8 rounded-lg object-contain transition-transform group-hover:scale-105 sm:size-9"
              />
              <span className="font-display text-xl font-black tracking-tight">
                GenZ<span className="text-accent"> News</span>
              </span>
            </Link>
            <p className="mt-3 max-w-xs text-sm text-muted">
              Tin tức Việt Nam mà phải đọc báo nước ngoài?
            </p>
            <p className="mt-1 max-w-xs text-sm text-muted">
              Báo Việt không viết về nó?
            </p>
            <br></br>
            <strong className="mt-1 max-w-xs text-sm text-muted">
              Trang báo nhỏ dành cho GenZ, cập nhật và chắt lọc tin tức từ các nguồn chính thống + <i>các nguồn không chính thống</i>
            </strong>
          </div>

          <div>
            <h3 className="text-sm font-bold uppercase tracking-wide text-muted">Chuyên mục</h3>
            <ul className="mt-3 space-y-2">
              {categories.map((c) => (
                <li key={c.slug}>
                  <Link href={`/chuyen-muc/${c.slug}`} className="text-sm text-foreground/80 hover:text-accent">
                    {c.name}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h3 className="text-sm font-bold uppercase tracking-wide text-muted">Về GenZ News</h3>
            <ul className="mt-3 space-y-2 text-sm text-foreground/80">
              <li><Link href="#" className="hover:text-accent">Giới thiệu</Link></li>
              <li><Link href="#" className="hover:text-accent">Nguyên tắc biên tập &amp; trích nguồn</Link></li>
              <li><Link href="#" className="hover:text-accent">Liên hệ</Link></li>
            </ul>
          </div>

          <div>
            <h3 className="text-sm font-bold uppercase tracking-wide text-muted">Liên hệ</h3>
            <p className="mt-3 text-sm text-muted">tinhbu0123@gmail.com</p>
            <p className="mt-3 text-sm text-muted">Meeting App: <a href="https://meet.pliny.blog">meet.pliny.blog</a></p>
          </div>
        </div>

        <div className="mt-10 flex flex-col items-center justify-between gap-3 border-t border-border pt-6 text-xs text-muted sm:flex-row">
          <p>© 2026 GenZ News. Mọi bài viết tổng hợp đều được BIÊN TẬP LẠI và trích dẫn nguồn gốc.</p>
          <div className="flex gap-4">
            <Link href="#" className="hover:text-accent">Điều khoản</Link>
            <Link href="#" className="hover:text-accent">Quyền riêng tư</Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
