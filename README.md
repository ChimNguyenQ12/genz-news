# GenZ Now — trang tin quốc tế cho Gen Z Việt Nam

Next.js 16 (App Router) + TypeScript + Tailwind 4 + **PostgreSQL qua Prisma**.

## Chạy dự án

```bash
cp .env.example .env          # rồi copy tiếp thành .env.local
npm install                   # tự chạy prisma generate
npm run db:up                 # bật PostgreSQL bằng Docker
npm run db:migrate            # tạo bảng
npm run dev                   # http://localhost:3000
```

- Trang công khai: `/`
- Toà soạn (CMS): `/admin` — mặc định **admin / admin**

## Cơ sở dữ liệu

PostgreSQL 17, truy cập qua Prisma. Schema ở [`prisma/schema.prisma`](prisma/schema.prisma).

| Bảng | Nội dung |
|---|---|
| `users` | Tài khoản, mật khẩu băm scrypt + salt riêng, vai trò |
| `articles` | Bài viết, trạng thái, nội dung HTML, ảnh bìa |
| `sources` | Nguồn tham khảo (1-n với bài, xoá bài thì xoá theo) |
| `comments` | Bình luận, tự trỏ về chính nó để làm trả lời 1 tầng |
| `research_requests` | Hàng đợi đề tài |

### Lệnh thường dùng

```bash
npm run db:up          # bật Postgres (docker compose)
npm run db:down        # tắt
npm run db:migrate     # tạo migration mới ở môi trường dev
npm run db:deploy      # áp migration ở production
npm run db:studio      # giao diện xem/sửa dữ liệu
npm run db:import-json # nạp dữ liệu từ file JSON cũ (chạy một lần)
```

Local Postgres chạy ở cổng **5433** (tránh đụng Postgres sẵn có trên máy).

### Lên production

Đổi `DATABASE_URL` sang Postgres thật (RDS, Neon, Supabase...) rồi:

```bash
npm run db:deploy
```

Đổi sang MySQL/SQLite chỉ cần sửa `provider` trong `schema.prisma` và cài
adapter tương ứng — code truy vấn giữ nguyên.

## Soạn thảo & tải file

Nội dung bài dùng trình soạn thảo trực quan (Tiptap): in đậm/nghiêng/gạch chân,
tiêu đề H2–H3, danh sách, trích dẫn, căn lề, chèn link, hoàn tác/làm lại.

Ảnh và video **tải trực tiếp từ máy** (nút 🖼 trên thanh công cụ, hoặc nút
"Tải ảnh lên" ở ô ảnh bìa). File lưu tại `public/uploads/YYYY/MM/`.

| Loại | Định dạng | Dung lượng tối đa |
|---|---|---|
| Ảnh | JPG, PNG, WebP, GIF, AVIF | 10–15MB |
| Video | MP4, WebM | 200MB |

Ngoài ra nút ▶ cho phép nhúng video YouTube bằng link.

Nội dung được lưu dưới dạng HTML và **làm sạch bằng `sanitize-html` ở phía
server** trước khi ghi — chặn XSS từ nội dung do người dùng gửi lên. Chỉ cho
nhúng iframe từ YouTube và Vimeo.

**Lưu ý khi deploy:** `public/uploads/` nằm trên đĩa máy chủ. Trên VPS thì ổn;
nếu chạy nhiều instance hoặc serverless, hãy chuyển sang S3/R2 — chỉ cần sửa
`app/api/upload/route.ts`.

## Bình luận

Mỗi bài đã đăng có phần bình luận ở cuối trang.

- **Đọc**: ai cũng đọc được, kể cả chưa đăng nhập.
- **Viết**: phải đăng nhập. Khách chỉ thấy link mời đăng nhập.
- **Trả lời 1 tầng**: chỉ trả lời được bình luận gốc. Nếu ai đó cố trả lời vào
  một reply (gọi thẳng API), server tự gắn về bình luận gốc — không có tầng 3.
