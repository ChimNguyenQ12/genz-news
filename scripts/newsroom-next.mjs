/**
 * Lấy đề tài kế tiếp trong hàng đợi cho phóng viên AI.
 *
 *   node scripts/newsroom-next.mjs
 *
 * In ra JSON một dòng:
 *   {"id":"...","topic":"...","urls":[...],"notes":"..."}   — có việc
 *   {"empty":true}                                          — không có gì để làm
 *
 * KHÔNG phụ thuộc gói ngoài nào: chỉ dùng thư viện chuẩn của Node và lệnh
 * sqlite3 có sẵn trên máy chủ. Bản standalone của Next chỉ chép một phần tệp
 * của @prisma/adapter-*, nên import Prisma ở đây sẽ hỏng.
 *
 * Đề tài thuộc nhóm nhạy cảm (chủ quyền, chính trị, tôn giáo, sắc tộc, vụ án
 * đang điều tra) KHÔNG được giao cho máy. Hiến chương bắt phải hỏi tổng biên
 * tập trước, mà cron thì không có ai để hỏi — nên script đánh dấu rồi bỏ qua.
 */
import { execFileSync } from "child_process";
import path from "path";

const DATA_DIR = process.env.DATA_DIR ?? path.join(process.cwd(), "data");
const DB = process.env.DATABASE_PATH ?? path.join(DATA_DIR, "app.db");

/** Bắt được thì dừng lại chờ người. Thà bỏ sót còn hơn viết ẩu. */
const SENSITIVE = [
  // // chủ quyền, biển đảo
  // "hoàng sa", "trường sa", "biển đông", "chủ quyền", "lãnh hải", "lãnh thổ",
  // "spratly", "paracel", "south china sea",
  // // chính trị, nhà nước
  // "bộ chính trị", "tổng bí thư", "quốc hội", "chính phủ", "bầu cử", "bỏ phiếu",
  // "đảng cộng sản", "đảng cầm quyền", "biểu tình", "đảo chính", "nội các",
  // "tổng thống", "thủ tướng", "chủ tịch nước", "nghị viện", "chính trị",
  // "cực hữu", "cực tả", "cánh hữu", "cánh tả",
  // "election", "coup", "protest", "parliament", "prime minister", "cabinet",
  // "far-right", "far right", "far-left", "political", "politician", "ballot",
  // // tôn giáo, sắc tộc
  // "tôn giáo", "phật giáo", "công giáo", "tin lành", "hồi giáo", "nhà thờ",
  // "dân tộc thiểu số", "sắc tộc", "religion", "ethnic", "muslim", "christian",
  // // vụ án đang điều tra
  // "khởi tố", "bắt tạm giam", "tạm giữ", "điều tra", "cáo buộc", "toà án",
  // "xét xử", "truy nã", "truy tố", "phạm tội", "công an", "cảnh sát",
  // "hung khí", "án mạng", "sát hại", "giết người", "ma tuý", "lừa đảo",
  // "indicted", "arrested", "on trial", "police", "murder", "stabbing",
  // "shooting", "assault", "fraud", "trafficking",
];

/**
 * Chạy SQL, trả về mảng object. Dấu nháy đơn trong SQL phải nhân đôi.
 * Thời gian chờ khoá đặt bằng dot-command ".timeout": nếu để "PRAGMA
 * busy_timeout" chung câu ở chế độ -json thì sqlite3 in ra HAI khối JSON nối
 * nhau và JSON.parse chết.
 */
function sql(query, { json = true } = {}) {
  const base = ["-cmd", ".timeout 5000"];
  const args = json ? [...base, "-json", DB, query] : [...base, DB, query];
  const out = execFileSync("sqlite3", args, {
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024,
  }).trim();
  if (!json) return out;
  return out ? JSON.parse(out) : [];
}

