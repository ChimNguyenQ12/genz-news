# GenZ News — trang tin quốc tế cho Gen Z Việt Nam

Next.js 16 (App Router) + TypeScript + Tailwind 4 + **SQLite qua Prisma**.

- Production: <https://genz-news.site>
- Máy chủ nghe ở `127.0.0.1:5006`, nginx đứng ngoài lo TLS.

## Chạy dự án

```bash
npm install            # tự chạy prisma generate
npm run db:migrate     # tạo tệp data/app.db và các bảng
npm run dev            # http://localhost:3000
```

Không cần `.env`. Mọi biến đều có giá trị mặc định hợp lý; khoá ký phiên tự sinh
một lần rồi cất trong `data/session-secret`.

- Trang công khai: `/`
- Khu quản trị: `/admin` — mặc định **admin / admin**

## Cơ sở dữ liệu

SQLite, một tệp ở `data/app.db`, truy cập qua Prisma.
Schema ở [`prisma/schema.prisma`](prisma/schema.prisma).

**Vì sao SQLite:** trang tin một máy chủ, chỉ biên tập viên ghi còn độc giả chỉ
đọc, dữ liệu vài nghìn bản ghi. SQLite bỏ được một container, một tiến trình và
một chuỗi kết nối; sao lưu là copy một tệp. Đổi sang Postgres khi thật sự cần
nhiều instance ghi song song hoặc replica đọc.

SQLite không có kiểu mảng và enum, nên các danh sách (`tags`, `coverGradient`,
`urls`) lưu chuỗi JSON và được quy đổi trong `lib/store.ts` / `lib/queue.ts`.

| Bảng | Nội dung |
|---|---|
| `users` | Tài khoản, mật khẩu băm scrypt + salt riêng, vai trò |
| `articles` | Bài viết, trạng thái, nội dung HTML, ảnh bìa |
| `sources` | Nguồn tham khảo (1-n với bài, xoá bài thì xoá theo) |
| `comments` | Bình luận, tự trỏ về chính nó để làm trả lời 1 tầng |
| `research_requests` | Hàng đợi đề tài |

### Lệnh thường dùng

```bash
npm run db:migrate     # tạo migration mới khi đổi schema
npm run db:deploy      # áp migration (container tự chạy lúc khởi động)
npm run db:studio      # giao diện xem/sửa dữ liệu
npm run db:import      # nạp lại từ data/export.json
```

## Soạn thảo & tải file

Nội dung bài dùng trình soạn thảo trực quan (Tiptap): in đậm/nghiêng/gạch chân,
tiêu đề H2–H3, danh sách, trích dẫn, căn lề, chèn link, hoàn tác/làm lại.

Ảnh và video **tải trực tiếp từ máy** (nút 🖼 trên thanh công cụ, hoặc nút
"Tải ảnh lên" ở ô ảnh bìa). File đẩy thẳng lên **S3** (`s3://genz-news`,
key `uploads/YYYY/MM/<uuid>.<ext>`), không lưu trên đĩa máy chủ.

| Loại | Định dạng | Dung lượng tối đa |
|---|---|---|
| Ảnh | JPG, PNG, WebP, GIF, AVIF | 10–15MB |
| Video | MP4, WebM | 200MB |

Ngoài ra nút ▶ cho phép nhúng video YouTube bằng link.

Nội dung được lưu dưới dạng HTML và **làm sạch bằng `sanitize-html` ở phía
server** trước khi ghi — chặn XSS từ nội dung do người dùng gửi lên. Chỉ cho
nhúng iframe từ YouTube và Vimeo.

Tên tệp do server sinh (UUID) và **kiểm magic bytes** chứ không tin phần mở rộng
hay `Content-Type` client khai. Trên EC2 dùng profile AWS mount chỉ đọc từ
`/root/.aws`; có IAM role thì bỏ mount đi, an toàn hơn.

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

### Biến môi trường (đều tuỳ chọn)

| biến | mặc định | dùng khi |
|---|---|---|
| `ADMIN_USER` / `ADMIN_PASSWORD` | `admin` / `admin` | chỉ áp dụng khi bảng `users` chưa có admin nào |
| `ADMIN_SESSION_SECRET` | tự sinh vào `data/session-secret` | muốn xoay khoá, hoặc chạy nhiều instance |
| `ALLOW_REGISTRATION` | `1` | đặt `0` để đóng đăng ký công khai |
| `S3_BUCKET` / `AWS_REGION` / `AWS_PROFILE` | `genz-news` / `us-east-1` / `s3-full-sandbox` | đổi kho lưu ảnh |
| `YOUTUBE_API_KEY` | trống | bật nguồn YouTube Trending |
| `DATABASE_PATH` | `data/app.db` | đổi vị trí tệp SQLite |

