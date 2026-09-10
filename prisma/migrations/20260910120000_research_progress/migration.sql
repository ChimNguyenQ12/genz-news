-- Theo dõi tiến độ của mỗi đề tài trong hàng đợi.
--
-- Trước đây chỉ có `status`, nên khi một lượt viết hỏng và đề tài bị trả về
-- "pending", màn hình /admin/research trông y hệt như đề tài chưa ai đụng tới —
-- trong khi ghi chú của phóng viên vẫn nói "đã giao lúc ...". Ba cột này tách
-- hai trường hợp đó ra.
ALTER TABLE "research_requests" ADD COLUMN "assignedAt" DATETIME;
ALTER TABLE "research_requests" ADD COLUMN "attempts" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "research_requests" ADD COLUMN "lastError" TEXT;

-- Tab "Đang viết" sắp xếp theo thời điểm giao việc.
CREATE INDEX "research_requests_assignedAt_idx" ON "research_requests"("assignedAt");

-- Mục nào đang dở dang thì coi như vừa được giao, để đồng hồ tiến độ có mốc.
UPDATE "research_requests" SET "assignedAt" = "updatedAt", "attempts" = 1
WHERE "status" = 'in_progress';
