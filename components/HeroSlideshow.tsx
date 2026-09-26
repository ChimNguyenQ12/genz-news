"use client";

import { useEffect, useRef, useState } from "react";
import FeaturedHero, { type HeroArticle } from "./FeaturedHero";

const AUTO_MS = 6000;

/**
 * Slideshow ngang cho hero trang chủ, theo thứ tự vị trí đặt trong trình sửa bài.
 * Cuộn bằng scroll-snap nên vuốt trên điện thoại là cơ chế sẵn của trình duyệt;
 * tự chuyển slide mỗi 6 giây, dừng khi rê chuột / chạm vào.
 */
export default function HeroSlideshow({ articles }: { articles: HeroArticle[] }) {
  const track = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);
  const [paused, setPaused] = useState(false);
  const count = articles.length;

  const go = (i: number) => {
    const el = track.current;
    if (!el) return;
    const n = (i + count) % count;
    el.scrollTo({ left: n * el.clientWidth, behavior: "smooth" });
  };

  useEffect(() => {
    if (count < 2 || paused) return;
    const t = setInterval(() => {
      const el = track.current;
      if (!el) return;
      const cur = Math.round(el.scrollLeft / el.clientWidth);
      const n = (cur + 1) % count;
      el.scrollTo({ left: n * el.clientWidth, behavior: "smooth" });
    }, AUTO_MS);
    return () => clearInterval(t);
  }, [count, paused]);

  if (count === 1) return <FeaturedHero article={articles[0]} />;

  return (
    <section
      aria-roledescription="carousel"
      aria-label="Tin nổi bật"
      className="relative"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onTouchStart={() => setPaused(true)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
    >
      <div
        ref={track}
        onScroll={(e) => {
          const el = e.currentTarget;
          setActive(Math.round(el.scrollLeft / el.clientWidth));
        }}
        className="no-scrollbar flex snap-x snap-mandatory overflow-x-auto rounded-3xl"
      >
        {articles.map((a, i) => (
          <div
            key={a.slug}
            className="w-full shrink-0 snap-start"
            aria-roledescription="slide"
            aria-label={`${i + 1} / ${count}`}
          >
            <FeaturedHero article={a} priority={i === 0} />
          </div>
        ))}
      </div>

      <button
        type="button"
        onClick={() => go(active - 1)}
        aria-label="Tin trước"
        className="absolute left-3 top-1/2 hidden size-10 -translate-y-1/2 items-center justify-center rounded-full bg-black/35 text-white backdrop-blur-sm transition hover:bg-black/60 sm:flex"
      >
        ‹
      </button>
      <button
        type="button"
        onClick={() => go(active + 1)}
        aria-label="Tin sau"
        className="absolute right-3 top-1/2 hidden size-10 -translate-y-1/2 items-center justify-center rounded-full bg-black/35 text-white backdrop-blur-sm transition hover:bg-black/60 sm:flex"
      >
        ›
      </button>

      <div className="absolute right-5 top-5 flex gap-1.5 sm:right-8 sm:top-8">
        {articles.map((a, i) => (
          <button
            key={a.slug}
            type="button"
            onClick={() => go(i)}
            aria-label={`Tới tin ${i + 1}`}
            aria-current={i === active}
            className={`h-1.5 rounded-full transition-all ${i === active ? "w-6 bg-white" : "w-1.5 bg-white/50 hover:bg-white/80"}`}
          />
        ))}
      </div>
    </section>
  );
}
