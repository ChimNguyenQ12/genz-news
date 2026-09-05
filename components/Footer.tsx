import Link from "next/link";
import { categories } from "@/lib/data";

export default function Footer() {
  return (
    <footer className="mt-20 border-t border-border bg-surface">
      <div className="mx-auto max-w-6xl px-4 py-12">
        <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <Link href="/" className="flex items-center gap-2">
              <span className="flex size-8 items-center justify-center rounded-lg bg-accent text-xs font-black text-white">
                GZ
              </span>
              <span className="font-display text-xl font-black tracking-tight">
                GenZ<span className="text-accent"> Now</span>
              </span>
            </Link>
            <p className="mt-3 max-w-xs text-sm text-muted">
              Tin tức quốc tế được chắt lọc, biên tập lại và dẫn nguồn rõ ràng — gọn cho Gen Z đọc mỗi ngày.
            </p>
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
            <h3 className="text-sm font-bold uppercase tracking-wide text-muted">Về GenZ Now</h3>
            <ul className="mt-3 space-y-2 text-sm text-foreground/80">
              <li><Link href="#" className="hover:text-accent">Giới thiệu</Link></li>
              <li><Link href="#" className="hover:text-accent">Nguyên tắc biên tập &amp; trích nguồn</Link></li>
              <li><Link href="#" className="hover:text-accent">Liên hệ</Link></li>
            </ul>
          </div>

          <div>
            <h3 className="text-sm font-bold uppercase tracking-wide text-muted">Nhận bản tin</h3>
            <p className="mt-3 text-sm text-muted">Tổng hợp tin đáng chú ý mỗi tối, gửi thẳng vào inbox.</p>
            <form className="mt-3 flex gap-2">
              <input
                type="email"
                placeholder="email@cua-ban.com"
                className="w-full rounded-full border border-border bg-background px-4 py-2 text-sm outline-none focus:border-accent"
              />
              <button
                type="submit"
                className="shrink-0 rounded-full bg-accent px-4 py-2 text-sm font-semibold text-white transition hover:opacity-90"
              >
                Đăng ký
              </button>
            </form>
          </div>
        </div>

        <div className="mt-10 flex flex-col items-center justify-between gap-3 border-t border-border pt-6 text-xs text-muted sm:flex-row">
          <p>© 2026 GenZ Now. Mọi bài viết tổng hợp đều được biên tập lại và trích dẫn nguồn gốc.</p>
          <div className="flex gap-4">
            <Link href="#" className="hover:text-accent">Điều khoản</Link>
            <Link href="#" className="hover:text-accent">Quyền riêng tư</Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
