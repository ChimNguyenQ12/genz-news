"use client";

import { useState } from "react";
import type { NewsroomSettings } from "@/lib/settings";

/**
 * Công tắc cho Automatically Generate. Tắt là cron ngừng viết bài — nút "Create Post"
 * ở từng đề tài vẫn dùng được, vì đó là bạn chủ động yêu cầu.
 */
export default function NewsroomSwitch({ initial }: { initial: NewsroomSettings }) {
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
      setError("Không lưu được cài đặt.");
      return;
    }
    const data = await res.json();
    setSettings(data.settings);
  }

  const perDay = settings.maxArticlesPerRun * 2;

  return (
    <div className="mb-6 rounded-2xl border border-border bg-surface p-4 sm:p-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h2 className="font-display text-base font-black">Automatically Generate</h2>
          <p className="mt-1 text-sm text-muted">
            Mỗi ngày hai lượt — <strong className="text-foreground">6h</strong> (thu thập
            đề tài rồi viết) và <strong className="text-foreground">18h</strong>. Bài xong
            nằm ở mục chờ duyệt, không tự đăng.
          </p>
        </div>

        <button
          type="button"
          role="switch"
          aria-checked={settings.enabled}
          aria-label="Bật hoặc tắt Automatically Generate"
          disabled={saving}
          onClick={() => save({ ...settings, enabled: !settings.enabled })}
          className={`relative h-8 w-14 shrink-0 rounded-full transition disabled:opacity-50 ${settings.enabled ? "bg-accent" : "bg-neutral-400/40"
            }`}
        >
          <span
            className={`absolute top-1 h-6 w-6 rounded-full bg-white shadow transition-all ${settings.enabled ? "left-7" : "left-1"
              }`}
          />
        </button>
      </div>

      <div
        className={`mt-4 border-t border-border pt-4 transition ${settings.enabled ? "" : "pointer-events-none opacity-40"
          }`}
      >
        <label className="mb-2 block text-xs font-bold uppercase tracking-wide text-muted">
          Số bài mỗi lượt
        </label>
        <div className="flex flex-wrap items-center gap-2">
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              type="button"
              disabled={saving}
              onClick={() => save({ ...settings, maxArticlesPerRun: n })}
              className={`h-11 w-11 rounded-xl border text-sm font-bold transition disabled:opacity-50 ${settings.maxArticlesPerRun === n
                ? "border-accent bg-accent text-white"
                : "border-border hover:border-accent hover:text-accent"
                }`}
            >
              {n}
            </button>
          ))}
          <span className="ml-1 text-sm text-muted">
            = tối đa <strong className="text-foreground">{perDay} bài/ngày</strong>
          </span>
        </div>
        <p className="mt-2 text-xs text-muted">
          Mỗi bài mất 8–10 phút để tìm nguồn, đối chiếu và viết. Đặt cao không làm ra
          nhiều bài hơn, chỉ làm nghẽn máy chủ.
        </p>
      </div>

      {error && (
        <p className="mt-3 rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      )}
    </div>
  );
}
