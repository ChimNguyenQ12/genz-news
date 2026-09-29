import { prisma } from "./prisma";
import { S3_UPLOADS_BASE } from "./media";

export const COMMENT_MAX_LENGTH = 1500;

export interface CommentAuthor {
  id: string;
  displayName: string;
  role: "admin" | "contributor";
}

export interface CommentMedia {
  type: "image" | "video";
  url: string;
}

export interface CommentNode {
  id: string;
  body: string;
  media: CommentMedia | null;
  createdAt: string;
  author: CommentAuthor;
  /** Chỉ bình luận gốc mới có replies (giới hạn 1 tầng). */
  replies: CommentNode[];
}

type Row = {
  id: string;
  body: string;
  mediaType: string | null;
  mediaUrl: string | null;
  parentId: string | null;
  createdAt: Date;
  user: { id: string; displayName: string; role: string };
};

function toNode(row: Row): CommentNode {
  return {
    id: row.id,
    body: row.body,
    media:
      row.mediaUrl && (row.mediaType === "image" || row.mediaType === "video")
        ? { type: row.mediaType, url: row.mediaUrl }
        : null,
    createdAt: row.createdAt.toISOString(),
    author: {
      id: row.user.id,
      displayName: row.user.displayName,
      role: row.user.role as CommentAuthor["role"],
    },
    replies: [],
  };
}

/** Trả về cây bình luận 2 tầng: gốc (mới nhất trước) + trả lời (cũ nhất trước). */
export async function listComments(articleId: string): Promise<CommentNode[]> {
  const rows = await prisma.comment.findMany({
    where: { articleId },
    include: { user: { select: { id: true, displayName: true, role: true } } },
    orderBy: { createdAt: "asc" },
  });

  const roots: CommentNode[] = [];
  const byId = new Map<string, CommentNode>();

  for (const row of rows) {
    if (row.parentId) continue;
    const node = toNode(row);
    byId.set(node.id, node);
    roots.push(node);
  }
  for (const row of rows) {
    if (!row.parentId) continue;
    byId.get(row.parentId)?.replies.push(toNode(row));
  }

  // Bình luận gốc: mới nhất lên trên. Trả lời giữ thứ tự thời gian.
  roots.reverse();
  return roots;
}

export async function countComments(articleId: string) {
  return prisma.comment.count({ where: { articleId } });
}

/**
 * Kiểm tra ảnh/video đính kèm. Chỉ nhận URL đã qua /api/upload (nằm trên kho
 * S3 của mình) — không cho dán URL ngoài, tránh bình luận nhúng ảnh độc hại
 * hay ảnh của trang khác (hotlink tốn băng thông người ta).
 */
function checkMedia(raw: unknown): CommentMedia | null {
  if (raw === null || raw === undefined) return null;
  const type = (raw as CommentMedia)?.type;
  const url = String((raw as CommentMedia)?.url ?? "");
  if (type !== "image" && type !== "video") {
    throw new Error("Loại tệp đính kèm không hợp lệ");
  }
  if (!url.startsWith(S3_UPLOADS_BASE)) {
    throw new Error("Ảnh/video đính kèm phải tải lên qua nút đính kèm");
  }
  return { type, url };
}

export type CreateResult =
  | { ok: true; comment: CommentNode; parentId: string | null }
  | { ok: false; error: string; status: number };

export async function createComment(input: {
  articleId: string;
  userId: string;
  body: string;
  media?: unknown;
  parentId?: string | null;
}): Promise<CreateResult> {
  const body = input.body.trim();
  if (body.length > COMMENT_MAX_LENGTH) {
    return {
      ok: false,
      error: `Bình luận tối đa ${COMMENT_MAX_LENGTH} ký tự`,
      status: 400,
    };
  }

  let media: CommentMedia | null;
  try {
    media = checkMedia(input.media);
  } catch (err) {
    return { ok: false, error: (err as Error).message, status: 400 };
  }

  // Bình luận chỉ có ảnh/video (không chữ) vẫn hợp lệ; chỉ rỗng cả hai thì mới chặn.
  if (!body && !media) {
    return { ok: false, error: "Bình luận không được để trống", status: 400 };
  }

  const article = await prisma.article.findUnique({
    where: { id: input.articleId },
    select: { id: true, status: true },
  });
  if (!article) {
    return { ok: false, error: "Không tìm thấy bài viết", status: 404 };
  }
  if (article.status !== "published") {
    return { ok: false, error: "Bài chưa đăng nên chưa bình luận được", status: 403 };
  }

  // Giới hạn 1 tầng: trả lời của trả lời sẽ được gắn về đúng bình luận gốc.
  let parentId: string | null = null;
  if (input.parentId) {
    const parent = await prisma.comment.findUnique({
      where: { id: input.parentId },
      select: { id: true, parentId: true, articleId: true },
    });
    if (!parent || parent.articleId !== input.articleId) {
      return { ok: false, error: "Không tìm thấy bình luận gốc", status: 404 };
    }
    parentId = parent.parentId ?? parent.id;
  }

  const row = await prisma.comment.create({
    data: {
      articleId: input.articleId,
      userId: input.userId,
      body,
      mediaType: media?.type ?? null,
      mediaUrl: media?.url ?? null,
      parentId,
    },
    include: { user: { select: { id: true, displayName: true, role: true } } },
  });

  return { ok: true, comment: toNode(row), parentId };
}

/** Xoá bình luận. Chỉ tác giả bình luận hoặc admin mới được xoá. */
export async function deleteComment(
  id: string,
  actor: { id: string; role: string },
): Promise<{ ok: true } | { ok: false; error: string; status: number }> {
  const row = await prisma.comment.findUnique({
    where: { id },
    select: { id: true, userId: true },
  });
  if (!row) return { ok: false, error: "Không tìm thấy bình luận", status: 404 };
  if (actor.role !== "admin" && row.userId !== actor.id) {
    return { ok: false, error: "Không có quyền xoá bình luận này", status: 403 };
  }
  // Xoá bình luận gốc thì các trả lời cũng bị xoá theo (onDelete: Cascade).
  // Tệp trên S3 (nếu có) giữ nguyên, cùng cách các ảnh khác của toà soạn
  // không bị dọn khi bài/bình luận gốc bị xoá.
  await prisma.comment.delete({ where: { id } });
  return { ok: true };
}