Tài khoản admin đã tồn tại thì đổi mật khẩu trong `/admin/tai-khoan`, sửa biến
môi trường không còn tác dụng.

## Deploy

Kiến trúc theo [setup.md](setup.md):

```
Internet ──443──> nginx (host) ──proxy──> 127.0.0.1:5006 ──> container
                                                               │
                              /srv/genz-news/data ─bind mount───┘
```

Lần đầu, deploy tay để thấy lỗi trên terminal của mình:

```bash
# trên máy chủ
mkdir -p /srv/genz-news/data && chown -R 1000:1000 /srv/genz-news/data
git clone <repo> /srv/genz-news/repo && cd /srv/genz-news/repo
docker-compose up -d --build
curl -fsS http://127.0.0.1:5006/api/health

sudo ./deploy/setup-nginx.sh genz-news.site
```

Sau đó CI lo phần còn lại: [`.gitlab-ci.yml`](.gitlab-ci.yml) chạy lint rồi
deploy, có chờ healthcheck nên pipeline không báo xanh trong lúc site 502.
Runner cần thẻ **`genz-news-deploy`**, executor `shell`, và nằm trong nhóm
`docker`.

Sao lưu: [`deploy/backup-to-s3.sh`](deploy/backup-to-s3.sh) chụp SQLite bằng
`.backup`, nén, mã hoá GPG rồi đẩy lên S3. Đặt vào cron 3h sáng.

## Thu thập xu hướng tự động

```bash
npm run collect-trends
```

Script gom xu hướng từ 6 nguồn hợp pháp, **chấm điểm độ nóng** rồi mới ghi vào
hàng đợi đề tài:

| Nguồn | Cần key? | Ghi chú |
|---|---|---|
| Google Trends VN | Không | Lượt tìm kiếm thật của người Việt hôm nay — thước đo nóng nhất; tự lọc xổ số/giá vàng/link xem bóng đá |
| Google Trends toàn cầu | Không | Cùng feed, `TRENDS_GLOBAL_GEO` khác (mặc định US), cho phần quốc tế |
| YouTube Trending VN | `YOUTUBE_API_KEY` | Bỏ qua êm nếu chưa có key |
| Reddit hot | Nên có | `r/popular`, `r/worldnews`, `r/technology`, `r/VietNam`, `r/TroChuyenLinhTinh` — số upvote là phiếu thật của người đọc |
| Google News search | Không | Mọi bài báo nước ngoài có nhắc Việt Nam / Biển Đông / kinh tế VN |
| RSS 17 báo Việt + quốc tế | Không | Feed công khai do chính các hãng cung cấp |

**Reddit cần khoá.** Endpoint `.json` ẩn danh giờ hay trả về trang HTML "Welcome
to Reddit" kèm mã 200 thay vì JSON, và nó chặn theo IP nên chạy được ở máy này
không có nghĩa là chạy được trên EC2. Đăng ký một *script app* miễn phí ở
<https://www.reddit.com/prefs/apps> rồi đặt `REDDIT_CLIENT_ID` và
`REDDIT_CLIENT_SECRET`; script tự đi lối `oauth.reddit.com`. Chưa có khoá thì
nguồn này chỉ ghi một dòng cảnh báo rồi bỏ qua, các nguồn khác vẫn chạy.

Facebook/TikTok/X không có API công khai cho trending (X đã đóng hẳn bậc miễn
phí) và cào thì trái điều khoản của họ, nên không lấy trực tiếp. Thứ nóng trên
các nền tảng đó phần lớn vẫn hiện ra ở Google Trends VN — người ta search sau
khi thấy trên mạng xã hội — và ở tin giải trí của báo Việt.

**Cách chọn đề tài.** Mọi ứng viên đi qua `scripts/lib/topic-filter.mjs`:

- Cộng điểm: nguồn càng đo được độ quan tâm thật càng cao; nhắc Việt Nam +20;
  chủ quyền/lãnh thổ +45; Trung Quốc ↔ Việt Nam +35; chuyện bạn đọc 18–27 đang
  bàn (học phí, việc làm, iPhone, concert, drama...) tối đa +24.
