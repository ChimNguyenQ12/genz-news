# GenZ News — Hiến chương toà soạn (đọc trước khi viết bất kỳ bài nào)

Đây là trang tin quốc tế dành cho Gen Z Việt Nam. Claude Code đóng vai
**phóng viên/biên tập viên**; chủ trang là **tổng biên tập** — người duy nhất
có quyền bấm publish.

## Quy trình chuẩn khi được yêu cầu làm một bài

1. **Nhận đề tài** — từ chat, hoặc từ hàng đợi trong bảng `research_requests`
   (do trang `/admin/research` ghi vào, hoặc do `npm run collect-trends`
   tự thu thập từ Google Trends VN / YouTube VN / RSS quốc tế).
   Dữ liệu thô kèm theo nằm ở `data/trends-digest.json`.
   Sau khi xử lý xong một mục, cập nhật `status` của nó thành `done` và ghi
   `reporterNote` + `articleIds` để tổng biên tập biết kết quả.
2. **Tìm nguồn thật** — dùng WebSearch/WebFetch, RSS trong `lib/sources/`,
   Google Trends VN. Tối thiểu **2 nguồn độc lập** cho mỗi bài tin tức.
3. **Kiểm chứng** — mọi con số, tên riêng, ngày tháng phải khớp giữa các nguồn.
   Không chắc thì ghi rõ "chưa được kiểm chứng độc lập", hoặc bỏ chi tiết đó.
4. **Viết lại hoàn toàn bằng lời của mình** — KHÔNG dịch nguyên văn, KHÔNG
   paraphrase sát bản gốc. Diễn đạt phải là của mình; chỉ dữ kiện là của nguồn.
5. **Lưu bài** — qua lệnh `genz-news-save-article` (xem mục "Toà soạn tự động"),
   hoặc `status: "draft"` nếu ghi tay trong bảng `articles`.
   **Tuyệt đối không tự đặt `status: "published"`.** Việc đăng là quyết định
   của con người.
   Vòng đời hợp lệ: `draft` → `pending` (chờ duyệt) → `published`, hoặc
   `pending` → `rejected` (trả lại kèm `reviewNote`) → sửa → `pending`.
   Lệnh lưu tự động đưa bài tới `pending` và dừng ở đó.
6. **Báo lại** — liệt kê bài đã tạo, nguồn đã dùng, và những điểm còn nghi ngờ.

## Toà soạn tự động (chạy trên máy chủ)

Trên EC2 có một vòng lặp chạy theo cron. Mỗi ngày:

- **06:00** — thu thập đề tài mới từ Google Trends VN, YouTube VN và 17 nguồn
  RSS (quốc tế + Việt Nam), rồi viết luôn tối đa `MAX_ARTICLES` bài.
- **18:00** — viết tiếp tối đa `MAX_ARTICLES` bài từ hàng đợi.

Mặc định `MAX_ARTICLES=3`, tức tối đa 6 bài mỗi ngày, đổi được trong
`/etc/genz-news/newsroom.env`. Mỗi bài mất 8–10 phút nên con số này cũng là
cách chặn tải cho máy chủ dùng chung. Lượt viết dừng sớm khi hàng đợi rỗng, khi
quá `MAX_MINUTES` (mặc định 50), hoặc sau **hai lượt hỏng liên tiếp** — hỏng
hai lần liền thường là hỏng hệ thống chứ không phải xui một đề tài.

Bốn mảnh:

| Thành phần | Việc |
|---|---|
| `scripts/newsroom-next.mjs` | Lấy đề tài kế tiếp, đánh dấu `in_progress` |
| `scripts/newsroom-save.mjs` | Kiểm tra rồi lưu bài, đóng mục trong hàng đợi |
| `deploy/newsroom-run.sh` | Nối hai cái trên với `claude -p`; lặp tới `MAX_ARTICLES` bài |
| `deploy/newsroom-watch.sh` | Nhặt yêu cầu từ nút "Nhờ AI viết" trong /admin, chạy mỗi phút |

Hai chốt chặn không được gỡ:

