/**
 * Viết bài mạng xã hội giọng GenZ cho nút "✨ Tạo bài GenZ" ở /admin/threads.
 *
 *   * * * * * flock -n /var/lock/genz-news-social-draft.lock node /srv/genz-news/repo/scripts/social-draft-worker.mjs >> /var/log/genz-news-social-draft.log 2>&1
 *
 * Chạy trên HOST (nơi có claude đã đăng nhập), không trong container. Nhặt
 * yêu cầu app thả vào data/social-drafts/inbox/, gọi `claude -p`, ghi kết quả
 * vào data/social-drafts/out/ (xem lib/social/drafts.ts). Khoá riêng, không
 * dùng chung khoá với lượt viết bài: một lượt viết bài kéo dài hàng chục phút,
 * người đang bấm nút không phải chờ nó.
 */
import fs from "fs";
import os from "os";
import path from "path";
import { spawnSync } from "child_process";

const DATA_DIR = process.env.DATA_DIR ?? "/srv/genz-news/data";
const ROOT = path.join(DATA_DIR, "social-drafts");
const INBOX = path.join(ROOT, "inbox");
const OUT = path.join(ROOT, "out");
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.json$/;
const MAX = 500; // Threads
const log = (m) => console.log(`${new Date().toISOString()} [social-draft] ${m}`);

const hashtag = (t) => `#${String(t).normalize("NFC").replace(/[^\p{L}\p{N}]+/gu, "")}`;

function prompt(job) {
  return `Bạn là biên tập viên mạng xã hội của GenZ News, trang tin cho người 18–27 tuổi ở Việt Nam.
Viết MỘT bài Threads dài 2–3 câu từ tin dưới đây.

Yêu cầu:
- Câu đầu là cú mở gây tò mò, nhịp nhanh, giọng GenZ tự nhiên như người thật đang kể chuyện. Có thể dùng 1–2 emoji.
- CHỈ dùng dữ kiện có trong tít và tóm tắt. Không thêm số liệu, tên người/tổ chức, chi tiết hay nhận định không có ở đó — kể cả điều "ai cũng biết". Không gán cách thức hay thái độ mà tin không nói (kiểu "âm thầm", "bất ngờ", "gây sốc"). Được nói gọn, nói khéo, nhưng không phóng đại làm sai nghĩa tin.
- Không chèn link, không hashtag, không nhắc tới AI, bot hay việc đăng tự động.
- Không chêm tiếng lóng gượng ép, không tục.
- Tin về chủ quyền, chính trị, tôn giáo, sắc tộc, tai nạn, thương vong hay vụ án: giữ giọng nghiêm túc, không đùa, không giật gân, và KHÔNG thêm bình luận hay kết luận riêng — chỉ thuật lại dữ kiện.
- Tối đa 380 ký tự.

Chỉ trả về đúng nội dung bài. Không giải thích, không đặt trong ngoặc kép.

Tít: ${job.title}
Tóm tắt: ${job.dek}
Chuyên mục: ${job.category}`;
}

function clean(text, category) {
  let t = String(text).trim().replace(/^["“”']+|["“”']+$/g, "").trim();
  // Lỡ có hashtag / link thì bỏ: thẻ chủ đề do mình gắn, link nằm ở reply.
  t = t.replace(/https?:\/\/\S+/g, "").replace(/(^|\s)#[\p{L}\p{N}_]+/gu, "$1").replace(/[ \t]+\n/g, "\n").trim();
  const tag = category ? `\n\n${hashtag(category)}` : "";
  if (t.length + tag.length > MAX) t = `${t.slice(0, MAX - tag.length - 1).trimEnd()}…`;
  return t + tag;
}

function write(id, data) {
  const tmp = path.join(OUT, `.${id}.tmp`);
  fs.writeFileSync(tmp, JSON.stringify(data));
  fs.chmodSync(tmp, 0o644);
  fs.renameSync(tmp, path.join(OUT, `${id}.json`));
}

if (!fs.existsSync(INBOX)) process.exit(0);
fs.mkdirSync(OUT, { recursive: true });

// Dọn kết quả cũ hơn 1 ngày: trang quản trị chỉ cần chúng trong vài phút.
for (const f of fs.readdirSync(OUT)) {
  const p = path.join(OUT, f);
  if (Date.now() - fs.statSync(p).mtimeMs > 24 * 3600 * 1000) fs.rmSync(p, { force: true });
}

for (const f of fs.readdirSync(INBOX)) {
  if (!UUID.test(f)) continue;
  const id = f.slice(0, -5);
  const file = path.join(INBOX, f);
  let job;
  try {
    job = JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    continue;
  }
  // Xoá TRƯỚC khi chạy: lượt này hỏng thì báo lỗi, đừng thử lại vô hạn.
  fs.rmSync(file, { force: true });
  log(`viết cho: ${job.title}`);

  // Chạy trong thư mục tạm: khỏi nạp CLAUDE.md dài của repo, nhanh và rẻ hơn.
  const r = spawnSync(
    "timeout",
    ["--signal=TERM", "--kill-after=15", "150", "claude", "-p", prompt(job), "--max-turns", "2"],
    { cwd: os.tmpdir(), encoding: "utf8", maxBuffer: 1024 * 1024 },
  );
  if (r.status === 0 && r.stdout.trim()) {
    write(id, { text: clean(r.stdout, job.category) });
    log(`xong ${id}`);
  } else {
    const why = r.status === 124 ? "quá 150 giây" : (r.stderr || r.stdout || `mã ${r.status}`).trim().slice(0, 300);
    write(id, { error: `Không viết được: ${why}` });
    log(`hỏng ${id}: ${why}`);
  }
}
