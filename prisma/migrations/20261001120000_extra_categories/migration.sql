-- Một bài thuộc nhiều chuyên mục.
--
-- Giữ nguyên cột "category" làm chuyên mục CHÍNH (màu nhãn, breadcrumb, URL
-- quen thuộc) và thêm danh sách chuyên mục PHỤ dạng mảng JSON, cùng cách lưu
-- với "tags". Chỉ thêm cột: mọi bài cũ có "[]", tức là vẫn một chuyên mục như cũ.
ALTER TABLE "articles" ADD COLUMN "extraCategories" TEXT NOT NULL DEFAULT '[]';