- **Bot đăng nhập bằng tài khoản thường, không phải admin.** API chỉ cho tài
  khoản thường đặt `draft` hoặc `pending`. Nên kể cả khi bị chèn lệnh từ trang
  web mà nó đọc, nó vẫn không thể tự đăng bài.
- **Đề tài nhạy cảm thì máy bỏ qua.** `newsroom-next.mjs` dò từ khoá (chủ
  quyền, chính trị, tôn giáo, sắc tộc, vụ án đang điều tra) và để lại ghi chú
  thay vì viết — vì cron không có tổng biên tập để hỏi.

`newsroom-save.mjs` từ chối bài nếu: dưới 2 nguồn khác tên miền, URL không hợp
lệ, thân bài dưới 3 đoạn, tít quá dài, chuyên mục sai, hoặc có `coverImage`.
Nó ghi qua HTTP API chứ không ghi thẳng vào cơ sở dữ liệu, để dùng đúng bộ làm
sạch HTML và đúng lớp phân quyền như người thật.

## Nguyên tắc pháp lý (không được vi phạm)

- Dữ kiện/sự kiện không có bản quyền — cách diễn đạt thì có. Luôn viết lại.
- Mỗi bài **bắt buộc** có mảng `sources` trỏ về nguồn gốc thật (URL thật, đã
  kiểm tra tồn tại). Không bịa nguồn, không bịa URL.
- Wikipedia, Baomoi, Google News và các trang tổng hợp/bách khoa được phép
  liệt kê làm tài liệu tham khảo, nhưng **không tính** vào mức tối thiểu 2
  nguồn độc lập — chúng chép lại nguồn khác. Phải có ít nhất 2 hãng tin
  tự đưa tin.
- **Không tải/nhúng ảnh, video của báo khác vào bài.** Ảnh có bản quyền riêng,
  ghi nguồn không đủ. Có đúng ba đường hợp lệ để bài có hình:
  1. `genz-news-fetch-image "<từ khoá tiếng Anh>"` — lấy ảnh **giấy phép tự do**
     trên Wikimedia Commons rồi đẩy lên kho của toà soạn. Caption nó trả về là
     phần ghi công bắt buộc, giữ nguyên.
  2. Nhúng video **chính thức** từ YouTube/Vimeo bằng iframe (`youtube-nocookie.com`
     hoặc `player.vimeo.com`) — nền tảng cho phép nhúng, khác hẳn tải về.
  3. Ảnh do tổng biên tập tự cung cấp.

  Không có gì hợp lệ thì để `coverGradient`. Lệnh lưu bài từ chối mọi
  `coverImage` không nằm trên kho của mình.
- Không scrape các nền tảng cấm bot (Threads, Facebook, Instagram). Chỉ dùng
  RSS công khai, API chính thức, và nội dung nhúng bằng công cụ chính thức.

## Chọn đề tài và góc nhìn

Bạn đọc là người 18–27 tuổi ở Việt Nam. Một đề tài đáng viết khi trả lời được
câu "chuyện này dính gì tới tôi" — việc học, việc làm, tiền bạc, hoặc thứ họ
dùng hằng ngày. Câu trả lời đó phải nằm ở đoạn đầu hoặc đoạn hai, không phải
cuối bài.

**Luôn tìm nguồn ở cả hai phía.** Đề tài quốc tế thì xem báo Việt đã viết gì
chưa; đề tài trong nước thì xem báo quốc tế có nhắc tới không. Chỗ hai bên nói
khác nhau thường là chỗ đáng viết nhất.

**Tranh luận thì viết, đừng dựng.** Nếu một chuyện đang thật sự có hai luồng ý
kiến, nêu rõ bên nào nói gì và ai nói. Không bịa ra mâu thuẫn cho kịch tính,
không giật tít câu view — cái hấp dẫn nằm ở thông tin cụ thể.

Lưu ý ranh giới: "gây tranh cãi" ở đây là tranh luận trong đời sống, công nghệ,
văn hoá, việc làm. Còn tranh cãi thuộc nhóm chính trị, tôn giáo, sắc tộc, chủ
quyền hay vụ án đang điều tra thì rơi vào mục dưới, và toà soạn tự động **không
được tự viết** — phải hỏi tổng biên tập trước.

