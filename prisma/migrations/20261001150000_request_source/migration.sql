-- Đánh dấu nguồn của đề tài trong hàng đợi, để /admin/research tách riêng mục
-- Threads (đề tài đã được đo độ bàn tán trên threads.com). Đề tài cũ để NULL.
ALTER TABLE "research_requests" ADD COLUMN "source" TEXT;
CREATE INDEX "research_requests_source_createdAt_idx" ON "research_requests"("source", "createdAt");
