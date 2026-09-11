import { prisma } from "./prisma";

export type RequestStatus =
  | "pending"
  | "in_progress"
  | "done"
  | "published"
  | "rejected";

export interface ResearchRequest {
  id: string;
  /** Từ khoá, chủ đề, hoặc mô tả đề tài muốn làm. */
  topic: string;
  /** Link nguồn gợi ý (nếu có). */
  urls: string[];
  /** Ghi chú thêm cho phóng viên. */
  notes: string;
  status: RequestStatus;
  createdAt: string;
  updatedAt: string;
  /** Phản hồi của phóng viên sau khi xử lý. */
  reporterNote?: string;
  /** id các bài nháp đã tạo từ yêu cầu này. */
  articleIds?: string[];
  /** Thời điểm giao việc cho máy viết ở lượt gần nhất. */
  assignedAt?: string;
  /** Số lần đã giao việc. */
  attempts: number;
  /** Vì sao lượt gần nhất hỏng. */
  lastError?: string;
}

type RequestRow = {
  id: string;
  topic: string;
  urls: string;
  notes: string;
  status: string;
  reporterNote: string | null;
  articleIds: string;
  assignedAt: Date | null;
  attempts: number;
  lastError: string | null;
  createdAt: Date;
  updatedAt: Date;
};

/**
 * Một lượt viết mất 8–10 phút. Quá mốc này mà vẫn "in_progress" thì gần như
 * chắc chắn lượt đó đã chết giữa chừng (máy chủ khởi động lại, cron bị giết),
 * và đề tài sẽ kẹt mãi nếu không ai gỡ. Màn hình /admin/research dùng mốc này
 * để bày nút "Trả về hàng đợi".
 */
export const STALE_AFTER_MIN = 45;

