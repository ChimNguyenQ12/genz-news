import Link from "next/link";
export default function NewsletterBanner() {
  return (
    <div className="relative overflow-hidden rounded-3xl bg-foreground px-6 py-10 text-background sm:px-12 sm:py-14">
      <div
        className="pointer-events-none absolute -right-16 -top-16 size-56 rounded-full opacity-30 blur-3xl"
        style={{ background: "var(--accent-2)" }}
      />
      <div
        className="pointer-events-none absolute -bottom-20 -left-10 size-56 rounded-full opacity-20 blur-3xl"
        style={{ background: "var(--accent)" }}
      />
      <div className="relative mx-auto max-w-xl text-center">
        <h2 className="font-display text-2xl font-black sm:text-3xl">
          Tin thế giới, gọn trong 5 phút mỗi tối.
        </h2>
        <p className="mt-2 text-sm text-background/70">
          Không spam, không giật tít. Chỉ những gì đáng đọc, đã được chắt lọc &amp; trích nguồn rõ ràng.
        </p>
        <form className="mx-auto mt-5 flex max-w-sm gap-2">
          <input
            type="email"
            placeholder="email@cua-ban.com"
            className="w-full rounded-full bg-background/10 px-4 py-2.5 text-sm text-background outline-none ring-1 ring-background/20 placeholder:text-background/50 focus:ring-accent-2"
          />
          <button
            type="submit"
            className="shrink-0 rounded-full px-5 py-2.5 text-sm font-bold text-foreground transition hover:opacity-90"
            style={{ background: "var(--accent-2)" }}
          >
            <Link
              href="/dang-ky"
            >
              Đăng ký
            </Link>
          </button>
        </form>
      </div>
    </div>
  );
}
