-- Khoá tài khoản từ /admin/users: người đăng ký mở là đăng được bài, nên
-- admin cần chặn được tài khoản spam mà không phải xoá (xoá thì mất liên kết
-- tới bài họ đã viết). NULL = đang hoạt động.
ALTER TABLE "users" ADD COLUMN "disabledAt" DATETIME;
