-- Ghi công ảnh bìa (JSON ImageCredit: author, license?, sourceUrl, sourceName?)
-- làm "(nguồn)" render thành một link thật, tách khỏi coverImageCaption vốn là
-- trường thuần văn bản — trước đây phải nhét cả cụm "<a href=...>nguồn</a>"
-- vào coverImageCaption nên thẻ HTML lộ ra ngay trên mặt chữ cho người đọc.
ALTER TABLE "articles" ADD COLUMN "coverImageCredit" TEXT;
