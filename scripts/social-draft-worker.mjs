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

function prompt(job) {
  return `Bạn là admin page tin tức GenZ News, đang lướt Threads và kể lại tin cho hội bạn 18–27 tuổi ở Việt Nam.
Viết MỘT bài Threads dài 2–4 câu từ tin dưới đây.

Giọng văn — quan trọng nhất:
- Viết như người thật gõ vội trên điện thoại, KHÔNG phải giọng báo, KHÔNG phải giọng thông cáo. Láo láo, lầy, hơi cà khịa, cảm thán thật lòng.
- Xưng hô kiểu "mấy ní", "ae", "mn", "tụi mình", "bà con". Thoải mái viết tắt: ko, k, j, r, vs, cx, mn, ae, trc, đc, ntn, bt, kiểu.
- Viết thường cũng được, không cần hoa đầu câu. Câu cụt, ngắt nhịp tự nhiên, không cần đủ chủ vị. Có thể dùng "luôn", "nha", "á", "trời ơi", "thôi xong", "căng", "toang", "chill".
- Mở bằng phản ứng hoặc chính cái tin, KHÔNG mở bằng câu dẫn kiểu "Tin mới:", "Bạn có biết".
- Được thêm MỘT câu phản ứng đời thường, cà khịa của người đọc (kiểu "ae lên đồ đi bộ thôi", "ví tiền khóc thét") — đó là cảm xúc, không phải dữ kiện. 0–2 emoji, không bắt buộc.

Ví dụ phong cách (CHỈ để bắt giọng, không lấy dữ kiện từ đây):
Tin gốc: "Giá xăng tăng lần 4 liên tiếp, ưu đãi thuế sắp hết vào 30/9. Xăng E10 vượt 27.000 đồng/lít sau đợt tăng chiều 24/9..."
Viết: "Xăng tăng liên tiếp 4 lần luôn mấy ní, giờ hơn 27k rồi, combo vừa xăng mắc lương thấp trời mưa kẹt xe, hình như ưu đãi thuế tới hết 30/09 này có khi còn tăng nữa, ae lên đồ đi bộ thôi, mang đồ bơi nữa cũng ok"

Dữ kiện — không được lệch:
- CHỈ dùng dữ kiện có trong tít và tóm tắt: con số, ngày, tên riêng phải đúng y (viết gọn "27k" thay "27.000 đồng" thì được). Không thêm số liệu, tên người/tổ chức, chi tiết không có trong tin. Câu cà khịa không được nghe như một dữ kiện mới.
- Không chèn link, không hashtag, không nhắc tới AI, bot hay việc đăng tự động. Không chửi thề, không tục, không miệt thị ai.
- Tin về chủ quyền, chính trị, tôn giáo, sắc tộc, tai nạn, thương vong, thiên tai hay vụ án: BỎ giọng lầy. Vẫn viết ngắn gọn đời thường, nhưng nghiêm túc, không đùa, không cà khịa, không emoji hài, không thêm bình luận hay kết luận riêng — chỉ thuật lại dữ kiện.
- Tối đa 380 ký tự.

Chỉ trả về đúng nội dung bài. Không giải thích, không đặt trong ngoặc kép.

Tít: ${job.title}
Tóm tắt: ${job.dek}
Chuyên mục: ${job.category}`;
}

function clean(text) {
  let t = String(text).trim().replace(/^["“”']+|["“”']+$/g, "").trim();
  // Lỡ có hashtag / link thì bỏ: thẻ chủ đề do mình gắn, link nằm ở reply.
  t = t.replace(/https?:\/\/\S+/g, "").replace(/(^|\s)#[\p{L}\p{N}_]+/gu, "$1").replace(/[ \t]+\n/g, "\n").trim();
  // Thẻ chủ đề Threads đi riêng (topic_tag, chọn trong khung soạn), không nằm trong nội dung.
  if (t.length > MAX) t = `${t.slice(0, MAX - 1).trimEnd()}…`;
  return t;
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
    write(id, { text: clean(r.stdout) });
    log(`xong ${id}`);
  } else {
    const why = r.status === 124 ? "took over 150 s" : (r.stderr || r.stdout || `exit ${r.status}`).trim().slice(0, 300);
    write(id, { error: `Could not write a draft: ${why}` });
    log(`hỏng ${id}: ${why}`);
  }
}
