-- Khối "Tin Nóng" ở cột chính trang chủ.
--
-- Trước đây chỗ đó là danh sách "Mới nhất" tự động: lấy 4 bài mới nhất chưa nằm
-- trong hero, không ai chọn được. Giờ nó là một khối biên tập được như hero và
-- "Đang nóng" — tổng biên tập tự chọn bài và xếp thứ tự trong /admin/homepage,
-- nên cần thêm cột thứ tự.
--
-- Chỉ thêm cột, không đụng dữ liệu: cột NULL ở mọi bài nghĩa là "chưa đặt", và
-- trang chủ lùi về lấy bài mới nhất như cũ cho tới khi có người xếp.
ALTER TABLE "articles" ADD COLUMN "hotOrder" INTEGER;
