import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { listRequests, updateRequest } from "@/lib/queue";
import { createArticle } from "@/lib/store";

/** Lấy tên hãng tin từ URL để làm nhãn nguồn, VD "www.bbc.com" → "bbc.com". */
function hostLabel(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "Nguồn";
  }
}

/**
 * Biến một đề tài trong hàng đợi thành bản nháp bài viết.
 * Tiêu đề = đề tài, các link gợi ý được đưa sẵn vào mục nguồn tham khảo,
 * ghi chú thu thập được đưa vào thân bài để người viết dựa vào đó biên tập.
 */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await requireRole("admin");
  if (!user) {
    return NextResponse.json({ error: "Không có quyền" }, { status: 401 });
  }

  const { id } = await params;
  const request = (await listRequests()).find((r) => r.id === id);
  if (!request) {
    return NextResponse.json({ error: "Không tìm thấy đề tài" }, { status: 404 });
  }

  const notesHtml = request.notes
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
    title: request.topic,
    dek: "",
    category: "the-gioi",
    language: "vi",
    tags: [],
    coverGradient: ["#7C3AED", "#22D3EE"],
    author: user.displayName,
    authorId: user.id,
    publishedAt: new Date().toISOString().slice(0, 10),
    readingTimeMin: 3,
    status: "draft",
    body,
    sources: request.urls.map((url) => ({ name: hostLabel(url), url })),
  });

  await updateRequest(id, {
    status: "done",
    reporterNote: `Đã tạo bản nháp: ${article.slug}`,
    articleIds: [...(request.articleIds ?? []), article.id],
  });

  return NextResponse.json({ article }, { status: 201 });
}
