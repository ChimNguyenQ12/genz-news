import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { createComment, listComments } from "@/lib/comments";
import { getArticleById } from "@/lib/store";
import { notifyNewComment } from "@/lib/notifications";
import { clientIp, take, tooMany } from "@/lib/rateLimit";

/** Chặn spam bình luận: 5 bình luận / phút, 60 / giờ mỗi tài khoản (admin không giới hạn). */
const PER_MINUTE = { max: 5, windowMs: 60_000 };
const PER_HOUR = { max: 60, windowMs: 3600_000 };

/**
 * Khách ẩn danh bị siết hơn tài khoản vì không có gì ràng buộc danh tính — nhưng
 * đừng siết quá tay: nhà mạng Việt Nam dùng CGNAT, một địa chỉ IP có thể là hàng
 * nghìn người. Trần dưới đây chỉ để chặn dội hàng loạt bằng script, không phải
 * để chặn người thật; bài nào bị spam thì admin xoá được ở panel kiểm duyệt.
 */
const GUEST_PER_MINUTE = { max: 3, windowMs: 60_000 };
const GUEST_PER_HOUR = { max: 20, windowMs: 3600_000 };

/** Ai cũng đọc được bình luận của bài đã đăng. */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const article = await getArticleById(id);
  if (!article) {
    return NextResponse.json({ error: "Không tìm thấy bài viết" }, { status: 404 });
  }

  // Bài chưa đăng: chỉ admin hoặc tác giả xem được bình luận.
  if (article.status !== "published") {
    const user = await getSessionUser();
    const allowed = user && (user.role === "admin" || article.authorId === user.id);
    if (!allowed) {
      return NextResponse.json({ error: "Không tìm thấy bài viết" }, { status: 404 });
    }
  }

  return NextResponse.json({ comments: await listComments(id) });
}

/**
 * Gửi bình luận. KHÔNG cần đăng nhập.
 *
 * Mặc định là bình luận ẨN DANH: khách để lại nick trong `authorName`. Người đã
 * đăng nhập muốn đứng tên tài khoản thì gửi `as: "account"` — đó là lựa chọn thứ
 * hai trên giao diện, không phải mặc định.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getSessionUser();

  // Chặn spam. Khách đếm theo IP, tài khoản đếm theo id. Bộ đếm nằm trong bộ
  // nhớ tiến trình và KHÔNG ghi IP xuống cơ sở dữ liệu — trang Quyền riêng tư
  // ghi rõ là không giữ IP kèm nội dung người đọc.
  if (!user || user.role !== "admin") {
    const guest = !user;
    const scope = user ? `u:${user.id}` : `ip:${clientIp(request)}`;
    const wait =
      take(`comment:m:${scope}`, guest ? GUEST_PER_MINUTE : PER_MINUTE) ||
      take(`comment:h:${scope}`, guest ? GUEST_PER_HOUR : PER_HOUR);
    if (wait) {
      return tooMany(wait, "Bạn bình luận nhanh quá. Chờ một chút rồi thử lại.", clientIp(request));
    }
  }

  const { id } = await params;

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Dữ liệu không hợp lệ" }, { status: 400 });
  }

  const asAccount = user !== null && body.as === "account";

  const result = await createComment({
    articleId: id,
    // Ẩn danh thì không gắn tài khoản nào, kể cả khi người gửi đã đăng nhập.
    userId: asAccount && user ? user.id : null,
    authorName: asAccount ? null : String(body.authorName ?? ""),
    body: String(body.body ?? ""),
    media: body.media,
    parentId: body.parentId ? String(body.parentId) : null,
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  // Admin tự bình luận thì không cần tự báo cho mình.
  if (user?.role !== "admin") {
    const article = await getArticleById(id);
    void notifyNewComment({
      articleId: id,
      articleTitle: article?.title ?? id,
      author: result.comment.author.displayName,
      isReply: result.parentId !== null,
      body: result.comment.body,
      hasMedia: result.comment.media !== null,
    });
  }

  return NextResponse.json(
    { comment: result.comment, parentId: result.parentId },
    { status: 201 },
  );
}
