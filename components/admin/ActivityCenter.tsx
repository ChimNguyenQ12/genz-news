"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import Pagination from "@/components/admin/Pagination";
import {
  NOTIFICATION_META,
  timeAgo,
  type NotificationItem,
  type NotificationType,
} from "@/components/admin/notificationMeta";

type Tab = "notifications" | "traffic" | "views";

interface MinuteBucket {
  minute: number;
  total: number;
  api: number;
  pages: number;
  limited: number;
  blocked: number;
  ips: number;
}

interface TopIp {
  ip: string;
  lastMinute: number;
  window: number;
  firstSeen: number;
  lastSeen: number;
  lastPath: string;
  userAgent: string;
  apiWrites: number;
  limited: number;
  blocked: boolean;
}

interface TrafficAlert {
  kind: "ip" | "total" | "spike";
  minute: number;
  count: number;
  ip?: string;
  baseline?: number;
  autoBlocked?: boolean;
}

interface Traffic {
  now: number;
  startedAt: number;
  level: "normal" | "elevated" | "attack";
  thresholds: {
    ipPerMinute: number;
    totalPerMinute: number;
    spikeFactor: number;
    autoBlockPerMinute: number;
  };
  current: MinuteBucket;
  history: MinuteBucket[];
  lastMinute: number;
  avgPerMinute: number;
  peak: { minute: number; total: number } | null;
  topIps: TopIp[];
  blocks: { ip: string; until: number; reason: string; auto: boolean; createdAt: number }[];
  recentAlerts: TrafficAlert[];
  trackedIps: number;
}

interface ViewRow {
  id: string;
  slug: string;
  title: string;
  category: string;
  publishedAt: string;
  viewCount: number;
  views: number;
  comments: number;
}

interface StatsResponse {
  traffic: Traffic;
  topViewed: ViewRow[];
  daily: { day: string; views: number }[];
  days: number;
}

interface ListResponse {
  items: NotificationItem[];
  total: number;
  page: number;
  perPage: number;
  unread: number;
  unreadByType: Record<NotificationType, number>;
}

const TABS: { key: Tab; label: string }[] = [
  { key: "notifications", label: "Notifications" },
  { key: "traffic", label: "Traffic" },
  { key: "views", label: "Most read" },
];

const TYPES = Object.keys(NOTIFICATION_META) as NotificationType[];

const fmt = (n: number) => n.toLocaleString("en-US");
const hhmm = (t: number) =>
  new Date(t).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Ho_Chi_Minh" });

