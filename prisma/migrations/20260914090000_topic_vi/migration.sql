-- Tít tiếng Việt cho đề tài trong hàng đợi.
--
-- Hơn nửa hàng đợi giờ là tít tiếng Anh, vì nguồn Google News kéo về bài của
-- Reuters, Nikkei, SCMP... Tổng biên tập phải đọc từng tít tiếng Anh mới quyết
-- được có bấm "Create post" hay không — chậm, và dễ bỏ sót đề tài hay.
--
-- Để NULL khi chưa dịch: màn hình rơi về tít gốc, không có gì hỏng.
ALTER TABLE "research_requests" ADD COLUMN "topicVi" TEXT;
