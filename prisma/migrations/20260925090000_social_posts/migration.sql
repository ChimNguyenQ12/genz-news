-- Gộp bài đăng mạng xã hội vào một bảng có cột "platform", để thêm Threads
-- (và nền tảng sau này) mà không nhân đôi hàng đợi, lịch giờ vàng, khoá chống
-- đăng trùng.
--
-- Thứ tự quan trọng: tạo bảng mới → CHÉP dữ liệu facebook_posts sang → rồi
-- mới bỏ bảng cũ. (prisma migrate diff sinh DROP trước CREATE, tức mất dữ liệu.)

-- CreateTable
CREATE TABLE "social_posts" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "articleId" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'scheduled',
    "caption" TEXT NOT NULL,
    "comment" TEXT NOT NULL,
    "scheduledAt" DATETIME,
    "remotePostId" TEXT,
    "remoteMediaId" TEXT,
    "remoteCommentId" TEXT,
    "permalink" TEXT,
    "postedAt" DATETIME,
    "lastError" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "social_posts_articleId_fkey" FOREIGN KEY ("articleId") REFERENCES "articles" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "social_posts_platform_status_scheduledAt_idx" ON "social_posts"("platform", "status", "scheduledAt");

-- CreateIndex
CREATE UNIQUE INDEX "social_posts_articleId_platform_key" ON "social_posts"("articleId", "platform");

-- Chép bài Facebook sang.
INSERT INTO "social_posts" (
    "id", "articleId", "platform", "status", "caption", "comment", "scheduledAt",
    "remotePostId", "remoteMediaId", "remoteCommentId", "permalink", "postedAt",
    "lastError", "createdAt", "updatedAt"
)
SELECT
    "id", "articleId", 'facebook', "status", "caption", "comment", "scheduledAt",
    "fbPostId", "fbPhotoId", "fbCommentId",
    CASE WHEN "fbPostId" IS NOT NULL THEN 'https://www.facebook.com/' || "fbPostId" END,
    "postedAt",
    "lastError", "createdAt", "updatedAt"
FROM "facebook_posts";

-- DropTable
DROP TABLE "facebook_posts";
