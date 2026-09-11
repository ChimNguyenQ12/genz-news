"use client";

import { useState } from "react";
import type { NewsroomSettings } from "@/lib/settings";

/**
 * Auto-generation settings. Turning it off stops the cron runs; the per-topic
 * "Create post" button still works, because that is a person asking for it.
 *
 * Sống trong hộp thoại chứ không nằm trên đầu trang: đây là thứ đặt một lần
 * rồi thôi, còn màn hình Research thì để dành cho hàng đợi.
 */
export default function NewsroomSwitch({
  initial,
  onChanged,
}: {
  initial: NewsroomSettings;
  /** Báo ra ngoài để nút mở hộp thoại đổi nhãn On/Off theo. */
  onChanged?: (settings: NewsroomSettings) => void;
}) {
  const [settings, setSettings] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function save(next: NewsroomSettings) {
    setSaving(true);
    setError("");
    const prev = settings;
    setSettings(next); // hiện ngay, hoàn lại nếu lưu hỏng
    const res = await fetch("/api/admin/newsroom", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(next),
    });
    setSaving(false);
    if (!res.ok) {
      setSettings(prev);
      setError("Could not save settings.");
      return;
    }
    const data = await res.json();
    setSettings(data.settings);
    onChanged?.(data.settings);
  }

  const perDay = settings.maxArticlesPerRun * 2;

  return (
    <div>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h3 className="font-display text-sm font-black">Automatic generation</h3>
          <p className="mt-1 text-sm text-muted">
            Two runs a day — <strong className="text-foreground">06:00</strong> (collect
            topics, then write) and <strong className="text-foreground">18:00</strong>.
            Finished articles wait for your review; nothing publishes itself.
          </p>
        </div>

        <button
          type="button"
          role="switch"
          aria-checked={settings.enabled}
          aria-label="Turn automatic generation on or off"
          disabled={saving}
          onClick={() => save({ ...settings, enabled: !settings.enabled })}
          className={`relative h-8 w-14 shrink-0 rounded-full transition disabled:opacity-50 ${
            settings.enabled ? "bg-accent" : "bg-neutral-400/40"
          }`}
        >
          <span
            className={`absolute top-1 h-6 w-6 rounded-full bg-white shadow transition-all ${
              settings.enabled ? "left-7" : "left-1"
            }`}
          />
        </button>
      </div>

      <div
        className={`mt-4 border-t border-border pt-4 transition ${
          settings.enabled ? "" : "pointer-events-none opacity-40"
        }`}
      >
        <label className="mb-2 block text-xs font-bold uppercase tracking-wide text-muted">
          Articles per run
        </label>
        <div className="flex flex-wrap items-center gap-2">
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              type="button"
              disabled={saving}
              onClick={() => save({ ...settings, maxArticlesPerRun: n })}
              className={`h-11 w-11 rounded-xl border text-sm font-bold transition disabled:opacity-50 ${
                settings.maxArticlesPerRun === n
                  ? "border-accent bg-accent text-white"
                  : "border-border hover:border-accent hover:text-accent"
              }`}
            >
              {n}
            </button>
          ))}
          <span className="ml-1 text-sm text-muted">
            = up to <strong className="text-foreground">{perDay} articles/day</strong>
          </span>
        </div>
        <p className="mt-2 text-xs text-muted">
          Each article takes 8–10 minutes to research, cross-check and write. Setting
          this higher does not produce more articles, it only overloads the server.
        </p>
      </div>

      <div className="mt-4 flex items-start justify-between gap-4 border-t border-border pt-4">
        <div className="min-w-0">
          <h3 className="font-display text-sm font-black">Photos from source articles</h3>
          <p className="mt-1 text-sm text-muted">
            Use the photo each source article publishes for sharing (its og:image), so
            the picture matches the actual event. Credit and a link back to the
            original are added automatically.
          </p>
          <p className="mt-1 text-xs text-muted">
            These are the outlet&apos;s copyrighted press photos. Turn this off to use
            only freely-licensed archive photos.
          </p>
        </div>

        <button
          type="button"
          role="switch"
          aria-checked={settings.pressImages}
          aria-label="Use photos from source articles"
          disabled={saving}
          onClick={() => save({ ...settings, pressImages: !settings.pressImages })}
          className={`relative h-8 w-14 shrink-0 rounded-full transition disabled:opacity-50 ${
            settings.pressImages ? "bg-accent" : "bg-neutral-400/40"
          }`}
        >
          <span
            className={`absolute top-1 h-6 w-6 rounded-full bg-white shadow transition-all ${
              settings.pressImages ? "left-7" : "left-1"
            }`}
          />
        </button>
      </div>

      {error && (
        <p className="mt-3 rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      )}
    </div>
  );
}