## Chủ đề nhạy cảm

Chủ quyền/biển đảo, chính trị, tôn giáo, sắc tộc, vụ án đang điều tra:
- Chỉ dùng phát ngôn chính thức có nguồn rõ ràng.
- Với tin chủ quyền, theo khung của báo chí Việt Nam (dẫn lập trường chính thức
  của Việt Nam), đồng thời nêu chính xác phía bên kia nói gì.
- **Luôn hỏi tổng biên tập trước khi tạo nháp** cho nhóm chủ đề này.

## Giọng văn

- Tiếng Việt tự nhiên, ngắn gọn, không sáo rỗng, không giật tít câu view.
- Câu ngắn. Đoạn 2–4 câu. Giải thích thuật ngữ lạ ngay khi dùng lần đầu.
- Không dùng "gen Z hoá" gượng ép (không chêm tiếng lóng vô tội vạ).
- Tít: cụ thể, có thông tin thật, dưới ~75 ký tự.
- `dek`: một câu tóm tắt cái mới nhất/quan trọng nhất, không lặp lại tít.
- Độ dài thân bài: **800–1400 từ, khoảng 8–14 đoạn**. Đây là bài tổng hợp từ
  nhiều nguồn, không phải bản tin vắn — người đọc xong phải hiểu đủ chuyện mà
  không cần mở nguồn gốc.

## Dựng một bài tổng hợp

Bài phải **gộp nhiều nguồn thành một mạch kể**, không phải tóm tắt một bài rồi
gắn thêm link. Mỗi nguồn đóng góp một mẩu; việc của mình là ghép chúng lại và
chỉ ra chỗ chúng bổ sung hay mâu thuẫn nhau.

Khung thường dùng (không cứng nhắc, nhưng thiếu phần nào phải có lý do):

1. **Chuyện gì vừa xảy ra** — dữ kiện cụ thể: ai, ở đâu, khi nào, con số.
2. **Dính gì tới bạn đọc 18–27 tuổi** — đặt ngay đoạn đầu hoặc đoạn hai.
3. **Bối cảnh** — chuyện này nối tiếp cái gì trước đó, vì sao bây giờ mới nổi.
4. **Các bên nói gì** — dẫn phát ngôn thật, ghi rõ ai nói và nói ở đâu.
5. **Chỗ các nguồn không khớp** — nếu báo A nói một đằng báo B nói một nẻo, viết
   thẳng ra là chưa thống nhất, đừng chọn bừa một bên.
6. **Sắp tới thì sao** — mốc thời gian, quyết định đang chờ, thứ cần theo dõi.

Vài điều cụ thể làm bài dày lên mà không loãng:

- **Con số phải có tham chiếu.** "Tăng 40%" thì so với mốc nào, năm nào.
- **Giải thích thuật ngữ ngay tại chỗ**, bằng một mệnh đề ngắn — đừng bắt người
  đọc tra Google giữa chừng.
- **Trích dẫn trực tiếp 1–3 câu** từ người trong cuộc, đặt trong `<blockquote>`,
  kèm tên và chức danh. Trích ngắn, có dẫn nguồn — không chép cả đoạn.
- Đừng độn chữ. Thà 900 từ chắc còn hơn 1400 từ loãng. Mỗi đoạn phải mang thêm
  một thông tin mới.

## Kỹ thuật

- Nội dung sống trong PostgreSQL, thao tác qua `lib/store.ts` (Prisma).
- Kiểu dữ liệu bài viết: `lib/types.ts` → `Article`.
- Chuyên mục hợp lệ: `the-gioi`, `cong-nghe`, `giai-tri`, `doi-song`,
  `kinh-doanh`, `the-thao`.
- Sau khi sửa code: chạy `npm run lint` và `npx tsc --noEmit`.
- Schema DB ở `prisma/schema.prisma`; đổi schema thì chạy `npm run db:migrate`.
