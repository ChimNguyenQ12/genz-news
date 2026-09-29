-- Cho phép bình luận đính kèm một ảnh hoặc một video (không phải cả hai),
-- lưu ngay trên bảng comments nên luôn đi cùng bài viết và xoá theo bài viết
-- (comments đã @@map và có onDelete: Cascade với Article từ trước).
ALTER TABLE "comments" ADD COLUMN "mediaType" TEXT;
ALTER TABLE "comments" ADD COLUMN "mediaUrl" TEXT;
