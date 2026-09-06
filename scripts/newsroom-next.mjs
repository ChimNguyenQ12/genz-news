/**
 * Lấy đề tài kế tiếp trong hàng đợi cho phóng viên AI.
 *
 *   node scripts/newsroom-next.mjs
 *
 * In ra JSON một dòng:
 *   {"id":"...","topic":"...","urls":[...],"notes":"..."}   — có việc
 *   {"empty":true}                                          — hàng đợi rỗng
 *
 * Đề tài thuộc nhóm nhạy cảm (chủ quyền, chính trị, tôn giáo, sắc tộc, vụ án
 * đang điều tra) KHÔNG được giao cho máy. Hiến chương bắt phải hỏi tổng biên
 * tập trước, mà cron thì không có ai để hỏi — nên script đánh dấu rồi bỏ qua.
 */
import prismaPkg from "@prisma/client";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import path from "path";

const { PrismaClient } = prismaPkg;
const DATA_DIR = process.env.DATA_DIR ?? path.join(process.cwd(), "data");
const DB_PATH = process.env.DATABASE_PATH ?? path.join(DATA_DIR, "app.db");

const prisma = new PrismaClient({
  adapter: new PrismaBetterSqlite3({ url: DB_PATH }),
});

/** Bắt được thì dừng lại chờ người. Thà bỏ sót còn hơn viết ẩu. */
const SENSITIVE = [
  // chủ quyền, biển đảo
  "hoàng sa", "trường sa", "biển đông", "chủ quyền", "lãnh hải", "lãnh thổ",
  "spratly", "paracel", "south china sea",
  // chính trị, nhà nước
  "bộ chính trị", "tổng bí thư", "quốc hội", "chính phủ", "bầu cử", "đảng cộng sản",
  "biểu tình", "đảo chính", "election", "coup", "protest",
  // tôn giáo, sắc tộc
  "tôn giáo", "phật giáo", "công giáo", "tin lành", "hồi giáo", "dân tộc thiểu số",
  "sắc tộc", "religion", "ethnic",
  // vụ án đang điều tra
  "khởi tố", "bắt tạm giam", "điều tra", "cáo buộc", "toà án", "xét xử",
  "indicted", "arrested", "on trial",
];

function sensitiveHit(text) {
  const hay = String(text ?? "").toLowerCase();
  return SENSITIVE.find((k) => hay.includes(k));
}

function parseUrls(raw) {
  try {
    const v = JSON.parse(raw ?? "[]");
    return Array.isArray(v) ? v.map(String) : [];
  } catch {
    return [];
  }
}

async function main() {
  const queue = await prisma.researchRequest.findMany({
    where: { status: "pending" },
    orderBy: { createdAt: "asc" },
    take: 50,
  });

  for (const row of queue) {
    const hit = sensitiveHit(`${row.topic}\n${row.notes}`);
    if (hit) {
      // Để nguyên "pending" — vẫn nằm chờ, nhưng có ghi chú để tổng biên tập
      // thấy vì sao máy không đụng vào. Chỉ ghi một lần.
      if (!String(row.reporterNote ?? "").includes("[nhạy cảm]")) {
        await prisma.researchRequest.update({
          where: { id: row.id },
          data: {
            reporterNote:
              `[nhạy cảm] Khớp từ khoá "${hit}". Theo hiến chương, nhóm chủ đề ` +
              `này phải có tổng biên tập duyệt trước khi viết. Máy bỏ qua.`,
          },
        });
      }
      continue;
    }

    await prisma.researchRequest.update({
      where: { id: row.id },
      data: { status: "in_progress" },
    });

    console.log(
      JSON.stringify({
        id: row.id,
        topic: row.topic,
        urls: parseUrls(row.urls),
        notes: row.notes ?? "",
      }),
    );
    return;
  }

  console.log(JSON.stringify({ empty: true }));
}

main()
  .catch((err) => {
    console.error("[newsroom-next]", err.message);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