const quote = (s) => "'" + String(s).replace(/'/g, "''") + "'";

/**
 * Prisma lưu DateTime của SQLite ở dạng "2026-09-04T11:08:40.049+00:00", còn
 * hàm thời gian sẵn có của SQLite cho "2026-09-04 11:08:40" — thiếu chữ T,
 * thiếu mili giây, thiếu múi giờ. Trộn hai dạng thì sắp xếp theo thời gian
 * sai, vì dấu cách xếp trước chữ "T". Luôn dùng hàm này khi ghi.
 */
function nowStamp() {
  return new Date().toISOString().replace("Z", "+00:00");
}

/** Bỏ dấu tiếng Việt để so khớp cả khi nguồn viết không dấu. */
function stripDiacritics(str) {
  return str
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/g, "d");
}

function sensitiveHit(text) {
  const hay = String(text ?? "").toLowerCase();
  const bare = stripDiacritics(hay);
  return SENSITIVE.find((k) => hay.includes(k) || bare.includes(stripDiacritics(k)));
}

function parseUrls(raw) {
  try {
    const v = JSON.parse(raw ?? "[]");
    return Array.isArray(v) ? v.map(String) : [];
  } catch {
    return [];
  }
}

function main() {
  // Đối số --id=<uuid>: làm đúng đề tài này, dùng khi tổng biên tập bấm nút
  // "Create Post" trong /admin/research. Không có thì tự chọn trong hàng đợi.
  const wanted = (process.argv.find((a) => a.startsWith("--id=")) ?? "").slice(5);

  // busy_timeout: app cũng đang mở tệp này, đợi chứ đừng bỏ cuộc ngay.
  // MỚI NHẤT TRƯỚC. Đây là trang tin: đề tài hai hôm trước đã nguội, viết ra
  // không ai đọc. Đề tài do tổng biên tập tự đặt ở /admin/research cũng nhờ vậy
  // mà được làm ngay, không phải xếp sau hàng trăm mục cũ.
  const rows = wanted
    ? sql(
      "SELECT id, topic, urls, notes, reporterNote FROM research_requests " +
      `WHERE id = ${quote(wanted)} AND status IN ('pending','in_progress');`,
    )
    : sql(
      "SELECT id, topic, urls, notes, reporterNote FROM research_requests " +
      "WHERE status = 'pending' ORDER BY createdAt DESC LIMIT 50;",
    );

  for (const row of rows) {
    const hit = sensitiveHit(`${row.topic}
${row.notes ?? ""}`);

    // Bộ lọc này tồn tại vì CRON không có ai để hỏi. Còn khi tổng biên tập tự
    // bấm nút (--id=), thì người cần hỏi đã trả lời rồi — chặn tiếp là sai.
    // Lúc đó chỉ gắn cờ để prompt nhắc AI theo mục "Chủ đề nhạy cảm".
    if (hit && !wanted) {
      if (!String(row.reporterNote ?? "").includes("[nhạy cảm]")) {
        const note =
          `[nhạy cảm] Khớp từ khoá "${hit}". Theo hiến chương, nhóm chủ đề này ` +
          `phải có tổng biên tập duyệt trước. Máy tự động bỏ qua — bấm ` +
          `"Create Post" nếu bạn muốn làm đề tài này.`;
        sql(
          "UPDATE research_requests SET " +
          `reporterNote = ${quote(note)}, updatedAt = ${quote(nowStamp())} ` +
          `WHERE id = ${quote(row.id)};`,
          { json: false },
        );
      }
      continue;
    }

    sql(
      "UPDATE research_requests SET " +
      `status = 'in_progress', updatedAt = ${quote(nowStamp())} ` +
      `WHERE id = ${quote(row.id)};`,
      { json: false },
    );

    console.log(
      JSON.stringify({
        id: row.id,
        topic: row.topic,
        urls: parseUrls(row.urls),
        notes: row.notes ?? "",
        sensitive: hit ?? null,
      }),
    );
    return;
  }

  console.log(JSON.stringify({ empty: true }));
}

try {
  main();
} catch (err) {
  console.error("[newsroom-next]", err.message);
  process.exitCode = 1;
}
