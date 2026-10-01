/**
 * Giám sát lưu lượng tại tầng app — để biết trang có đang bị dội request không.
 *
 * proxy.ts gọi `recordRequest()` cho mọi request trang và API (trừ tệp tĩnh).
 * Mọi thứ ở đây CHỈ NẰM TRONG BỘ NHỚ, không ghi xuống cơ sở dữ liệu: trang
 * Quyền riêng tư cam kết "địa chỉ IP chỉ được đếm tạm trong bộ nhớ". Thông báo
 * cảnh báo ghi vào DB (lib/monitor.ts) cũng không chứa IP — IP cụ thể chỉ xem
 * trực tiếp ở /admin/activity, tab Traffic.
 *
 * Giới hạn cần biết khi đọc số:
 * - Đây là những request ĐÃ LỌT tới app. Cloudflare đứng trước và tự chặn phần
 *   lớn DDoS tầng mạng; nginx có cache. Số ở đây cao bất thường nghĩa là đòn
 *   đã đi qua được hai lớp đó.
 * - Một IP Việt Nam có thể là cả nghìn người (CGNAT của nhà mạng), nên IP "đông"
 *   chưa chắc là tấn công — xem thêm đường dẫn và User-Agent trước khi chặn.
 * - App chạy một instance; khởi động lại là đếm lại từ đầu.
 *
 * State gắn vào globalThis vì proxy và route handler có thể nằm ở hai bundle
 * khác nhau của cùng một tiến trình Node — biến cấp module sẽ không dùng chung.
 */

const MINUTE = 60_000;
/** Giữ lịch sử tổng theo phút trong 60 phút. */
const HISTORY_MINUTES = 60;
/** Thống kê theo IP: cửa sổ 5 phút. */
const IP_WINDOW_MINUTES = 5;
/** Trần số IP theo dõi cùng lúc, để Map không phình khi bị dội từ hàng chục nghìn IP. */
const MAX_TRACKED_IPS = 20_000;

