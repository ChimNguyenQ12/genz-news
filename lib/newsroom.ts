import fs from "fs/promises";
import path from "path";

/**
 * Nhịp tim của Automatically Generate.
 *
 * App chạy trong container, còn lượt viết (`claude -p`) chạy trên host — app
 * không nhìn thấy tiến trình đó, không `ps` được, không `kill` được. Thứ duy
 * nhất hai bên dùng chung là thư mục dữ liệu (bind mount). Nên deploy/
 * newsroom-run.sh ghi trạng thái của nó vào một tệp JSON ở đó, cứ 20 giây một
 * lần trong lúc đang chạy, và app chỉ việc đọc.
 *
 * Nhờ vậy màn hình /admin/research phân biệt được ba tình huống mà trước đây
 * trông giống hệt nhau: máy đang viết, máy đã viết xong, và lượt viết đã chết
 * giữa chừng (tệp còn "running" nhưng nhịp tim đã ngừng).
 */
export interface NewsroomRunStatus {
  /** Có lượt viết nào đang chạy ngay lúc này không. */
  running: boolean;
  /** Đề tài đang được viết, nếu có. */
  requestId?: string;
  topic?: string;
  /** Đang ở bước nào: "writing" (Claude đang làm) hoặc "starting". */
  step?: string;
  startedAt?: string;
  /** Nhịp tim gần nhất. */
  updatedAt?: string;
  /** Lượt gần nhất kết thúc lúc nào và ra sao. */
  finishedAt?: string;
  lastResult?: "saved" | "failed" | "skipped" | "empty";
  lastError?: string;
  /** Đã có tệp trạng thái chưa — chưa có nghĩa là chưa deploy bản script mới. */
  known: boolean;
  /**
   * Tệp nói "đang chạy" nhưng nhịp tim đã tắt. Gần như chắc chắn lượt viết bị
   * giết giữa chừng (máy chủ khởi động lại, cron bị kill, hết bộ nhớ).
   */
  stalled: boolean;
}

const DATA_DIR = process.env.DATA_DIR ?? path.join(process.cwd(), "data");
const FILE = path.join(DATA_DIR, "newsroom-status.json");

/**
 * Nhịp tim 20 giây một lần. Cho phép lỡ vài nhịp trước khi kết luận là chết —
 * máy chủ dùng chung, lúc tải nặng một nhịp trễ mươi giây là chuyện thường.
 */
const HEARTBEAT_TIMEOUT_MS = 3 * 60 * 1000;

export async function readRunStatus(): Promise<NewsroomRunStatus> {
  let raw: Record<string, unknown>;
  try {
    raw = JSON.parse(await fs.readFile(FILE, "utf8"));
  } catch {
    // Chưa có tệp (chưa deploy script mới, hoặc chưa chạy lượt nào) — nói
    // thẳng là "không biết" thay vì khẳng định bừa là không chạy.
    return { running: false, known: false, stalled: false };
  }

  const state = String(raw.state ?? "");
  const updatedAt = raw.updatedAt ? String(raw.updatedAt) : undefined;
  const beat = updatedAt ? Date.parse(updatedAt) : NaN;
  const fresh = Number.isFinite(beat) && Date.now() - beat < HEARTBEAT_TIMEOUT_MS;
  const claimsRunning = state === "running";

  return {
    running: claimsRunning && fresh,
    stalled: claimsRunning && !fresh,
    known: true,
    requestId: raw.requestId ? String(raw.requestId) : undefined,
    topic: raw.topic ? String(raw.topic) : undefined,
    step: raw.step ? String(raw.step) : undefined,
    startedAt: raw.startedAt ? String(raw.startedAt) : undefined,
    updatedAt,
    finishedAt: raw.finishedAt ? String(raw.finishedAt) : undefined,
    lastResult: raw.lastResult as NewsroomRunStatus["lastResult"],
    lastError: raw.lastError ? String(raw.lastError) : undefined,
  };
}