- **Xoá**: chủ bình luận hoặc admin. Xoá bình luận gốc thì các trả lời mất theo.
- Nội dung lưu dạng **văn bản thuần**, render bằng text nên không dính XSS.
  Giới hạn 1500 ký tự.

## Tài khoản & phân quyền

Hai vai trò, lưu trong bảng `users` (mật khẩu băm bằng scrypt + salt riêng):

| | Tổng biên tập (`admin`) | Cộng tác viên (`contributor`) |
|---|---|---|
| Xem bài | tất cả | chỉ bài của mình |
| Viết bài mới | ✓ | ✓ |
| Sửa bài | mọi bài, mọi lúc | chỉ bài của mình, khi đang **nháp** hoặc **bị trả lại** |
| **Đăng bài** | ✓ | ✗ — chỉ được **Gửi duyệt** |
| Trả bài kèm góp ý | ✓ | — |
| Đặt đề tài / xem hàng đợi | ✓ | ✗ |
| Đặt slug, tác giả, bài nổi bật | ✓ | ✗ |

Vòng đời bài: `nháp → chờ duyệt → đã đăng`, hoặc `chờ duyệt → bị trả lại → (sửa) → chờ duyệt`.

### Đường dẫn

- `/dang-ky` — đăng ký cộng tác viên
- `/dang-nhap` — đăng nhập
- `/admin` — khu làm việc (tiêu đề đổi theo vai trò)
- `/admin/tai-khoan` — đổi mật khẩu

### Thiết lập trước khi deploy

Tài khoản admin được tạo tự động ở lần chạy đầu từ biến môi trường
(mặc định **admin / admin**). Tạo `.env.local`:

```
ADMIN_USER=ten_dang_nhap
ADMIN_PASSWORD=mat_khau_manh
ADMIN_SESSION_SECRET=chuoi_ngau_nhien_dai
ALLOW_REGISTRATION=0     # đóng đăng ký công khai nếu cần
```

Sinh secret: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`

**Lưu ý:** biến môi trường chỉ có tác dụng khi bảng `users` chưa có admin nào.
Nếu tài khoản admin đã tồn tại, hãy đổi mật khẩu trong `/admin/tai-khoan`.

## Thu thập xu hướng tự động

```bash
npm run collect-trends
```

Script gom xu hướng từ 3 nguồn hợp pháp rồi ghi thẳng vào hàng đợi đề tài:

| Nguồn | Cần key? | Ghi chú |
|---|---|---|
| Google Trends VN | Không | Từ khoá hot + bài báo VN liên quan; tự lọc bỏ xổ số/giá vàng/từ khoá quá ngắn |
| YouTube Trending VN | `YOUTUBE_API_KEY` | Bỏ qua êm nếu chưa có key |
| RSS quốc tế (BBC, Guardian, Al Jazeera, NYT, BBC Tiếng Việt) | Không | Lấy luân phiên để không hãng nào chiếm hết |

Kết quả ghi vào bảng `research_requests` (hiện ở `/admin/research`) và
`data/trends-digest.json` (dữ liệu thô để tra cứu). Đề tài đã có trong 7 ngày
gần nhất sẽ không bị thêm trùng.

Tùy chỉnh bằng biến môi trường:

```
YOUTUBE_API_KEY=...        # bật nguồn YouTube (lấy ở Google Cloud Console)
TRENDS_MAX_GOOGLE=8        # số đề tài từ Google Trends
TRENDS_MAX_YOUTUBE=6       # số đề tài từ YouTube
TRENDS_MAX_HEADLINES=8     # số đề tài từ RSS quốc tế
TRENDS_DEDUPE_DAYS=7       # cửa sổ chống trùng
TRENDS_DRY_RUN=1           # chỉ in ra, không ghi file
```

### Đặt lịch chạy

```bash
# Linux — crontab -e, chạy 6h sáng mỗi ngày
0 6 * * * cd /srv/genz-news && /usr/bin/npm run collect-trends >> /var/log/genz-trends.log 2>&1
```

Windows: Task Scheduler → tạo task chạy `npm run collect-trends` với thư mục
làm việc là gốc dự án.

Script trả về exit code 1 nếu **tất cả** nguồn đều lỗi, nên cron sẽ báo hỏng;
một nguồn lỗi lẻ chỉ ghi cảnh báo và vẫn chạy tiếp.

## Quy trình làm báo

Trang này **không gọi API AI trả phí**. Vai trò "phóng viên" do Claude Code
đảm nhiệm khi bạn mở terminal trong thư mục dự án.

```
Bạn đặt đề tài  ──►  /admin/research  ──►  bảng research_requests
   (hoặc cron chạy npm run collect-trends tự đổ đề tài vào đây)
                                                    │
                                                    ▼
                              Claude Code đọc hàng đợi, tìm nguồn thật,
                              viết bài, lưu vào database
                              với status = "draft"
                                                    │
                                                    ▼
