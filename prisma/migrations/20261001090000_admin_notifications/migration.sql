-- Thông báo cho admin + đếm lượt đọc.
--
-- Chỉ thêm cột và bảng mới, không đụng dữ liệu cũ: viewCount bắt đầu từ 0 ở
-- mọi bài (trước đây không đếm), bảng thông báo bắt đầu rỗng.
ALTER TABLE "articles" ADD COLUMN "viewCount" INTEGER NOT NULL DEFAULT 0;

CREATE TABLE "article_view_days" (
    "articleId" TEXT NOT NULL,
    "day" TEXT NOT NULL,
    "views" INTEGER NOT NULL DEFAULT 0,

    PRIMARY KEY ("articleId", "day"),
    CONSTRAINT "article_view_days_articleId_fkey" FOREIGN KEY ("articleId") REFERENCES "articles" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "article_view_days_day_idx" ON "article_view_days"("day");

CREATE TABLE "admin_notifications" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "type" TEXT NOT NULL,
    "level" TEXT NOT NULL DEFAULT 'info',
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL DEFAULT '',
    "link" TEXT,
    "articleId" TEXT,
    "groupKey" TEXT,
    "count" INTEGER NOT NULL DEFAULT 1,
    "readAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
CREATE INDEX "admin_notifications_createdAt_idx" ON "admin_notifications"("createdAt");
CREATE INDEX "admin_notifications_readAt_createdAt_idx" ON "admin_notifications"("readAt", "createdAt");
CREATE INDEX "admin_notifications_groupKey_idx" ON "admin_notifications"("groupKey");
