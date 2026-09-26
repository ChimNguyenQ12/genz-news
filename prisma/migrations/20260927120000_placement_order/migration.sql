-- Thứ tự hiện trên trang chủ: slideshow hero và khối "Đang nóng". NULL = không hiện.
ALTER TABLE "articles" ADD COLUMN "featuredOrder" INTEGER;
ALTER TABLE "articles" ADD COLUMN "trendingOrder" INTEGER;

-- Bài đang được tick giữ chỗ theo thứ tự cũ (bài đã đăng, mới nhất trước); quá 5 thì bỏ tick.
UPDATE "articles" SET "featuredOrder" = (
  SELECT r.rn FROM (
    SELECT "id", ROW_NUMBER() OVER (ORDER BY ("status" = 'published') DESC, "publishedAt" DESC, "createdAt" DESC) AS rn
    FROM "articles" WHERE "featured" = 1
  ) r WHERE r."id" = "articles"."id"
) WHERE "featured" = 1;
UPDATE "articles" SET "trendingOrder" = (
  SELECT r.rn FROM (
    SELECT "id", ROW_NUMBER() OVER (ORDER BY ("status" = 'published') DESC, "publishedAt" DESC, "createdAt" DESC) AS rn
    FROM "articles" WHERE "trending" = 1
  ) r WHERE r."id" = "articles"."id"
) WHERE "trending" = 1;
UPDATE "articles" SET "featuredOrder" = NULL WHERE "featuredOrder" > 5;
UPDATE "articles" SET "trendingOrder" = NULL WHERE "trendingOrder" > 5;
UPDATE "articles" SET "featured" = ("featuredOrder" IS NOT NULL), "trending" = ("trendingOrder" IS NOT NULL);
