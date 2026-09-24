-- Bài đăng Facebook Page gắn với bài viết.
--
-- Trên máy chủ đã có một bảng "facebook_posts" tạo tay bằng sqlite3 (không qua
-- migration), khác cột với bảng này và RỖNG lúc viết migration (24/09/2026,
-- đã kiểm: 0 dòng — token Facebook khi đó không hợp lệ nên chưa đăng được bài
-- nào). Bỏ nó đi rồi tạo đúng theo schema; IF EXISTS để máy mới cũng chạy được.
DROP TABLE IF EXISTS "facebook_posts";

-- CreateTable
CREATE TABLE "facebook_posts" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "articleId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'scheduled',
    "caption" TEXT NOT NULL,
    "comment" TEXT NOT NULL,
    "scheduledAt" DATETIME,
    "fbPostId" TEXT,
    "fbPhotoId" TEXT,
    "fbCommentId" TEXT,
    "postedAt" DATETIME,
    "lastError" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "facebook_posts_articleId_fkey" FOREIGN KEY ("articleId") REFERENCES "articles" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "facebook_posts_articleId_key" ON "facebook_posts"("articleId");

-- CreateIndex
CREATE INDEX "facebook_posts_status_scheduledAt_idx" ON "facebook_posts"("status", "scheduledAt");

