import fs from "fs/promises";
import path from "path";
import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { getRequest, markAssigned, updateRequest } from "@/lib/queue";
import { createArticle } from "@/lib/store";

/** Lấy tên hãng tin từ URL để làm nhãn nguồn, VD "www.bbc.com" → "bbc.com". */
function hostLabel(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "Nguồn";
  }
}

const DATA_DIR = process.env.DATA_DIR ?? path.join(process.cwd(), "data");
/**
 * Hộp thư gửi việc cho Automatically Generate.
 *
 * App chạy trong container, còn `claude` chạy trên host — container không gọi
 * được lệnh của host. Nhưng hai bên dùng chung thư mục dữ liệu qua bind mount,
 * nên thả một tệp rỗng tên là id đề tài vào đây là cách gọn nhất: không mở
 * thêm cổng, không cấp thêm quyền cho container.
 * Phía host có deploy/newsroom-watch.sh chạy mỗi phút để nhặt.
 */
const INBOX = path.join(DATA_DIR, "newsroom-requests");

/**
 * Giao một đề tài trong hàng đợi cho người viết.
 *
 * - mặc định (`mode: "ai"`): nhờ Automatically Generate tìm nguồn, kiểm chứng và
 *   tổng hợp thành bài hoàn chỉnh. Bài xong sẽ nằm ở "chờ duyệt".
 * - `mode: "manual"`: chỉ dựng bản nháp trống kèm sẵn link nguồn, để tự viết.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await requireRole("admin");
  if (!user) {
    return NextResponse.json({ error: "Không có quyền" }, { status: 401 });
  }

  const { id } = await params;
  const topic = await getRequest(id);
  if (!topic) {
    return NextResponse.json({ error: "Không tìm thấy đề tài" }, { status: 404 });
  }

  let mode = "ai";
  try {
    const body = (await request.json()) as { mode?: unknown };
    if (body?.mode === "manual") mode = "manual";
  } catch {
    // Không có thân yêu cầu thì dùng mặc định.
  }

  if (mode === "ai") {
    if (topic.status === "in_progress") {
      return NextResponse.json(
        { error: "This title is already being generated, please wait a moment." },
        { status: 409 },
      );
    }

    await fs.mkdir(INBOX, { recursive: true });
    await fs.writeFile(path.join(INBOX, id), "", "utf8");

    // markAssigned đóng dấu thời gian và tăng số lần thử. Nhờ dấu thời gian
    // đó mà tab "Đang viết" đo được đã chạy bao lâu, và biết lượt nào treo.
    const assigned = await markAssigned(
      id,
      "Assigned Automatically Generate at " +
      new Date().toISOString() +
      ". Article will appear in the pending section when finished.",
    );

    return NextResponse.json({
      queued: true,
      request: assigned,
      message: "Assigned AI. Waiting for article to be generated.",
    });
  }

  const notesHtml = topic.notes
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => `<p>${line.replace(/</g, "&lt;")}</p>`)
    .join("");

  const body =
    `<h2>Ghi chú thu thập</h2>` +
    (notesHtml || "<p>(không có ghi chú)</p>") +
    `<hr><p data-no-translate>Viết nội dung bài ở đây. Nhớ diễn đạt lại bằng lời của mình, ` +
    `không sao chép nguyên văn, và giữ đủ nguồn tham khảo bên dưới.</p>`;

  const article = await createArticle({
    slug: "",
    extraCategories: [],
    // Dùng tít đã dịch nếu có — hàng đợi giờ dịch tít sang tiếng Việt để tổng
    // biên tập đọc lướt được, nhưng "Empty draft" trước đây bỏ qua nó, chép
    // thẳng topic.topic (thường là tiếng Anh) vào tít bài. Danh sách hàng đợi
    // đã hiện đúng tiếng Việt, còn bản nháp mở ra lại hiện tiếng Anh — hai chỗ
    // lệch nhau chỉ vì chỗ này quên đọc topicVi.
    title: topic.topicVi || topic.topic,
    dek: "",
    category: "the-gioi",
    language: "vi",
    tags: [],
    coverGradient: ["#7C3AED", "#22D3EE"],
    author: user.displayName,
    authorId: user.id,
    // Mốc ISO CÓ GIỜ (bản trước cắt còn ngày, làm mọi bài mất phần giờ).
    publishedAt: new Date().toISOString(),
    readingTimeMin: 3,
    status: "draft",
    body,
    sources: topic.urls.map((url) => ({ name: hostLabel(url), url })),
  });

  await updateRequest(id, {
    status: "done",
    reporterNote: `Draft created: ${article.slug}`,
    articleIds: [...(topic.articleIds ?? []), article.id],
  });

  return NextResponse.json({ article }, { status: 201 });
}
