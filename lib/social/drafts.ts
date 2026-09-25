import crypto from "crypto";
import fs from "fs";
import path from "path";
import { getCategory } from "@/lib/data";
import type { ArticleView } from "./types";

/**
 * "Tạo bài GenZ": nhờ Claude viết lại tít + tóm tắt thành 2–3 câu cho mạng xã hội.
 *
 * App không gọi được Claude (máy chủ dùng Claude Code CLI đăng nhập sẵn, không
 * có API key), nên đi đúng đường của nút "Create Post" ở /admin/research: app
 * thả yêu cầu vào data/social-drafts/inbox/, deploy/social-draft-watch.sh trên
 * host nhặt mỗi phút, chạy `claude -p`, ghi kết quả vào data/social-drafts/out/.
 * Trang quản trị hỏi lại vài giây một lần cho tới khi có.
 */

const ROOT = path.join(process.env.DATA_DIR ?? path.join(process.cwd(), "data"), "social-drafts");
const INBOX = path.join(ROOT, "inbox");
const OUT = path.join(ROOT, "out");
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** Bài quá lâu không có kết quả (host không chạy, claude hỏng) thì báo lỗi thay vì chờ mãi. */
const GIVE_UP_MS = 5 * 60 * 1000;

export function requestDraft(platform: string, a: ArticleView) {
  const id = crypto.randomUUID();
  fs.mkdirSync(INBOX, { recursive: true });
  fs.mkdirSync(OUT, { recursive: true });
  const job = {
    id,
    platform,
    title: a.title,
    dek: a.dek,
    category: getCategory(a.category)?.name ?? "",
    createdAt: Date.now(),
  };
  // Ghi tệp tạm rồi đổi tên: watcher không bao giờ đọc phải tệp ghi dở.
  const tmp = path.join(INBOX, `.${id}.tmp`);
  fs.writeFileSync(tmp, JSON.stringify(job));
  fs.renameSync(tmp, path.join(INBOX, `${id}.json`));
  return id;
}

export type DraftState =
  | { status: "pending" }
  | { status: "done"; text: string }
  | { status: "error"; error: string };

export function readDraft(id: string): DraftState {
  if (!UUID.test(id)) return { status: "error", error: "Mã yêu cầu không hợp lệ" };
  try {
    const out = JSON.parse(fs.readFileSync(path.join(OUT, `${id}.json`), "utf8")) as {
      text?: string;
      error?: string;
    };
    return out.text ? { status: "done", text: out.text } : { status: "error", error: out.error ?? "Không viết được" };
  } catch {
    // chưa có kết quả
  }
  try {
    const job = JSON.parse(fs.readFileSync(path.join(INBOX, `${id}.json`), "utf8")) as { createdAt: number };
    if (Date.now() - job.createdAt > GIVE_UP_MS) {
      return { status: "error", error: "Máy chủ chưa xử lý sau 5 phút. Kiểm tra cron social-draft-watch trên host." };
    }
  } catch {
    // watcher đã nhặt, đang viết
  }
  return { status: "pending" };
}