Bạn duyệt ở /admin  ──►  sửa trong editor  ──►  bấm "Đăng"
```

### Cách gọi phóng viên

Mở terminal tại `D:\freelance\genz-news` rồi chạy `claude`, và nói một trong:

- `xử lý hàng đợi đề tài` — đọc bảng `research_requests`, làm hết các mục
  `pending`.
- `làm bài về <chủ đề>` — làm ngay một đề tài cụ thể.
- `kiểm tra Google Trends VN xem có gì đáng làm` — gợi ý đề tài từ xu hướng.

Claude Code tự đọc `CLAUDE.md` mỗi phiên nên luôn nhớ nguyên tắc toà soạn:
viết lại chứ không dịch nguyên văn, bắt buộc trích nguồn, và **không bao giờ
tự đăng** — mọi bài đều dừng ở trạng thái nháp chờ bạn duyệt.

## Nếu muốn chạy tự động 24/7

Claude Code chạy được không cần tương tác:

```bash
claude -p "xử lý hàng đợi đề tài" --permission-mode acceptEdits
```

Đặt lịch bằng Task Scheduler (Windows) hoặc cron (Linux), ví dụ mỗi sáng 7h:

```bash
# crontab -e
0 7 * * * cd /srv/genz-news && claude -p "kiểm tra Google Trends VN, chọn 2 chủ đề đáng làm nhất và viết thành bản nháp" --permission-mode acceptEdits >> /var/log/genz-news.log 2>&1
```

Lưu ý: cách này tiêu thụ hạn mức tài khoản Claude của bạn, và bài vẫn dừng ở
trạng thái nháp — vẫn cần người bấm đăng.

## Nguồn dữ liệu đang dùng

| Nguồn | Endpoint | Ghi chú |
|---|---|---|
| Google Trends VN | `trends.google.com/trending/rss?geo=VN` | Xu hướng tìm kiếm + bài báo VN liên quan |
| BBC World / Guardian / Al Jazeera / NYT | RSS công khai | Tin quốc tế |
| BBC Tiếng Việt | RSS công khai | Tin quốc tế bản tiếng Việt |

Xem `GET /api/trends` để lấy dữ liệu tổng hợp. Code ở `lib/sources/`.

Không dùng Threads/Facebook/Instagram: các nền tảng này cấm truy cập tự động
ngoài API chính thức, và API chính thức của Threads không cung cấp dữ liệu
trending toàn nền tảng.

## Lưu ý khi lên production

- Nội dung nằm trong PostgreSQL nên chạy được cả trên serverless. Riêng
  `public/uploads/` vẫn là đĩa máy chủ — muốn deploy serverless hoặc nhiều
  instance thì chuyển sang S3/R2 (sửa `app/api/upload/route.ts`).
- Chạy `npm run db:deploy` để áp migration trước khi khởi động app.
- Đổi tài khoản admin và `ADMIN_SESSION_SECRET`.
- Cân nhắc đặt `/admin` sau VPN hoặc giới hạn IP.
