-- Hai việc: bình luận ẩn danh, và lượt đánh giá của người đọc.
--
-- 1) comments.userId phải cho phép NULL. Khách chưa đăng nhập vẫn bình luận
--    được, chỉ để lại nick — nên bình luận ẩn danh không có tài khoản nào để
--    trỏ tới. SQLite không đổi được một cột sang nullable bằng ALTER, phải dựng
--    bảng mới rồi chép dữ liệu sang; đây đúng là cách Prisma vẫn sinh cho SQLite
--    (tắt kiểm tra khoá ngoại trong lúc dựng lại, vì bảng cũ bị DROP giữa chừng).
--
--    authorName chỉ dùng cho khách ẩn danh. Không gộp chung với users.displayName
--    vì khách đổi nick được mỗi lần bình luận, còn tên tài khoản thì không.
--
-- 2) articles thêm hai cột đếm lượt like/dislike. Chỉ cộng dồn, không gắn với
--    tài khoản (khách vẫn bấm được) — xem app/api/articles/[id]/react/route.ts.

ALTER TABLE "articles" ADD COLUMN "likeCount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "articles" ADD COLUMN "dislikeCount" INTEGER NOT NULL DEFAULT 0;

PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;

CREATE TABLE "new_comments" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "body" TEXT NOT NULL,
    "mediaType" TEXT,
    "mediaUrl" TEXT,
    "articleId" TEXT NOT NULL,
    "userId" TEXT,
    "authorName" TEXT,
    "parentId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "comments_articleId_fkey" FOREIGN KEY ("articleId") REFERENCES "articles" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "comments_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "comments_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "comments" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

INSERT INTO "new_comments" ("id", "body", "mediaType", "mediaUrl", "articleId", "userId", "parentId", "createdAt", "updatedAt")
SELECT "id", "body", "mediaType", "mediaUrl", "articleId", "userId", "parentId", "createdAt", "updatedAt" FROM "comments";

DROP TABLE "comments";
ALTER TABLE "new_comments" RENAME TO "comments";

CREATE INDEX "comments_articleId_createdAt_idx" ON "comments"("articleId", "createdAt");
CREATE INDEX "comments_parentId_idx" ON "comments"("parentId");

PRAGMA foreign_keys=ON;