- Trừ điểm: tin gọi vốn/thay ghế lãnh đạo/ghi chú phát hành/nghi lễ địa phương
  nước xa tối đa −45; không dính Việt Nam mà cũng không chạm tới nước hay hãng
  nào người Việt theo dõi −25; từ khoá tra cứu chưa thành câu chuyện −30.
- Gộp **trùng gần**: cùng một sự việc thì mỗi báo giật tít một kiểu, `dedupeKey`
  chỉ bắt được tít giống hệt. `sameStory()` so theo tập từ mang nghĩa — một mẻ
  thật gộp được ~140 tít, trong đó có 4 bản của cùng tin Tesla mở công ty ở Việt Nam.
- Chọn theo **hạn ngạch 70% Việt Nam / 30% quốc tế**, kèm hai trần: **25% mỗi
  nguồn** (tính theo từng truy vấn / từng tờ báo, không phải cả cụm Google News)
  và **30% mỗi mảng đề tài**. Trần theo mảng là thứ giữ cho hàng đợi còn chỗ cho
  kinh tế, giao thông, giáo dục — nhóm ưu tiên được chọn TRƯỚC, không phải
  được chọn HẾT. Các mảng: Việt–Trung/chủ quyền, kinh tế, giao thông, chính trị,
  giáo dục, công nghệ, giải trí, thể thao, đời sống.
- Đề tài quốc tế phải qua ngưỡng điểm cao hơn — phần 30% chỉ có vài suất nên
  tin thế giới phải thật sự lớn.

### Tít tiếng Việt

Hơn nửa hàng đợi là tít tiếng Anh (Reuters, Nikkei, SCMP...), đọc từng cái mới quyết
được có bấm *Create post* hay không thì rất chậm. `scripts/translate-topics.mjs`
dịch chúng sang tiếng Việt, ghi vào cột `topicVi`; `collect-trends` tự gọi sau
mỗi lượt thu thập. Màn hình hiện tít Việt lên trước, tít gốc xuống dưới dạng phụ
— bản dịch do máy viết nên cần đối chiếu được, và tên riêng trong tít gốc là thứ
dùng để đi tìm bài nguồn.

Dịch bằng `claude -p` (đã đăng nhập sẵn trên máy chủ cho vòng viết bài) chứ không
gọi API dịch: tít báo cần diễn giải chứ không dịch từng chữ. Một lượt gọi cho cả mẻ.
Chưa cài `claude` thì script cảnh báo rồi thoát êm, màn hình rơi về tít gốc.

```bash
npm run translate-topics              # dịch mọi mục chưa có tít Việt
npm run translate-topics -- --dry-run # chỉ in ra, không ghi
```

Đề tài nào lọt vào đều mang theo dòng `[xếp loại] điểm nóng N · Việt Nam · ƯU
TIÊN` cùng lý do trong `notes`, hiện ngay ở `/admin/research`.

Kết quả ghi vào bảng `research_requests` (hiện ở `/admin/research`) và
`data/trends-digest.json` (dữ liệu thô để tra cứu). Đề tài đã có trong 7 ngày
gần nhất sẽ không bị thêm trùng.

Tùy chỉnh bằng biến môi trường:

```
YOUTUBE_API_KEY=...        # bật nguồn YouTube (lấy ở Google Cloud Console)
REDDIT_CLIENT_ID=...       # script app ở reddit.com/prefs/apps
REDDIT_CLIENT_SECRET=...
TRENDS_MAX_TOPICS=18       # tổng số đề tài ghi vào hàng đợi mỗi lượt
TRENDS_VN_SHARE=0.7        # tỷ lệ đề tài Việt Nam
TRENDS_MIN_SCORE=0         # ngưỡng điểm nóng tối thiểu
TRENDS_MIN_SCORE_INTL=20   # ngưỡng riêng, cao hơn, cho đề tài quốc tế
TRENDS_GLOBAL_GEO=US       # geo cho Google Trends quốc tế
TRENDS_REDDIT=0            # tắt nguồn Reddit
TRENDS_DEDUPE_DAYS=7       # cửa sổ chống trùng
TRENDS_DRY_RUN=1           # chỉ in ra, không ghi file
TRENDS_EXPLAIN=1           # in cả đề tài bị loại kèm lý do, để chỉnh ngưỡng
```

Muốn xem bộ lọc đang chấm ra sao mà không ghi gì:

```bash
TRENDS_DRY_RUN=1 TRENDS_EXPLAIN=1 npm run collect-trends
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