/** SQLite không có kiểu mảng — danh sách lưu dưới dạng chuỗi JSON. */
function parseList(value: string | null | undefined): string[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

function toRequest(row: RequestRow): ResearchRequest {
  return {
    id: row.id,
    topic: row.topic,
    urls: parseList(row.urls),
    notes: row.notes,
    status: row.status as RequestStatus,
    reporterNote: row.reporterNote ?? undefined,
    articleIds: parseList(row.articleIds),
    assignedAt: row.assignedAt?.toISOString(),
    attempts: row.attempts ?? 0,
    lastError: row.lastError ?? undefined,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function listRequests(): Promise<ResearchRequest[]> {
  const rows = await prisma.researchRequest.findMany({
    orderBy: { createdAt: "desc" },
  });
  return rows.map(toRequest);
}

export interface RequestPageOptions {
  status?: RequestStatus | "all";
  /** Tìm trong chủ đề và ghi chú. */
  q?: string;
  /**
   * Lọc theo ngày đặt đề tài, dạng YYYY-MM-DD. "latest" = ngày gần nhất còn
   * đề tài, để màn hình mở lên là thấy việc mới nhất; "" hoặc bỏ trống = mọi ngày.
   */
  date?: string;
  page?: number;
  perPage?: number;
}

export interface RequestPage {
  items: ResearchRequest[];
  total: number;
  page: number;
  perPage: number;
  /** Số mục theo từng trạng thái — dùng cho nhãn trên các tab. */
  counts: Record<RequestStatus | "all", number>;
  /** Ngày đang lọc sau khi đã quy đổi "latest" thành ngày cụ thể. */
  date: string;
  /** Ngày gần nhất còn đề tài — để ô chọn ngày biết đâu là mốc mới nhất. */
  latestDate: string;
}

export const REQUESTS_PER_PAGE = 10;

/**
 * Giờ Việt Nam. Máy chủ chạy theo UTC, nên nếu cắt ngày theo UTC thì đề tài
 * đặt lúc 2 giờ sáng ở Việt Nam sẽ rơi vào "hôm qua" — đúng cái ngày mà người
 * dùng không bấm vào. Cắt theo +07:00 mới khớp với ngày trên lịch của họ.
 */
const VN_OFFSET = "+07:00";

/** Mốc đầu và cuối của một ngày Việt Nam, quy về thời điểm tuyệt đối. */
function vietnamDayRange(date: string) {
  const start = new Date(`${date}T00:00:00.000${VN_OFFSET}`);
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  return { gte: start, lt: end };
}

/** Ngày trên lịch Việt Nam của một mốc thời gian, dạng YYYY-MM-DD. */
function vietnamDateOf(when: Date) {
  return new Date(when.getTime() + 7 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

/**
 * Một trang của hàng đợi kèm số đếm cho mọi tab.
 *
 * Số đếm bỏ qua bộ lọc trạng thái nhưng GIỮ bộ lọc ngày và từ khoá, để con số
 * trên tab luôn mô tả đúng thứ đang bày ra dưới đó.
 */
export async function listRequestsPage(
  options: RequestPageOptions = {},
): Promise<RequestPage> {
  const perPage = Math.min(Math.max(options.perPage ?? REQUESTS_PER_PAGE, 1), 50);
  const page = Math.max(options.page ?? 1, 1);
  const q = options.q?.trim();

  const newest = await prisma.researchRequest.findFirst({
    orderBy: { createdAt: "desc" },
    select: { createdAt: true },
  });
  const latestDate = newest ? vietnamDateOf(newest.createdAt) : "";

  // "latest" được quy đổi ở đây chứ không ở màn hình: màn hình không biết
  // ngày nào còn đề tài mà không hỏi thêm một lượt nữa.
  const date =
    options.date === "latest"
      ? latestDate
      : /^\d{4}-\d{2}-\d{2}$/.test(options.date ?? "")
        ? (options.date as string)
        : "";

  const filters = {
    ...(q ? { OR: [{ topic: { contains: q } }, { notes: { contains: q } }] } : {}),
    ...(date ? { createdAt: vietnamDayRange(date) } : {}),
  };

  const where = {
    ...filters,
    ...(options.status && options.status !== "all" ? { status: options.status } : {}),
  };

  const [rows, total, grouped] = await Promise.all([
    prisma.researchRequest.findMany({
      where,
      // Mới nhất trước — đề tài nguội thì viết ra cũng không ai đọc.
      orderBy: [{ createdAt: "desc" }],
      skip: (page - 1) * perPage,
      take: perPage,
    }),
    prisma.researchRequest.count({ where }),
    prisma.researchRequest.groupBy({
      by: ["status"],
      where: filters,
      _count: { _all: true },
    }),
  ]);

  const counts: Record<RequestStatus | "all", number> = {
    all: 0,
    pending: 0,
    in_progress: 0,
    done: 0,
    published: 0,
    rejected: 0,
  };
  for (const g of grouped) {
    const key = g.status as RequestStatus;
    if (key in counts) counts[key] = g._count._all;
    counts.all += g._count._all;
  }

  return { items: rows.map(toRequest), total, page, perPage, counts, date, latestDate };
}

export async function getRequest(id: string): Promise<ResearchRequest | undefined> {
  const row = await prisma.researchRequest.findUnique({ where: { id } });
  return row ? toRequest(row) : undefined;
}

export async function createRequest(input: {
  topic: string;
  urls?: string[];
  notes?: string;
}): Promise<ResearchRequest> {
  const row = await prisma.researchRequest.create({
    data: {
      topic: input.topic,
      urls: JSON.stringify(input.urls ?? []),
      notes: input.notes ?? "",
      status: "pending",
    },
  });
  return toRequest(row);
}

export async function updateRequest(
  id: string,
  patch: Partial<Omit<ResearchRequest, "id" | "createdAt">>,
): Promise<ResearchRequest | undefined> {
  try {
    const row = await prisma.researchRequest.update({
      where: { id },
      data: {
        ...(patch.topic !== undefined ? { topic: patch.topic } : {}),
        ...(patch.urls !== undefined ? { urls: JSON.stringify(patch.urls) } : {}),
        ...(patch.notes !== undefined ? { notes: patch.notes } : {}),
        ...(patch.status !== undefined ? { status: patch.status } : {}),
        ...(patch.reporterNote !== undefined
          ? { reporterNote: patch.reporterNote || null }
          : {}),
        ...(patch.articleIds !== undefined
          ? { articleIds: JSON.stringify(patch.articleIds) }
          : {}),
        ...(patch.assignedAt !== undefined
          ? { assignedAt: patch.assignedAt ? new Date(patch.assignedAt) : null }
          : {}),
        ...(patch.attempts !== undefined ? { attempts: patch.attempts } : {}),
        ...(patch.lastError !== undefined
          ? { lastError: patch.lastError || null }
          : {}),
      },
    });
    return toRequest(row);
  } catch {
    return undefined;
  }
}

/**
 * Giao đề tài cho máy viết: đánh dấu đang làm, đóng dấu thời gian và tăng số
 * lần thử. Đếm số lần nằm ở đây thay vì ở nơi gọi để hai đường giao việc (nút
 * trong /admin và cron trên máy chủ) không đếm lệch nhau.
 */
export async function markAssigned(
  id: string,
  note: string,
): Promise<ResearchRequest | undefined> {
  try {
    const row = await prisma.researchRequest.update({
      where: { id },
      data: {
        status: "in_progress",
        assignedAt: new Date(),
        attempts: { increment: 1 },
        lastError: null,
        reporterNote: note,
      },
    });
    return toRequest(row);
  } catch {
    return undefined;
  }
}

/** Trả đề tài về hàng đợi sau một lượt hỏng hoặc bị treo. */
export async function releaseRequest(
  id: string,
  reason: string,
): Promise<ResearchRequest | undefined> {
  try {
    const row = await prisma.researchRequest.update({
      where: { id },
      data: {
        status: "pending",
        assignedAt: null,
        lastError: reason,
        reporterNote: reason,
      },
    });
    return toRequest(row);
  } catch {
    return undefined;
  }
}

export async function deleteRequest(id: string): Promise<boolean> {
  try {
    await prisma.researchRequest.delete({ where: { id } });
    return true;
  } catch {
    return false;
  }
}

/**
 * Đóng mục hàng đợi khi bài viết của nó đã được đăng.
 *
 * Không có bước này thì đề tài nằm mãi ở tab "Drafted" dù bài đã lên trang từ
 * lâu — tab đó phải là việc CÒN PHẢI LÀM, không phải nhật ký.
 *
 * articleIds là chuỗi JSON nên không lọc được bằng SQL; số mục đã có bài luôn
 * nhỏ nên duyệt tay ở đây là đủ.
 */
export async function closeRequestForArticle(articleId: string): Promise<void> {
  const rows = await prisma.researchRequest.findMany({
    where: { status: { in: ["done", "in_progress"] } },
    select: { id: true, articleIds: true },
  });

  const hit = rows.find((r) => parseList(r.articleIds).includes(articleId));
  if (!hit) return;

  await prisma.researchRequest.update({
    where: { id: hit.id },
    data: { status: "published" },
  });
}
