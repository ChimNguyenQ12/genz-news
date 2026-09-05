import { prisma } from "./prisma";

export type RequestStatus = "pending" | "in_progress" | "done" | "rejected";

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
}

type RequestRow = {
  id: string;
  topic: string;
  urls: string;
  notes: string;
  status: string;
  reporterNote: string | null;
  articleIds: string;
  createdAt: Date;
  updatedAt: Date;
};

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
