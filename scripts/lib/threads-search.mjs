/**
 * Đo độ "đang được bàn" của một từ khoá trên Threads, bằng trang tìm kiếm công
 * khai threads.com/search — KHÔNG phải API.
 *
 * Vì sao không dùng API: endpoint keyword_search của Threads API chỉ tìm trong
 * bài của chính tài khoản đăng nhập cho tới khi app qua App Review (quyền nâng
 * cao threads_keyword_search). Tổng biên tập quyết định dùng trang web trong
 * lúc chờ duyệt. Đổi lại, đây là đọc trang ngoài API, trái điều khoản của Meta
 * và hỏng bất cứ lúc nào Threads đổi giao diện — nên:
 *
 *   - tắt được bằng TRENDS_THREADS=0;
 *   - truy vấn ít (THREADS_MAX_QUERIES, mặc định 12) và cách nhau vài giây;
 *   - KHÔNG BAO GIỜ làm hỏng lượt thu thập: đọc không ra gì thì trả về rỗng
 *     kèm lý do, và dừng hẳn sau vài truy vấn trắng liên tiếp (gần như chắc
 *     chắn là bị bắt đăng nhập hoặc giao diện đã đổi).
 *
 * Cách đọc: trang Threads nhúng dữ liệu bài vào các thẻ
 * <script type="application/json">. Không bám vào một đường dẫn JSON cố định
 * (đổi liên tục) mà đi khắp cây, nhặt mọi object trông như một bài Threads:
 * có `code`, có `user.username`, có `caption.text`.
 */

const SEARCH_URL = "https://www.threads.com/search";

/** Bài nào được tính là "gần đây" khi đo độ nóng. */
const RECENT_HOURS = 72;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/** Lấy nội dung mọi thẻ <script type="application/json"> trong trang. */
function jsonBlobs(html) {
  const out = [];
  const re = /<script[^>]*type="application\/json"[^>]*>([\s\S]*?)<\/script>/g;
  let m;
  while ((m = re.exec(html))) {
    const raw = m[1].trim();
    if (!raw || !raw.includes("username")) continue;
    try {
      out.push(JSON.parse(raw));
    } catch {
      // blob hỏng / không phải JSON thuần — bỏ qua
    }
  }
  return out;
}

/** Đi khắp cây JSON, nhặt object có dáng một bài Threads. */
function collectPosts(node, found, depth = 0) {
  if (!node || typeof node !== "object" || depth > 60) return;
  if (Array.isArray(node)) {
    for (const x of node) collectPosts(x, found, depth + 1);
    return;
  }
  const code = typeof node.code === "string" ? node.code : null;
  const username = node.user && typeof node.user.username === "string" ? node.user.username : null;
  const text = node.caption && typeof node.caption.text === "string" ? node.caption.text : null;
  if (code && username && text !== null && !found.has(code)) {
    const info = node.text_post_app_info ?? {};
    found.set(code, {
      code,
      username,
      text: text.replace(/\s+/g, " ").trim(),
      likes: num(node.like_count),
      replies: num(info.direct_reply_count),
      reposts: num(info.repost_count),
      quotes: num(info.quote_count),
      takenAt: num(node.taken_at) ? new Date(num(node.taken_at) * 1000).toISOString() : null,
      url: `https://www.threads.com/@${username}/post/${code}`,
    });
  }
  for (const key of Object.keys(node)) collectPosts(node[key], found, depth + 1);
}

/** Điểm tương tác của một bài: trả lời và đăng lại nặng hơn một lượt thích. */
export function engagement(p) {
  return p.likes + p.replies * 3 + (p.reposts + p.quotes) * 2;
}

/**
 * Tìm một từ khoá. Trả về { posts, reason } — reason khác rỗng khi không đọc
 * được gì (để log ra cho người vận hành biết vì sao). `loginWall` = bị chuyển
 * tới trang đăng nhập, tức phiên (cookie) không còn dùng được.
 *
 * @param {string} keyword
 * @param {{ userAgent?: string, cookie?: string, timeoutMs?: number }} [opts]
 */
export async function searchThreads(keyword, { userAgent, cookie, timeoutMs = 20000 } = {}) {
  const url = `${SEARCH_URL}?${new URLSearchParams({ q: keyword, serp_type: "default" })}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": userAgent ?? "Mozilla/5.0",
        "Accept-Language": "vi-VN,vi;q=0.9,en;q=0.8",
        Accept: "text/html,application/xhtml+xml",
        ...(cookie ? { Cookie: cookie } : {}),
      },
      redirect: "follow",
      signal: controller.signal,
    });
    if (!res.ok) return { posts: [], reason: `HTTP ${res.status}` };
    if (/\/login|accounts\/login/.test(res.url)) {
      return { posts: [], reason: "bị chuyển tới trang đăng nhập", loginWall: true };
    }
    const html = await res.text();
    const found = new Map();
    for (const blob of jsonBlobs(html)) collectPosts(blob, found);
    const posts = [...found.values()].sort((a, b) => engagement(b) - engagement(a));
    if (!posts.length) {
      return {
        posts,
        reason: /log in|đăng nhập|login/i.test(html.slice(0, 200_000))
          ? "trang không có bài (có thể bắt đăng nhập)"
          : "trang không có dữ liệu bài nào đọc được",
      };
    }
    return { posts, reason: "" };
  } catch (err) {
    return { posts: [], reason: err.name === "AbortError" ? "quá thời gian" : err.message };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Tóm tắt độ nóng trên Threads của một từ khoá từ danh sách bài tìm được.
 * `buzz` = tổng tương tác của 10 bài cao nhất trong RECENT_HOURS giờ qua (bài
 * không rõ ngày vẫn tính — trang tìm kiếm mặc định đã ưu tiên bài mới).
 */
export function summarize(posts, now = Date.now()) {
  const recent = posts.filter(
    (p) => !p.takenAt || now - new Date(p.takenAt).getTime() < RECENT_HOURS * 3600_000,
  );
  const top = recent.slice(0, 10);
  return {
    postCount: posts.length,
    recentCount: recent.length,
    buzz: top.reduce((s, p) => s + engagement(p), 0),
    top: top.slice(0, 3),
  };
}

/**
 * Chạy lần lượt nhiều từ khoá, cách nhau `delayMs`. Dừng sớm sau
 * `giveUpAfter` truy vấn trắng liên tiếp ngay từ đầu — trang đã đổi hoặc bị
 * chặn thì hỏi thêm chỉ phí thời gian của lượt cron.
 */
export async function searchMany(keywords, { delayMs = 2500, giveUpAfter = 3, ...opts } = {}) {
  const results = new Map();
  let emptyStreak = 0;
  let anyHit = false;
  let lastReason = "";
  for (const [i, kw] of keywords.entries()) {
    if (i > 0) await sleep(delayMs);
    const r = await searchThreads(kw, opts);
    results.set(kw, r);
    if (r.posts.length) {
      anyHit = true;
      emptyStreak = 0;
    } else {
      emptyStreak++;
      lastReason = r.reason;
      if (!anyHit && emptyStreak >= giveUpAfter) {
        return { results, aborted: `${giveUpAfter} truy vấn đầu đều trắng (${lastReason})` };
      }
    }
  }
  return { results, aborted: "" };
}
