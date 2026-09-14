#!/usr/bin/env node
/**
 * Dịch tít đề tài trong hàng đợi sang tiếng Việt.
 *
 *   node scripts/translate-topics.mjs           # dịch mọi mục chưa có tít Việt
 *   node scripts/translate-topics.mjs --limit=40
 *   node scripts/translate-topics.mjs --dry-run
 *
 * Vì sao cần: từ lúc thêm nguồn Google News, hơn nửa hàng đợi là tít tiếng Anh
 * của Reuters, Nikkei, SCMP... Tổng biên tập phải đọc từng tít tiếng Anh mới
 * quyết được có bấm "Create post" hay không.
 *
 * Vì sao dùng `claude -p` chứ không gọi API dịch:
 *   - Máy chủ đã đăng nhập sẵn `claude` cho vòng viết bài, không phải xin thêm
 *     khoá nào, không phải trả thêm tiền.
 *   - Tít báo cần DIỄN GIẢI chứ không dịch từng chữ. "China-plus-one strategy"
 *     mà dịch máy thì ra "chiến lược Trung Quốc cộng một" — đọc xong vẫn không
 *     hiểu. Ở đây yêu cầu viết lại cho người Việt đọc là hiểu ngay.
 *
 * MỘT lượt gọi cho cả mẻ, không phải mỗi tít một lượt: rẻ hơn nhiều và tránh
 * đốt quota. Mỗi lượt thu thập chỉ thêm ~18 đề tài nên một lượt là đủ.
 *
 * Không có `claude` trên máy (chạy dưới Windows chẳng hạn) thì script chỉ ghi
 * một dòng cảnh báo rồi thoát êm — cột topicVi để trống, màn hình rơi về tít gốc.
 */
import { execFileSync } from "child_process";
import path from "path";

const DATA_DIR = process.env.DATA_DIR ?? path.join(process.cwd(), "data");
const DB = process.env.DATABASE_PATH ?? path.join(DATA_DIR, "app.db");

const arg = (name, fallback) => {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
};
const LIMIT = Number(arg("limit", 60));
const DRY_RUN = process.argv.includes("--dry-run");

const quote = (v) => "'" + String(v).replace(/'/g, "''") + "'";

function sql(query, { json = false } = {}) {
  const args = ["-cmd", ".timeout 5000"];
  if (json) args.push("-json");
  const out = execFileSync("sqlite3", [...args, DB, query], {
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  }).trim();
  if (!json) return out;
  return out ? JSON.parse(out) : [];
}

/**
 * Kho dữ liệu lưu DateTime ở dạng "2026-09-04T11:08:40.049+00:00". Giá trị mặc
 * định của SQLite cho ra "2026-09-04 11:08:40" — thiếu chữ T, thiếu mili giây,
 * thiếu múi giờ — mà dấu cách xếp trước chữ "T" nên trộn hai dạng là sắp xếp
 * theo thời gian sai hết.
 */
const nowStamp = () => new Date().toISOString().replace("Z", "+00:00");

const PROMPT_HEAD = `Bạn là biên tập viên của một trang tin tiếng Việt cho bạn đọc 18-27 tuổi.

Dưới đây là danh sách tít đề tài đang chờ trong hàng đợi toà soạn, mỗi dòng bắt
đầu bằng số thứ tự. Hãy viết lại MỖI tít bằng tiếng Việt tự nhiên, dễ hiểu.

Yêu cầu:
- Không dịch từng chữ. Người đọc lướt qua phải hiểu ngay chuyện gì, ở đâu.
- Giữ đúng tên riêng, con số, địa danh. Không thêm thông tin không có trong tít.
- Thuật ngữ lạ thì diễn giải ngắn gọn thay vì bê nguyên: "China-plus-one
  strategy" nên thành "chiến lược đặt thêm nhà máy ngoài Trung Quốc".
- Ngắn gọn, dưới 80 ký tự nếu được. Không giật tít, không thêm cảm thán.
- Tít vốn đã là tiếng Việt thì chép lại gần như nguyên văn, chỉ sửa nếu khó hiểu.

Trả về ĐÚNG một dòng cho mỗi tít, đúng thứ tự, theo dạng:
<số>. <tít tiếng Việt>

Không viết gì thêm, không mở đầu, không giải thích.

DANH SÁCH:
`;

/**
 * Gọi claude một lượt cho cả mẻ. Trả về mảng chuỗi cùng độ dài với `topics`;
 * phần tử nào không đọc được thì để null.
 */
function translateBatch(topics) {
  const prompt =
    PROMPT_HEAD + topics.map((t, i) => `${i + 1}. ${t}`).join("\n") + "\n";

  let out;
  try {
    out = execFileSync("claude", ["-p", prompt, "--allowed-tools", ""], {
      encoding: "utf8",
      maxBuffer: 8 * 1024 * 1024,
      timeout: 5 * 60 * 1000,
    });
  } catch (err) {
    const why = err.code === "ENOENT" ? "chưa cài claude trên máy này" : err.message;
    console.warn(`[translate-topics] bỏ qua bước dịch: ${why}`);
    return null;
  }

  // Đọc lại theo SỐ THỨ TỰ ở đầu dòng, không đọc theo thứ tự dòng: model đôi
  // khi chèn thêm một dòng trống hay một câu thừa, bám theo thứ tự dòng là
  // lệch hết cả mẻ và gán tít Việt cho nhầm đề tài.
  const byIndex = new Array(topics.length).fill(null);
  for (const line of out.split("\n")) {
    const m = line.match(/^\s*(\d+)\s*[.)]\s*(.+?)\s*$/);
    if (!m) continue;
    const i = Number(m[1]) - 1;
    if (i >= 0 && i < topics.length && !byIndex[i]) byIndex[i] = m[2];
  }
  return byIndex;
}

function main() {
  const rows = sql(
    "SELECT id, topic FROM research_requests " +
      "WHERE (topicVi IS NULL OR topicVi = '') AND status IN ('pending','in_progress') " +
      `ORDER BY createdAt DESC LIMIT ${LIMIT};`,
    { json: true },
  );

  if (!rows.length) {
    console.log("[translate-topics] không có đề tài nào cần dịch.");
    return;
  }
  console.log(`[translate-topics] dịch ${rows.length} tít...`);

  const translated = translateBatch(rows.map((r) => r.topic));
  if (!translated) {
    process.exitCode = 0; // thiếu claude không phải lỗi của lượt thu thập
    return;
  }

  let done = 0;
  const updates = [];
  rows.forEach((row, i) => {
    const vi = translated[i];
    // Bỏ qua khi model không trả dòng đó, hoặc trả lại y nguyên tít gốc.
    if (!vi || vi === row.topic) return;
    done++;
    console.log(`   ${row.topic}\n     → ${vi}`);
    updates.push(
      `UPDATE research_requests SET topicVi = ${quote(vi)}, ` +
        `updatedAt = ${quote(nowStamp())} WHERE id = ${quote(row.id)};`,
    );
  });

  if (DRY_RUN) {
    console.log(`\n[translate-topics] DRY RUN — không ghi gì (${done} tít).`);
    return;
  }
  if (updates.length) sql(updates.join("\n"));
  console.log(`\n[translate-topics] đã ghi ${done}/${rows.length} tít tiếng Việt.`);
}

try {
  main();
} catch (err) {
  console.error("[translate-topics] LỖI:", err.message);
  process.exitCode = 1;
}