function envInt(name: string, fallback: number) {
  const n = Number(process.env[name]);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

/** Ngưỡng cảnh báo — đổi được bằng biến môi trường. */
export const THRESHOLDS = {
  /** Một IP vượt bấy nhiêu request trong một phút → cảnh báo. */
  ipPerMinute: envInt("TRAFFIC_ALERT_IP_PER_MIN", 300),
  /** Toàn trang vượt bấy nhiêu request/phút → cảnh báo. */
  totalPerMinute: envInt("TRAFFIC_ALERT_TOTAL_PER_MIN", 3000),
  /** Phút vừa rồi gấp bấy nhiêu lần trung bình 30 phút trước đó → cảnh báo tăng đột biến. */
  spikeFactor: envInt("TRAFFIC_ALERT_SPIKE_FACTOR", 5),
  /** Tự chặn IP vượt ngưỡng này/phút trong 10 phút. 0 = tắt (mặc định, vì CGNAT). */
  autoBlockPerMinute: Number(process.env.TRAFFIC_AUTOBLOCK_PER_MIN) || 0,
};

const AUTO_BLOCK_MS = 10 * MINUTE;

interface IpStat {
  /** Đếm theo phút, khoá = mốc phút (ms). */
  buckets: Map<number, number>;
  firstSeen: number;
  lastSeen: number;
  lastPath: string;
  userAgent: string;
  apiWrites: number;
  limited: number;
}

interface MinuteBucket {
  minute: number;
  total: number;
  api: number;
  pages: number;
  limited: number;
  blocked: number;
  ips: number;
}

export interface Block {
  until: number;
  reason: string;
  auto: boolean;
  createdAt: number;
}

export interface TrafficAlert {
  kind: "ip" | "total" | "spike";
  minute: number;
  count: number;
  /** Chỉ giữ trong bộ nhớ cho UI; lib/monitor.ts KHÔNG ghi trường này vào DB. */
  ip?: string;
  baseline?: number;
  autoBlocked?: boolean;
}

interface TrafficState {
  startedAt: number;
  current: MinuteBucket;
  currentIps: Set<string>;
  history: MinuteBucket[];
  ips: Map<string, IpStat>;
  blocks: Map<string, Block>;
  /** Cảnh báo chờ lib/monitor.ts nhặt đi để ghi thành thông báo. */
  alerts: TrafficAlert[];
  /** Cảnh báo gần đây, để UI hiện (kể cả sau khi đã được ghi thành thông báo). */
  recentAlerts: TrafficAlert[];
  /** IP đã cảnh báo trong phút này — mỗi IP chỉ báo một lần mỗi phút. */
  alertedIps: Set<string>;
}

const minuteOf = (t: number) => t - (t % MINUTE);

function emptyBucket(minute: number): MinuteBucket {
  return { minute, total: 0, api: 0, pages: 0, limited: 0, blocked: 0, ips: 0 };
}

const g = globalThis as unknown as { __genzTraffic?: TrafficState };
function state(): TrafficState {
  return (g.__genzTraffic ??= {
    startedAt: Date.now(),
    current: emptyBucket(minuteOf(Date.now())),
    currentIps: new Set(),
    history: [],
    ips: new Map(),
    blocks: new Map(),
    alerts: [],
    recentAlerts: [],
    alertedIps: new Set(),
  });
}

function pushAlert(s: TrafficState, a: TrafficAlert) {
  s.alerts.push(a);
  s.recentAlerts.unshift(a);
  if (s.recentAlerts.length > 50) s.recentAlerts.length = 50;
  if (s.alerts.length > 200) s.alerts.splice(0, s.alerts.length - 200);
}

/** Sang phút mới: chốt phút cũ vào lịch sử, xét tăng đột biến, dọn IP cũ. */
function roll(s: TrafficState, now: number) {
  const minute = minuteOf(now);
  if (minute === s.current.minute) return;

  const done = s.current;
  done.ips = s.currentIps.size;
  s.history.push(done);
  // Phút trống ở giữa (không ai vào) vẫn phải có mặt để biểu đồ không bị co lại.
  for (let m = done.minute + MINUTE; m < minute; m += MINUTE) s.history.push(emptyBucket(m));
  if (s.history.length > HISTORY_MINUTES) s.history.splice(0, s.history.length - HISTORY_MINUTES);

  if (done.total >= THRESHOLDS.totalPerMinute) {
    pushAlert(s, { kind: "total", minute: done.minute, count: done.total });
  } else {
    // Đột biến: so với trung bình 30 phút trước đó. Cần mốc tối thiểu để vài
    // request lúc 3 giờ sáng không bị tính là "gấp 5 lần".
    const prev = s.history.slice(-31, -1);
    if (prev.length >= 10) {
      const avg = prev.reduce((a, b) => a + b.total, 0) / prev.length;
      if (done.total >= 200 && done.total > avg * THRESHOLDS.spikeFactor) {
        pushAlert(s, { kind: "spike", minute: done.minute, count: done.total, baseline: Math.round(avg) });
      }
    }
  }

  s.current = emptyBucket(minute);
  s.currentIps = new Set();
  s.alertedIps = new Set();

  const oldest = minute - IP_WINDOW_MINUTES * MINUTE;
  for (const [ip, st] of s.ips) {
    for (const k of st.buckets.keys()) if (k < oldest) st.buckets.delete(k);
    if (!st.buckets.size) s.ips.delete(ip);
  }
  for (const [ip, b] of s.blocks) if (b.until <= now) s.blocks.delete(ip);
}

/** Request này có bị chặn không. Gọi trước recordRequest. */
export function blockedFor(ip: string, now = Date.now()): Block | null {
  const b = state().blocks.get(ip);
  if (!b) return null;
  if (b.until <= now) {
    state().blocks.delete(ip);
    return null;
  }
  return b;
}

export function recordRequest(input: {
  ip: string;
  path: string;
  method: string;
  userAgent: string;
  blocked?: boolean;
  now?: number;
}) {
  const s = state();
  const now = input.now ?? Date.now();
  roll(s, now);

  const isApi = input.path.startsWith("/api/");
  s.current.total++;
  if (isApi) s.current.api++;
  else s.current.pages++;
  if (input.blocked) {
    s.current.blocked++;
    return;
  }
  s.currentIps.add(input.ip);

  let st = s.ips.get(input.ip);
  if (!st) {
    if (s.ips.size >= MAX_TRACKED_IPS) return; // vẫn đếm vào tổng ở trên
    st = {
      buckets: new Map(),
      firstSeen: now,
      lastSeen: now,
      lastPath: "",
      userAgent: "",
      apiWrites: 0,
      limited: 0,
    };
    s.ips.set(input.ip, st);
  }
  const minute = s.current.minute;
  const count = (st.buckets.get(minute) ?? 0) + 1;
  st.buckets.set(minute, count);
  st.lastSeen = now;
  st.lastPath = input.path.slice(0, 200);
  st.userAgent = input.userAgent.slice(0, 200);
  if (isApi && input.method !== "GET" && input.method !== "HEAD") st.apiWrites++;

  if (count >= THRESHOLDS.ipPerMinute && !s.alertedIps.has(input.ip)) {
    s.alertedIps.add(input.ip);
    let autoBlocked = false;
    if (THRESHOLDS.autoBlockPerMinute && count >= THRESHOLDS.autoBlockPerMinute) {
      blockIp(input.ip, AUTO_BLOCK_MS, `Tự chặn: ${count} request/phút`, true);
      autoBlocked = true;
    }
    pushAlert(s, { kind: "ip", minute, count, ip: input.ip, autoBlocked });
  } else if (
    THRESHOLDS.autoBlockPerMinute &&
    count >= THRESHOLDS.autoBlockPerMinute &&
    !s.blocks.has(input.ip)
  ) {
    blockIp(input.ip, AUTO_BLOCK_MS, `Tự chặn: ${count} request/phút`, true);
  }
}

/** lib/rateLimit.ts báo mỗi lần trả 429 — tín hiệu có người đang dò/spam. */
export function recordLimited(ip?: string) {
  const s = state();
  roll(s, Date.now());
  s.current.limited++;
  const st = ip ? s.ips.get(ip) : undefined;
  if (st) st.limited++;
}

export function blockIp(ip: string, durationMs: number, reason: string, auto = false) {
  const now = Date.now();
  state().blocks.set(ip, { until: now + durationMs, reason: reason.slice(0, 200), auto, createdAt: now });
}

export function unblockIp(ip: string) {
  return state().blocks.delete(ip);
}

/** Nhặt các cảnh báo mới (lib/monitor.ts gọi định kỳ). */
export function drainAlerts(): TrafficAlert[] {
  const s = state();
  // Chốt phút cũ kể cả khi không còn request nào tới (đòn dội vừa dừng hẳn).
  roll(s, Date.now());
  const out = s.alerts;
  s.alerts = [];
  return out;
}

export type TrafficLevel = "normal" | "elevated" | "attack";

export interface TrafficSnapshot {
  now: number;
  startedAt: number;
  level: TrafficLevel;
  thresholds: typeof THRESHOLDS;
  /** Phút đang chạy (chưa trọn). */
  current: MinuteBucket;
  /** 60 phút gần nhất, cũ → mới, chưa gồm phút đang chạy. */
  history: MinuteBucket[];
  lastMinute: number;
  avgPerMinute: number;
  peak: { minute: number; total: number } | null;
  topIps: {
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
  }[];
  blocks: (Block & { ip: string })[];
  recentAlerts: TrafficAlert[];
  trackedIps: number;
}

export function snapshot(): TrafficSnapshot {
  const s = state();
  const now = Date.now();
  roll(s, now);

  const history = s.history;
  const last = history[history.length - 1];
  const lastMinute = last && last.minute === s.current.minute - MINUTE ? last.total : 0;
  const avg = history.length ? history.reduce((a, b) => a + b.total, 0) / history.length : 0;
  const peak = history.reduce<MinuteBucket | null>((p, b) => (!p || b.total > p.total ? b : p), null);

  const prevMinute = s.current.minute - MINUTE;
  const topIps = [...s.ips.entries()]
    .map(([ip, st]) => {
      let window = 0;
      for (const v of st.buckets.values()) window += v;
      // "Phút gần nhất" lấy phút trọn vừa qua hoặc phút đang chạy, cái nào lớn hơn.
      const lastMin = Math.max(st.buckets.get(s.current.minute) ?? 0, st.buckets.get(prevMinute) ?? 0);
      return {
        ip,
        lastMinute: lastMin,
        window,
        firstSeen: st.firstSeen,
        lastSeen: st.lastSeen,
        lastPath: st.lastPath,
        userAgent: st.userAgent,
        apiWrites: st.apiWrites,
        limited: st.limited,
        blocked: s.blocks.has(ip),
      };
    })
    .sort((a, b) => b.window - a.window)
    .slice(0, 25);

  const busiestIp = topIps.reduce((m, r) => Math.max(m, r.lastMinute), 0);
  const recentMinute = Math.max(lastMinute, s.current.total);
  let level: TrafficLevel = "normal";
  if (recentMinute >= THRESHOLDS.totalPerMinute || busiestIp >= THRESHOLDS.ipPerMinute) level = "attack";
  else if (
    recentMinute >= THRESHOLDS.totalPerMinute / 2 ||
    busiestIp >= THRESHOLDS.ipPerMinute / 2 ||
    (avg > 20 && recentMinute > avg * THRESHOLDS.spikeFactor)
  )
    level = "elevated";

  return {
    now,
    startedAt: s.startedAt,
    level,
    thresholds: THRESHOLDS,
    current: { ...s.current, ips: s.currentIps.size },
    history: [...history],
    lastMinute,
    avgPerMinute: Math.round(avg),
    peak: peak && peak.total ? { minute: peak.minute, total: peak.total } : null,
    topIps,
    blocks: [...s.blocks.entries()].map(([ip, b]) => ({ ip, ...b })),
    recentAlerts: s.recentAlerts.slice(0, 20),
    trackedIps: s.ips.size,
  };
}