async function api(url: string, init?: RequestInit) {
  const res = await fetch(url, {
    cache: "no-store",
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Error ${res.status}`);
  return data;
}

export default function ActivityCenter({ initialTab }: { initialTab: Tab }) {
  const [tab, setTab] = useState<Tab>(initialTab);

  function pick(t: Tab) {
    setTab(t);
    const url = new URL(window.location.href);
    if (t === "notifications") url.searchParams.delete("tab");
    else url.searchParams.set("tab", t);
    window.history.replaceState(null, "", url);
  }

  return (
    <div>
      <div className="mb-4">
        <h1 className="font-display text-2xl font-black">Activity</h1>
        <p className="mt-1 text-sm text-muted">
          What changed on the site, how much it is being read, and whether traffic looks like an attack.
        </p>
      </div>

      <div className="no-scrollbar mb-4 flex w-full gap-1 overflow-x-auto rounded-xl border border-border bg-surface p-1 sm:w-auto sm:max-w-max">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => pick(t.key)}
            className={`shrink-0 rounded-lg px-3 py-1.5 text-sm font-semibold transition ${
              tab === t.key ? "bg-accent text-white" : "text-foreground/70 hover:bg-surface-2"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "notifications" && <NotificationsPanel />}
      {tab === "traffic" && <TrafficPanel />}
      {tab === "views" && <ViewsPanel />}
    </div>
  );
}

// ---------------------------------------------------------------- Notifications

function NotificationsPanel() {
  const [query, setQuery] = useState<{ type: NotificationType | "all"; unread: boolean; page: number }>({
    type: "all",
    unread: false,
    page: 1,
  });
  const [data, setData] = useState<ListResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [reload, setReload] = useState(0);
  const seq = useRef(0);

  useEffect(() => {
    const mine = ++seq.current;
    const params = new URLSearchParams({ page: String(query.page), perPage: "30" });
    if (query.type !== "all") params.set("type", query.type);
    if (query.unread) params.set("unread", "1");
    const t = setTimeout(() => {
      setLoading(true);
      api(`/api/admin/notifications?${params}`)
        .then((d) => mine === seq.current && (setData(d), setError(null)))
        .catch((e) => mine === seq.current && setError(e.message))
        .finally(() => mine === seq.current && setLoading(false));
    }, 0);
    return () => clearTimeout(t);
  }, [query, reload]);

  async function markRead(body: object) {
    try {
      await api("/api/admin/notifications", { method: "PATCH", body: JSON.stringify(body) });
      setReload((r) => r + 1);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function clearRead() {
    if (!confirm("Delete all read notifications?")) return;
    try {
      await api("/api/admin/notifications", { method: "DELETE" });
      setReload((r) => r + 1);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.perPage)) : 1;

  return (
    <div>
      <div className="mb-3 flex flex-col gap-2 lg:flex-row lg:items-center">
        <div className="no-scrollbar flex gap-1 overflow-x-auto">
          {(["all", ...TYPES] as const).map((t) => {
            const n = t === "all" ? data?.unread : data?.unreadByType[t];
            const active = query.type === t;
            return (
              <button
                key={t}
                onClick={() => setQuery((q) => ({ ...q, type: t, page: 1 }))}
                className={`shrink-0 rounded-full border px-3 py-1 text-xs font-semibold transition ${
                  active ? "border-accent bg-accent/10 text-accent" : "border-border hover:border-accent"
                }`}
              >
                {t === "all" ? "All" : `${NOTIFICATION_META[t].icon} ${NOTIFICATION_META[t].label}`}
                {!!n && <span className="ml-1.5 rounded-full bg-red-500 px-1.5 text-[10px] text-white">{n}</span>}
              </button>
            );
          })}
        </div>
        <div className="flex flex-wrap items-center gap-2 lg:ml-auto">
          <label className="flex items-center gap-1.5 text-xs font-semibold">
            <input
              type="checkbox"
              checked={query.unread}
              onChange={(e) => setQuery((q) => ({ ...q, unread: e.target.checked, page: 1 }))}
            />
            Unread only
          </label>
          <button
            onClick={() => markRead({ all: true, type: query.type === "all" ? undefined : query.type })}
            className="rounded-lg border border-border px-3 py-1.5 text-xs font-semibold hover:border-accent hover:text-accent"
          >
            Mark all read
          </button>
          <button
            onClick={clearRead}
            className="rounded-lg border border-border px-3 py-1.5 text-xs font-semibold hover:border-red-500 hover:text-red-500"
          >
            Clear read
          </button>
        </div>
      </div>

      {error && (
        <p className="mb-3 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-2 text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      )}

      {data && !data.items.length ? (
        <p className="rounded-2xl border border-border bg-surface p-8 text-center text-sm text-muted">
          {loading ? "Loading…" : "No notifications here."}
        </p>
      ) : (
        <ul className={`divide-y divide-border overflow-hidden rounded-2xl border border-border bg-surface transition-opacity ${loading ? "opacity-50" : ""}`}>
          {data?.items.map((n) => {
            const meta = NOTIFICATION_META[n.type];
            const inner = (
              <>
                <span className={`grid size-8 shrink-0 place-items-center rounded-full ${meta.cls(n.level)}`} aria-hidden>
                  {meta.icon}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold">
                    {n.title}
                    {n.count > 1 && (
                      <span className="ml-1.5 rounded-full bg-accent/10 px-1.5 text-xs text-accent">×{n.count}</span>
                    )}
                  </span>
                  {n.body && <span className="mt-0.5 block break-words text-sm text-muted">{n.body}</span>}
                  <span className="mt-1 block text-xs text-muted">
                    {meta.label} · {timeAgo(n.updatedAt)}
                    {n.count > 1 && ` · first ${timeAgo(n.createdAt)}`}
                  </span>
                </span>
              </>
            );
            return (
              <li key={n.id} className={`flex items-start gap-3 px-4 py-3 ${n.read ? "opacity-60" : ""}`}>
                {n.link ? (
                  <Link
                    href={n.link}
                    onClick={() => !n.read && markRead({ ids: [n.id] })}
                    className="flex min-w-0 flex-1 items-start gap-3 hover:text-accent"
                  >
                    {inner}
                  </Link>
                ) : (
                  <div className="flex min-w-0 flex-1 items-start gap-3">{inner}</div>
                )}
                {!n.read && (
                  <button
                    onClick={() => markRead({ ids: [n.id] })}
                    title="Mark as read"
                    className="mt-1 shrink-0 rounded-lg px-2 py-1 text-xs font-semibold text-accent hover:bg-surface-2"
                  >
                    ✓
                  </button>
                )}
              </li>
            );
          })}
          {!data && <li className="p-8 text-center text-sm text-muted">Loading…</li>}
        </ul>
      )}

      <Pagination page={query.page} totalPages={totalPages} onChange={(page) => setQuery((q) => ({ ...q, page }))} />
    </div>
  );
}

// ---------------------------------------------------------------- shared stats loader

/** Tải /api/admin/traffic; `everyMs` > 0 thì tự làm mới khi tab đang hiện. */
function useStats(days: number, everyMs: number) {
  const [data, setData] = useState<StatsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);

  const load = useCallback(async () => {
    try {
      setData(await api(`/api/admin/traffic?days=${days}`));
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }, [days]);

  useEffect(() => {
    const first = setTimeout(load, 0);
    const t = everyMs
      ? setInterval(() => document.visibilityState === "visible" && void load(), everyMs)
      : undefined;
    return () => {
      clearTimeout(first);
      if (t) clearInterval(t);
    };
  }, [load, everyMs, reload]);

  return { data, error, refresh: () => setReload((r) => r + 1) };
}

// ---------------------------------------------------------------- Traffic

const LEVEL_BANNER: Record<Traffic["level"], { icon: string; title: string; text: string; cls: string }> = {
  normal: {
    icon: "✅",
    title: "Traffic looks normal",
    text: "No IP or site-wide rate is near the alert thresholds.",
    cls: "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
  },
  elevated: {
    icon: "⚠️",
    title: "Traffic is elevated",
    text: "Above half the alert threshold, or a sudden jump over the recent average. Could be a viral article — check the top IPs and paths.",
    cls: "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400",
  },
  attack: {
    icon: "🚨",
    title: "Possible attack (DDoS / flooding)",
    text: "Alert threshold exceeded. Check the IPs below; for a large attack turn on Cloudflare “Under Attack” mode — blocking here only stops requests at the app.",
    cls: "border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-400",
  },
};

function TrafficPanel() {
  const { data, error, refresh } = useStats(1, 5_000);
  const [blockIp, setBlockIp] = useState("");
  const [minutes, setMinutes] = useState(60);
  const [notice, setNotice] = useState<{ text: string; kind: "ok" | "error" } | null>(null);
  const [allIps, setAllIps] = useState(false);

  async function act(action: "block" | "unblock", ip: string, mins?: number) {
    if (action === "block" && !confirm(`Block ${ip} for ${mins} minutes?\n\nOne IP can be many people (mobile carrier CGNAT).`)) return;
    try {
      await api("/api/admin/traffic", { method: "POST", body: JSON.stringify({ action, ip, minutes: mins }) });
      setNotice({ text: action === "block" ? `Blocked ${ip}` : `Unblocked ${ip}`, kind: "ok" });
      refresh();
    } catch (e) {
      setNotice({ text: (e as Error).message, kind: "error" });
    }
  }

  if (error && !data) return <p className="text-sm text-red-500">{error}</p>;
  if (!data) return <p className="text-sm text-muted">Loading…</p>;
  const t = data.traffic;
  const banner = LEVEL_BANNER[t.level];

  return (
    <div className="space-y-4">
      <div className={`flex gap-3 rounded-2xl border px-4 py-3 ${banner.cls}`} role="status">
        <span aria-hidden className="text-lg">{banner.icon}</span>
        <div>
          <p className="font-bold">{banner.title}</p>
          <p className="text-sm opacity-90">{banner.text}</p>
        </div>
      </div>

      {notice && (
        <p
          className={`rounded-xl border px-4 py-2 text-sm ${
            notice.kind === "ok"
              ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
              : "border-red-500/30 bg-red-500/10 text-red-600 dark:text-red-400"
          }`}
        >
          {notice.text}
        </p>
      )}

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        <Tile label="This minute" value={fmt(t.current.total)} hint="so far" />
        <Tile label="Last minute" value={fmt(t.lastMinute)} hint={`alert at ${fmt(t.thresholds.totalPerMinute)}`} />
        <Tile label="Avg / minute" value={fmt(t.avgPerMinute)} hint="last 60 min" />
        <Tile label="Peak" value={t.peak ? fmt(t.peak.total) : "—"} hint={t.peak ? `at ${hhmm(t.peak.minute)}` : "no data yet"} />
        <Tile label="IPs this minute" value={fmt(t.current.ips)} hint={`${fmt(t.trackedIps)} in last 5 min`} />
        <Tile label="Rate-limited" value={fmt(t.current.limited)} hint={`${fmt(t.current.blocked)} blocked this min`} />
      </div>

      <section className="rounded-2xl border border-border bg-surface p-4">
        <h2 className="text-sm font-bold">Requests per minute — last 60 minutes</h2>
        <p className="mb-3 text-xs text-muted">Pages and API calls that reached the app (static files excluded). Updates every 5 s.</p>
        <BarChart
          bars={last60(t.history, t.current).map((b, i, arr) => ({
            key: String(b.minute),
            value: b.total,
            label: hhmm(b.minute),
            tip: `${hhmm(b.minute)}${i === arr.length - 1 ? " (now)" : ""} · ${fmt(b.total)} requests (${fmt(b.pages)} pages, ${fmt(b.api)} API) · ${fmt(b.ips)} IPs${b.limited ? ` · ${b.limited} rate-limited` : ""}${b.blocked ? ` · ${b.blocked} blocked` : ""}`,
          }))}
          threshold={t.thresholds.totalPerMinute}
          emptyText="Collecting data — the chart fills in minute by minute since the last app restart."
        />
      </section>

      <section className="rounded-2xl border border-border bg-surface p-4">
        <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
          <div>
            <h2 className="text-sm font-bold">Busiest IPs — last 5 minutes</h2>
            <p className="text-xs text-muted">
              Alert when one IP sends ≥ {fmt(t.thresholds.ipPerMinute)} requests/min.
              {t.thresholds.autoBlockPerMinute
                ? ` Auto-block at ${fmt(t.thresholds.autoBlockPerMinute)}/min.`
                : " Auto-block is off."}{" "}
              IPs are kept in memory only, never saved.
            </p>
          </div>
        </div>
        {t.topIps.length ? (
          <div className="-mx-4 overflow-x-auto px-4">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead className="text-xs uppercase tracking-wide text-muted">
                <tr>
                  <th className="py-2 pr-3 font-semibold">IP</th>
                  <th className="py-2 pr-3 text-right font-semibold">Last min</th>
                  <th className="py-2 pr-3 text-right font-semibold">5 min</th>
                  <th className="py-2 pr-3 text-right font-semibold">429s</th>
                  <th className="py-2 pr-3 font-semibold">Last path / user agent</th>
                  <th className="py-2 font-semibold" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {(allIps ? t.topIps : t.topIps.slice(0, 10)).map((r) => {
                  const hot = r.lastMinute >= t.thresholds.ipPerMinute;
                  const warm = r.lastMinute >= t.thresholds.ipPerMinute / 2;
                  return (
                    <tr key={r.ip}>
                      <td className="py-2 pr-3 font-mono text-xs">
                        {r.ip}
                        {hot && <span className="ml-1.5 rounded bg-red-500/15 px-1 text-[10px] font-bold text-red-600">HIGH</span>}
                        {!hot && warm && <span className="ml-1.5 rounded bg-amber-500/15 px-1 text-[10px] font-bold text-amber-600">WATCH</span>}
                        {r.blocked && <span className="ml-1.5 rounded bg-surface-2 px-1 text-[10px] font-bold">BLOCKED</span>}
                      </td>
                      <td className="py-2 pr-3 text-right tabular-nums">{fmt(r.lastMinute)}</td>
                      <td className="py-2 pr-3 text-right tabular-nums">{fmt(r.window)}</td>
                      <td className="py-2 pr-3 text-right tabular-nums">{r.limited || "—"}</td>
                      <td className="max-w-[280px] py-2 pr-3">
                        <span className="block truncate font-mono text-xs" title={r.lastPath}>{r.lastPath}</span>
                        <span className="block truncate text-xs text-muted" title={r.userAgent}>{r.userAgent || "(no user agent)"}</span>
                      </td>
                      <td className="py-2 text-right">
                        {r.blocked ? (
                          <button onClick={() => act("unblock", r.ip)} className="rounded-lg border border-border px-2.5 py-1 text-xs font-semibold hover:border-accent hover:text-accent">
                            Unblock
                          </button>
                        ) : (
                          <button onClick={() => act("block", r.ip, 60)} className="rounded-lg border border-border px-2.5 py-1 text-xs font-semibold hover:border-red-500 hover:text-red-500">
                            Block 1h
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {t.topIps.length > 10 && (
              <button
                onClick={() => setAllIps((v) => !v)}
                className="mt-2 text-xs font-semibold text-accent hover:underline"
              >
                {allIps ? "Show top 10" : `Show all ${t.topIps.length}`}
              </button>
            )}
          </div>
        ) : (
          <p className="text-sm text-muted">No requests in the last 5 minutes.</p>
        )}
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-2xl border border-border bg-surface p-4">
          <h2 className="mb-1 text-sm font-bold">Blocked IPs</h2>
          <p className="mb-3 text-xs text-muted">Blocked at the app (HTTP 429). Lost on restart. Use Cloudflare for anything large.</p>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (blockIp.trim()) void act("block", blockIp.trim(), minutes);
            }}
            className="mb-3 flex flex-wrap gap-2"
          >
            <input
              value={blockIp}
              onChange={(e) => setBlockIp(e.target.value)}
              placeholder="IP address"
              className="min-w-0 flex-1 rounded-lg border border-border bg-background px-2.5 py-1.5 font-mono text-sm outline-none focus:border-accent"
            />
            <select
              value={minutes}
              onChange={(e) => setMinutes(Number(e.target.value))}
              className="rounded-lg border border-border bg-background px-2.5 py-1.5 text-sm outline-none focus:border-accent"
            >
              <option value={10}>10 min</option>
              <option value={60}>1 hour</option>
              <option value={360}>6 hours</option>
              <option value={1440}>24 hours</option>
              <option value={10080}>7 days</option>
            </select>
            <button className="rounded-lg bg-red-500 px-3 py-1.5 text-sm font-bold text-white hover:opacity-90">Block</button>
          </form>
          {t.blocks.length ? (
            <ul className="divide-y divide-border text-sm">
              {t.blocks.map((b) => (
                <li key={b.ip} className="flex items-center justify-between gap-2 py-2">
                  <span className="min-w-0">
                    <span className="font-mono text-xs">{b.ip}</span>
                    <span className="block text-xs text-muted">
                      {b.reason} · until {hhmm(b.until)}
                    </span>
                  </span>
                  <button onClick={() => act("unblock", b.ip)} className="shrink-0 rounded-lg border border-border px-2.5 py-1 text-xs font-semibold hover:border-accent hover:text-accent">
                    Unblock
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted">No IP is blocked.</p>
          )}
        </section>

        <section className="rounded-2xl border border-border bg-surface p-4">
          <h2 className="mb-1 text-sm font-bold">Recent alerts</h2>
          <p className="mb-3 text-xs text-muted">Since the app started at {new Date(t.startedAt).toLocaleString("en-GB")}. Each alert also lands in Notifications.</p>
          {t.recentAlerts.length ? (
            <ul className="space-y-2 text-sm">
              {t.recentAlerts.map((a, i) => (
                <li key={i} className="rounded-lg bg-surface-2 px-3 py-2">
                  <span className="font-semibold">{hhmm(a.minute)}</span>{" "}
                  {a.kind === "ip" && (
                    <>
                      <span className="font-mono text-xs">{a.ip}</span> sent {fmt(a.count)} req/min
                      {a.autoBlocked && " — auto-blocked"}
                    </>
                  )}
                  {a.kind === "total" && <>site-wide {fmt(a.count)} req/min — over threshold</>}
                  {a.kind === "spike" && <>spike to {fmt(a.count)} req/min (avg {fmt(a.baseline ?? 0)})</>}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted">No alerts. 🎉</p>
          )}
        </section>
      </div>
    </div>
  );
}

/** Luôn đủ 60 cột (phút chưa có dữ liệu = 0), để mới khởi động lại không bị một cột to choán cả khung. */
function last60(history: MinuteBucket[], current: MinuteBucket): MinuteBucket[] {
  const byMinute = new Map(history.map((b) => [b.minute, b]));
  const out: MinuteBucket[] = [];
  for (let i = 59; i >= 1; i--) {
    const m = current.minute - i * 60_000;
    out.push(byMinute.get(m) ?? { minute: m, total: 0, api: 0, pages: 0, limited: 0, blocked: 0, ips: 0 });
  }
  out.push(current);
  return out;
}

function Tile({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-2xl border border-border bg-surface px-3 py-2.5">
      <p className="text-xs font-semibold text-muted">{label}</p>
      <p className="font-display text-2xl font-black tabular-nums">{value}</p>
      {hint && <p className="truncate text-[11px] text-muted">{hint}</p>}
    </div>
  );
}

/**
 * Cột đơn giản cho MỘT chuỗi số: cột mảnh, bo đầu, đường ngưỡng nét đứt.
 * Rê chuột (hoặc chạm) vào cột nào thì dòng dưới hiện số của cột đó.
 */
function BarChart({
  bars,
  threshold,
  emptyText,
  height = 140,
}: {
  bars: { key: string; value: number; label: string; tip: string }[];
  threshold?: number;
  emptyText: string;
  height?: number;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(1, ...bars.map((b) => b.value));
  // Chỉ vẽ đường ngưỡng khi số đã tới gần nó — không thì cả biểu đồ bị ép bẹp.
  const showThreshold = threshold !== undefined && max >= threshold * 0.5;
  const top = showThreshold ? Math.max(max, threshold!) * 1.1 : max * 1.1;
  const total = bars.reduce((a, b) => a + b.value, 0);

  if (!total) return <p className="py-8 text-center text-sm text-muted">{emptyText}</p>;

  const shown = hover !== null ? bars[hover] : bars[bars.length - 1];
  const step = Math.ceil(bars.length / 6);

  return (
    <div>
      <div className="relative" style={{ height }} onMouseLeave={() => setHover(null)}>
        <div className="absolute inset-x-0 bottom-0 border-t border-border" />
        {showThreshold && (
          <div
            className="absolute inset-x-0 border-t border-dashed border-red-500/60"
            style={{ bottom: `${(threshold! / top) * 100}%` }}
          >
            <span className="absolute -top-4 right-0 text-[10px] font-semibold text-red-500">alert {fmt(threshold!)}</span>
          </div>
        )}
        <div className="absolute inset-0 flex items-end gap-[2px]">
          {bars.map((b, i) => (
            <div
              key={b.key}
              className="flex h-full min-w-0 flex-1 cursor-default items-end"
              onMouseEnter={() => setHover(i)}
              onClick={() => setHover(i)}
              title={b.tip}
            >
              <div
                className={`w-full rounded-t-[4px] transition-colors ${
                  hover === i ? "bg-accent" : threshold !== undefined && b.value >= threshold ? "bg-red-500" : "bg-accent/60"
                }`}
                style={{ height: `${Math.max(b.value ? 2 : 0, (b.value / top) * 100)}%` }}
              />
            </div>
          ))}
        </div>
      </div>
      <div className="mt-1 flex justify-between text-[10px] text-muted">
        {bars.map((b, i) =>
          i % step === 0 || i === bars.length - 1 ? <span key={b.key}>{b.label}</span> : null,
        )}
      </div>
      <p className="mt-2 min-h-[1.25rem] text-xs text-muted">{shown.tip}</p>
    </div>
  );
}

// ---------------------------------------------------------------- Views

function ViewsPanel() {
  const [days, setDays] = useState(1);
  const { data, error } = useStats(days, 60_000);

  if (error && !data) return <p className="text-sm text-red-500">{error}</p>;
  if (!data) return <p className="text-sm text-muted">Loading…</p>;

  const today = data.daily[data.daily.length - 1]?.views ?? 0;
  const week = data.daily.slice(-7).reduce((a, d) => a + d.views, 0);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        <Tile label="Reads today" value={fmt(today)} hint="Vietnam time" />
        <Tile label="Reads, last 7 days" value={fmt(week)} />
        <Tile label="Reads, last 14 days" value={fmt(data.daily.reduce((a, d) => a + d.views, 0))} />
      </div>

      <section className="rounded-2xl border border-border bg-surface p-4">
        <h2 className="text-sm font-bold">Article reads per day — last 14 days</h2>
        <p className="mb-3 text-xs text-muted">
          Counted in the reader&apos;s browser after 5 s on the page, once per tab per 30 min. Bots and admins are not counted.
        </p>
        <BarChart
          bars={data.daily.map((d) => ({
            key: d.day,
            value: d.views,
            label: d.day.slice(5),
            tip: `${d.day} · ${fmt(d.views)} reads`,
          }))}
          emptyText="No reads recorded yet — counting started with this update."
        />
      </section>

      <section className="rounded-2xl border border-border bg-surface p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-bold">Most read articles</h2>
          <div className="flex gap-1 rounded-lg border border-border p-0.5">
            {[
              [1, "Today"],
              [7, "7 days"],
              [30, "30 days"],
            ].map(([d, label]) => (
              <button
                key={d}
                onClick={() => setDays(d as number)}
                className={`rounded-md px-2.5 py-1 text-xs font-semibold ${
                  days === d ? "bg-accent text-white" : "text-foreground/70 hover:bg-surface-2"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        {data.topViewed.length ? (
          <div className="-mx-4 overflow-x-auto px-4">
            <table className="w-full min-w-[520px] text-left text-sm">
              <thead className="text-xs uppercase tracking-wide text-muted">
                <tr>
                  <th className="py-2 pr-3 font-semibold">#</th>
                  <th className="py-2 pr-3 font-semibold">Article</th>
                  <th className="py-2 pr-3 text-right font-semibold">Reads ({days === 1 ? "today" : `${days}d`})</th>
                  <th className="py-2 pr-3 text-right font-semibold">All time</th>
                  <th className="py-2 text-right font-semibold">Comments</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {data.topViewed.map((r, i) => (
                  <tr key={r.id}>
                    <td className="py-2 pr-3 text-muted tabular-nums">{i + 1}</td>
                    <td className="max-w-[360px] py-2 pr-3">
                      <Link href={`/admin/articles/${r.id}`} className="line-clamp-2 font-semibold hover:text-accent">
                        {r.title}
                      </Link>
                      <a href={`/bai-viet/${r.slug}`} target="_blank" className="text-xs text-muted hover:text-accent">
                        View on site ↗
                      </a>
                    </td>
                    <td className="py-2 pr-3 text-right font-bold tabular-nums">{fmt(r.views)}</td>
                    <td className="py-2 pr-3 text-right tabular-nums">{fmt(r.viewCount)}</td>
                    <td className="py-2 text-right tabular-nums">
                      <Link href={`/admin/articles/${r.id}#comments`} className="hover:text-accent">
                        {fmt(r.comments)}
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-sm text-muted">No reads in this period yet.</p>
        )}
      </section>
    </div>
  );
}
