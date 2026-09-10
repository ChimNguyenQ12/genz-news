/**
 * Nhịp tim của Automatically Generate.
 *
 *   node scripts/newsroom-status.mjs start  --id=<uuid> --topic="..." [--step=writing]
 *   node scripts/newsroom-status.mjs beat
 *   node scripts/newsroom-status.mjs finish --result=saved|failed|skipped|empty [--error="..."]
 *
 * Vì sao cần: lượt viết (`claude -p`) chạy trên host, còn app nằm trong
 * container. App không `ps` được, không thấy tiến trình đó sống hay chết —
 * trạng thái "in_progress" trong cơ sở dữ liệu chỉ nói "đã giao việc", không
 * nói việc còn đang chạy. Thứ duy nhất hai bên dùng chung là thư mục dữ liệu,
 * nên lượt viết ghi trạng thái của nó xuống một tệp JSON ở đó và app đọc lên.
 *
 * Ghi bằng Node chứ không ghép chuỗi trong bash: tên đề tài có dấu nháy, dấu
 * xuống dòng và tiếng Việt — ghép tay là sinh ra JSON hỏng.
 *
 * KHÔNG phụ thuộc gói ngoài nào. Đọc lib/newsroom.ts để xem phía app dùng gì.
 */
import fs from "fs";
import path from "path";

const DATA_DIR =
  process.env.DATA_DIR ??
  (process.env.DATABASE_PATH
    ? path.dirname(process.env.DATABASE_PATH)
    : path.join(process.cwd(), "data"));

const FILE = process.env.NEWSROOM_STATUS_FILE ?? path.join(DATA_DIR, "newsroom-status.json");

function arg(name) {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : "";
}

function read() {
  try {
    const parsed = JSON.parse(fs.readFileSync(FILE, "utf8"));
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function write(next) {
  fs.mkdirSync(path.dirname(FILE), { recursive: true });
  // Ghi tệp tạm rồi đổi tên: app có thể đọc đúng lúc mình đang ghi, mà đổi tên
  // là thao tác nguyên tử — nó sẽ thấy bản cũ hoặc bản mới, không thấy nửa vời.
  const tmp = `${FILE}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(next, null, 2) + "\n", "utf8");
  fs.renameSync(tmp, FILE);
}

const command = process.argv[2] ?? "";
const now = new Date().toISOString();
const prev = read();

switch (command) {
  case "start":
    write({
      state: "running",
      step: arg("step") || "writing",
      requestId: arg("id"),
      topic: arg("topic"),
      startedAt: now,
      updatedAt: now,
      // Xoá kết quả của lượt trước để màn hình không bày lỗi cũ cạnh lượt mới.
      finishedAt: prev.finishedAt ?? null,
      lastResult: null,
      lastError: null,
    });
    break;

  case "beat":
    // Chỉ đập nhịp khi đang chạy: một nhịp lạc sau khi đã kết thúc sẽ làm app
    // tưởng lượt cũ vẫn còn sống.
    if (prev.state === "running") write({ ...prev, updatedAt: now });
    break;

  case "finish":
    write({
      ...prev,
      state: "idle",
      step: null,
      updatedAt: now,
      finishedAt: now,
      lastResult: arg("result") || "failed",
      lastError: arg("error") || null,
    });
    break;

  default:
    console.error(
      "[newsroom-status] cần một trong: start | beat | finish",
    );
    process.exitCode = 1;
}
