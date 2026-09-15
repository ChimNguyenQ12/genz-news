import fs from "fs/promises";
import path from "path";

/**
 * Cấu hình Automatically Generate.
 *
 * Cất trong một tệp JSON ở thư mục dữ liệu chứ không nằm trong cơ sở dữ liệu:
 * script chạy trên host (cron) cần đọc được nó mà không phải mở SQLite hay gọi
 * API, còn app trong container ghi vào cùng tệp đó qua bind mount.
 */
export interface NewsroomSettings {
  /** Tắt là cron không viết bài nữa. Nút "Create Post" vẫn dùng được. */
  enabled: boolean;
  /** Số bài tối đa mỗi lượt cron (chạy vào 6h sáng hằng ngày). */
  maxArticlesPerRun: number;
  /**
   * Cho phép lấy ảnh của chính bài báo nguồn (thẻ og:image) thay vì chỉ dùng
   * ảnh kho tự do.
   *
   * Ảnh kho tự do đúng chủ đề nhưng gần như không bao giờ đúng vụ việc; ảnh
   * của bài nguồn thì luôn đúng, đổi lại đó là ảnh có bản quyền của hãng tin.
   * Đây là quyết định của tổng biên tập nên nó nằm ở đây, bật tắt được, chứ
   * không chôn trong mã.
   */
  pressImages: boolean;
}

export const DEFAULT_SETTINGS: NewsroomSettings = {
  enabled: true,
  maxArticlesPerRun: 1,
  pressImages: true,
};

const DATA_DIR = process.env.DATA_DIR ?? path.join(process.cwd(), "data");
const FILE = path.join(DATA_DIR, "newsroom-settings.json");

export async function readSettings(): Promise<NewsroomSettings> {
  try {
    const raw = JSON.parse(await fs.readFile(FILE, "utf8")) as Partial<NewsroomSettings>;
    return {
      enabled: raw.enabled !== false,
      maxArticlesPerRun: clampCount(raw.maxArticlesPerRun),
      pressImages: raw.pressImages !== false,
    };
  } catch {
    // Chưa có tệp, hoặc tệp hỏng — dùng mặc định, đừng làm sập trang.
    return { ...DEFAULT_SETTINGS };
  }
}

export async function writeSettings(input: Partial<NewsroomSettings>): Promise<NewsroomSettings> {
  const next: NewsroomSettings = {
    enabled: input.enabled !== false,
    maxArticlesPerRun: clampCount(input.maxArticlesPerRun),
    pressImages: input.pressImages !== false,
  };
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(FILE, JSON.stringify(next, null, 2) + "\n", "utf8");
  return next;
}

/**
 * Mỗi bài mất 8–10 phút và chạy trên máy chủ dùng chung, nên chặn trần ở 5.
 * Đặt số quá lớn không làm ra nhiều bài hơn, chỉ làm nghẽn máy.
 */
function clampCount(value: unknown): number {
  const n = Math.floor(Number(value));
  if (!Number.isFinite(n) || n < 1) return DEFAULT_SETTINGS.maxArticlesPerRun;
  return Math.min(n, 5);
}
