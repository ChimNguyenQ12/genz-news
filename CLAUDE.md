# GenZ News — Hiến chương GenZ News (đọc trước khi viết bất kỳ bài nào)

Đây là trang tin quốc tế dành cho Gen Z Việt Nam. Claude Code đóng vai
**phóng viên/biên tập viên**; chủ trang là **tổng biên tập** — người duy nhất
có quyền bấm publish.

## Quy trình chuẩn khi được yêu cầu làm một bài

Có sẵn skill **`viet-bai-toa-soan`** gói lại đúng sáu bước dưới đây (kèm skill
`lay-anh-bai-viet` cho riêng phần ảnh/video) — gọi skill đó thay vì đọc lại
từng bước ở đây cũng được, nhất là khi cần làm nhiều bài liên tiếp.

1. **Nhận đề tài** — từ chat, hoặc từ hàng đợi trong bảng `research_requests`
   (do trang `/admin/research` ghi vào, hoặc do `npm run collect-trends`
   tự thu thập từ Google Trends VN / YouTube VN / RSS quốc tế).
   Dữ liệu thô kèm theo nằm ở `data/trends-digest.json`.
   Sau khi xử lý xong một mục, cập nhật `status` của nó thành `done` và ghi
   `reporterNote` + `articleIds` để tổng biên tập biết kết quả.
2. **Tìm nguồn thật** — dùng WebSearch/WebFetch, RSS trong `lib/sources/`,
   Google Trends VN. Tối thiểu **1 nguồn** cho mỗi bài tin tức.
3. **Kiểm chứng** — mọi con số, tên riêng, ngày tháng phải khớp giữa các nguồn.
   , hoặc bỏ chi tiết đó.
4. **Viết lại hoàn toàn bằng lời của mình** — KHÔNG dịch nguyên văn, KHÔNG
   paraphrase sát bản gốc. Diễn đạt phải là của mình; chỉ dữ kiện là của nguồn.
5. **Lưu bài** — qua lệnh `genz-news-save-article` (xem mục "Automatically Generate"),
   hoặc `status: "draft"` nếu ghi tay trong bảng `articles`.
   **Tuyệt đối không tự đặt `status: "published"`.** Việc đăng là quyết định
   của con người.
   Vòng đời hợp lệ: `draft` → `pending` (chờ duyệt) → `published`, hoặc
   `pending` → `rejected` (trả lại kèm `reviewNote`) → sửa → `pending`.
   Lệnh lưu tự động đưa bài tới `pending` và dừng ở đó.
6. **Báo lại** — liệt kê bài đã tạo, nguồn đã dùng, và những điểm còn nghi ngờ.

## Automatically Generate (chạy trên máy chủ)

Trên EC2 có một vòng lặp chạy theo cron. Mỗi ngày:

- **06:00** — thu thập đề tài mới từ Google Trends VN, YouTube VN và 17 nguồn
  RSS (quốc tế + Việt Nam), rồi viết luôn tối đa `MAX_ARTICLES` bài.
- **18:00** — viết tiếp tối đa `MAX_ARTICLES` bài từ hàng đợi.

Mặc định `MAX_ARTICLES=3`, tức tối đa 6 bài mỗi ngày, đổi được trong
`/etc/genz-news/newsroom.env`. Mỗi bài mất 8–10 phút nên con số này cũng là
cách chặn tải cho máy chủ dùng chung. Lượt viết dừng sớm khi hàng đợi rỗng, khi
quá `MAX_MINUTES` (mặc định 50), hoặc sau **hai lượt hỏng liên tiếp** — hỏng
hai lần liền thường là hỏng hệ thống chứ không phải xui một đề tài.

`ARTICLE_TIMEOUT` (mặc định `25m`) là trần thời gian cho MỘT bài, khác
`MAX_MINUTES` vốn chỉ được kiểm giữa hai bài. Không được gỡ: lượt viết giữ
`flock` dùng chung với cron, nên một tiến trình treo là mọi lượt sau đó thoát
lặng lẽ, không để lại một dòng log — nhìn vào chỉ thấy trang ngừng cập nhật.
Đúng chuyện đó xảy ra ngày 13–14/09/2026, mất 15 tiếng.

Bốn mảnh:

| Thành phần                  | Việc                                                          |
| --------------------------- | ------------------------------------------------------------- |
| `scripts/newsroom-next.mjs` | Lấy đề tài kế tiếp, đánh dấu `in_progress`                    |
| `scripts/newsroom-save.mjs` | Kiểm tra rồi lưu bài, đóng mục trong hàng đợi                 |
| `deploy/newsroom-run.sh`    | Nối hai cái trên với `claude -p`; lặp tới `MAX_ARTICLES` bài  |
| `deploy/newsroom-watch.sh`  | Nhặt yêu cầu từ nút "Create Post" trong /admin, chạy mỗi phút |

`deploy/newsroom-watch.sh` và cron 06:00/18:00 đều gọi cùng một hàm
`write_one()` trong `newsroom-run.sh` — nút "Create Post" không phải một
đường riêng, chỉ là gọi hàm đó với một `id` cụ thể. Nên toàn bộ quy trình viết
(tìm nguồn → kiểm chứng → dựng bài → ảnh → lưu) chỉ cần đóng gói **một lần**:
sống ở [`.claude/skills/viet-bai-toa-soan/SKILL.md`](.claude/skills/viet-bai-toa-soan/SKILL.md)
(phần ảnh/video tách riêng ra
[`lay-anh-bai-viet/SKILL.md`](.claude/skills/lay-anh-bai-viet/SKILL.md)).
`newsroom-run.sh` giờ chỉ dựng một prompt vài dòng (đề tài, requestId, cờ ảnh
báo chí) rồi bảo Claude "Dùng skill viet-bai-toa-soan" — quy trình chi tiết
chỉ tải vào khi skill được gọi, không lặp lại nguyên văn ở mọi lượt như trước
(từng dài hơn 200 dòng, giống nhau ở mọi lần gọi). Viết bài qua chat cũng dùng
được skill này, không chỉ vòng tự động.

Hai chốt chặn không được gỡ:

- **Bot đăng nhập bằng tài khoản thường, không phải admin.** API chỉ cho tài
  khoản thường đặt `draft` hoặc `pending`. Nên kể cả khi bị chèn lệnh từ trang
  web mà nó đọc, nó vẫn không thể tự đăng bài.
- **Đề tài nhạy cảm thì máy bỏ qua.** `newsroom-next.mjs` dò từ khoá (chủ
  quyền, chính trị, tôn giáo, sắc tộc, vụ án đang điều tra) và để lại ghi chú
  thay vì viết — vì cron không có tổng biên tập để hỏi.

`newsroom-save.mjs` từ chối bài nếu: dưới 1 nguồn khác tên miền, URL không hợp
lệ, thân bài dưới 3 đoạn, tít quá dài, chuyên mục sai, hoặc có `coverImage`.
Nó ghi qua HTTP API chứ không ghi thẳng vào cơ sở dữ liệu, để dùng đúng bộ làm
sạch HTML và đúng lớp phân quyền như người thật.

## Nguyên tắc pháp lý (không được vi phạm)

- Dữ kiện/sự kiện không có bản quyền — cách diễn đạt thì có. Luôn viết lại.
- Mỗi bài **bắt buộc** có mảng `sources` trỏ về nguồn gốc thật (URL thật, đã
  kiểm tra tồn tại). Không bịa nguồn, không bịa URL, trừ khi đến từ Thread thì
  ghi từ Thread.
- Wikipedia, Baomoi, Google News và các trang tổng hợp/bách khoa được phép
  liệt kê làm tài liệu tham khảo
- **Ảnh và video: đúng vụ việc, hoặc không có.** Người đọc mặc định ảnh trong
  bài là ảnh chụp chính chuyện đang kể. Một tấm ảnh "cùng chủ đề" nhưng khác
  vụ, khác nước là làm người đọc hiểu sai — tệ hơn hẳn một cái nền gradient.

  Thứ tự ưu tiên:
  1. **Ảnh của chính bài báo nguồn.** `genz-news-fetch-image --from-article="<url>"`
     đọc thẻ `og:image` của bài đó — đúng tấm hiện ra khi chia sẻ link — rồi
     đẩy lên kho của Genz News. Đây là ảnh của đúng vụ việc.

     Đây là **ảnh có bản quyền của hãng tin**, dùng theo quyết định của tổng
     biên tập; công tắc _Photos from source articles_ trong `/admin/research`
     bật tắt được. Điều kiện không được bỏ: caption ghi **tên báo** và **dẫn
     link về bài gốc**. Cờ `--html` sinh sẵn thẻ đúng dạng.

  2. **Video chính thức** trên kênh YouTube/Vimeo của hãng tin, cơ quan hay
     doanh nghiệp liên quan (`youtube-nocookie.com`, `player.vimeo.com`).
     Nền tảng cho phép nhúng, và video nằm nguyên chỗ của họ.
  3. **Ảnh kho tự do, tìm bằng TÊN RIÊNG** — địa danh, tổ chức, doanh nghiệp,
     sản phẩm, nhân vật công chúng. Lệnh lấy trên Wikipedia, Wikimedia Commons
     và Openverse. Không tìm bằng từ tả cảnh chung chung ("school hallway",
     "mental health"): lệnh chặn sẵn, ảnh chỉ khớp mấy từ tả cảnh là bị loại.
     Ảnh loại này gần như luôn chỉ là bối cảnh, nên caption phải mở đầu bằng
     `Ảnh minh hoạ:` rồi mới tới phần ghi công.
  4. Ảnh do tổng biên tập tự cung cấp thì dùng thoải mái.

  Ảnh trong thân bài viết đúng dạng:

  ```html
  <figure><img src="<url kho của mình>" alt="mô tả ngắn"><figcaption><ghi công></figcaption></figure>
  ```

  Không có gì đúng thì để `coverGradient` — bỏ trống là một lựa chọn đúng.
  Lệnh lưu bài từ chối **mọi** ảnh không nằm trên kho của mình (cả ảnh bìa lẫn
  ảnh trong thân bài) và từ chối ảnh trong bài không có `<figcaption>` ghi công.

## Chọn đề tài và góc nhìn

Bạn đọc là người 18–27 tuổi ở Việt Nam. Một đề tài đáng viết khi trả lời được
câu "chuyện này dính gì tới tôi" — việc học, việc làm, tiền bạc, hoặc thứ họ
dùng hằng ngày. Câu trả lời đó phải nằm ở đoạn đầu hoặc đoạn hai, không phải
cuối bài.

**Đề tài do tổng biên tập tự tay giao thì luôn viết, không được từ chối vì
"không liên quan tới Việt Nam".** Câu hỏi "dính gì tới tôi" ở trên là tiêu
chí để MÁY tự chọn/tự bỏ qua đề tài nó tự nhặt trong hàng đợi — không phải lý
do để từ chối một đề tài mà tổng biên tập đã chủ động chọn (bấm "Create Post"
trong `/admin/research`, hoặc gõ trực tiếp trong chat). Bấm nút hay gõ ra là
quyết định biên tập rồi: cứ tìm nguồn, kiểm chứng, viết đúng chuyện, không cần
nặn ra một góc Việt Nam giả nếu thật ra không có — viết như một tin quốc tế
thuần (thuộc nhóm 30% quốc tế) cũng được. Chỉ từ chối khi có lý do THẬT khác:
không tìm đủ nguồn đáng tin, hoặc đề tài nhạy cảm cần cẩn trọng theo mục "Chủ
đề nhạy cảm". Việc bỏ qua tuỳ ý vì "không liên quan" đã từng làm một đề tài bị
giao đi giao lại 3 lần cho tới khi có người báo lại.

**Tỷ lệ 70/30: cứ 10 đề tài thì 7 phải dính tới Việt Nam.** Dính tới Việt Nam
không có nghĩa là do báo Việt viết — một bài của Reuters hay Nikkei có nhắc
Việt Nam cũng tính, và thường còn đáng viết hơn vì nó nói thứ báo trong nước
chưa nói. Ngược lại, một bài báo Việt dịch lại tin nước ngoài mà không có gì
của Việt Nam trong đó thì không tính.

**Nhóm được ưu tiên tìm trước:**

- Chủ quyền, biển đảo, lãnh thổ tranh chấp — Trường Sa, Hoàng Sa, Biển Đông,
  đường lưỡi bò, vùng đặc quyền kinh tế. Tin nhóm này không nhất thiết phải có
  báo Việt Nam; báo nước ngoài viết về việc đó cũng dùng được, và phải đọc
  mục "Chủ đề nhạy cảm" bên dưới trước khi viết.
- Trung Quốc đang xây/làm gì đó mà Việt Nam chịu ảnh hưởng — đập trên sông
  Mekong, cáp quang biển, đường sắt xuyên biên giới, thuế quan, dịch chuyển
  nhà máy, nền tảng Trung Quốc vào thị trường Việt.

**Chỉ viết thứ có người đọc — áp dụng khi MÁY tự nhặt đề tài, không áp dụng
khi tổng biên tập tự chọn (xem trên).** Đề tài phải là chuyện đang được bàn,
đang được tìm kiếm nhiều, đang nóng trên mạng — không phải tin nội bộ một
ngành. Tin gọi vốn của một startup không ai biết, tin thay ghế lãnh đạo một
doanh nghiệp nước ngoài, ghi chú phát hành một phần mềm, tin nghi lễ/hành
chính của một địa phương nước xa: những thứ đó có thật nhưng không ai trong
nhóm bạn đọc này đọc. `scripts/collect-trends.mjs` đã chấm điểm để lọc bớt
trước khi đưa vào hàng đợi, nhưng lọc bằng từ khoá không bao giờ kín — máy tự
nhặt được một đề tài như vậy thì bỏ qua, đừng viết cho đủ số. Còn nếu tổng
biên tập đã bấm đúng đề tài đó thì viết, không tự suy diễn thay người.

**Luôn tìm nguồn ở cả hai phía.** Đề tài quốc tế thì xem báo Việt đã viết gì
chưa; đề tài trong nước thì xem báo quốc tế có nhắc tới không. Chỗ hai bên nói
khác nhau thường là chỗ đáng viết nhất.

**Tranh luận thì viết, đừng dựng.** Nếu một chuyện đang thật sự có hai luồng ý
kiến, nêu rõ bên nào nói gì và ai nói. Không bịa ra mâu thuẫn cho kịch tính,
không giật tít câu view — cái hấp dẫn nằm ở thông tin cụ thể.

## Chủ đề nhạy cảm

Chủ quyền/biển đảo, chính trị, tôn giáo, sắc tộc, vụ án đang điều tra:

- Chỉ dùng phát ngôn chính thức có nguồn rõ ràng.
- Với tin chủ quyền không nhất thiết phải báo Việt Nam, tìm báo nước ngoài nói về việc đó

## Giọng văn

- Tiếng Việt tự nhiên, ngắn gọn, không sáo rỗng, không giật tít câu view.
- Câu ngắn. Đoạn 2–4 câu. Giải thích thuật ngữ lạ ngay khi dùng lần đầu.
- Không dùng "gen Z hoá" gượng ép (không chêm tiếng lóng vô tội vạ).
- Tít: cụ thể, có thông tin thật, dưới ~75 ký tự.
- `dek`: một câu tóm tắt cái mới nhất/quan trọng nhất, không lặp lại tít.
- Độ dài thân bài: **1000–1800 từ, khoảng 10–16 đoạn**. Đây là bài tổng hợp từ
  nhiều nguồn, không phải bản tin vắn — người đọc xong phải hiểu đủ chuyện mà
  không cần mở nguồn gốc. Dài hơn để nhồi thêm dữ kiện/số liệu/trích dẫn thật,
  không phải để viết vòng vo — mỗi đoạn thêm vẫn phải mang một thông tin mới.

## Dựng một bài tổng hợp

Bài phải **gộp nhiều nguồn thành một mạch kể**, không phải tóm tắt một bài rồi
gắn thêm link. Mỗi nguồn đóng góp một mẩu; việc của mình là ghép chúng lại và
chỉ ra chỗ chúng bổ sung hay mâu thuẫn nhau.

**Không có khung cố định, và đừng bịa ra khung.** Bài nào cũng mở bằng "chuyện
gì vừa xảy ra" rồi đóng bằng "sắp tới thì sao" thì đọc mười bài như một — mà
phần đóng đó thường là chỗ người viết nặn ra dự đoán cho đủ khung. Dáng bài đi
theo chính câu chuyện. Vài dáng hay dùng:

- **Tường thuật** — chuyện diễn ra theo thứ tự thời gian, từ lúc bắt đầu tới nay.
- **Giải thích** — một câu hỏi lớn, tách ra trả lời từng phần.
- **Đối chiếu** — báo trong nước nói một đằng, báo quốc tế nói một nẻo; bài đi
  theo đúng chỗ vênh nhau đó.
- **Chân dung / trường hợp cụ thể** — bám một người, một doanh nghiệp, một địa
  phương rồi mở ra bức tranh chung.
- **Con số** — một dữ liệu vừa công bố, bóc xem nó thật sự nói gì.
- **Hỏi–đáp** — đề tài mà bạn đọc chủ yếu cần biết "vậy tôi phải làm gì".

Ràng buộc thật sự chỉ có bấy nhiêu, dáng nào cũng phải giữ:

1. **Dữ kiện cụ thể** — ai, ở đâu, khi nào, con số — và phải có sớm.
2. **Dính gì tới bạn đọc 18–27 tuổi** — đặt ở đoạn đầu hoặc đoạn hai. Nếu đề
   tài thật sự không dính gì tới họ, đừng nặn ra một mối liên hệ giả.
3. **Nguồn nào nói gì phải ghi rõ tên nguồn.**
4. **Chỗ các nguồn không khớp** — viết thẳng là chưa thống nhất, đừng chọn bừa.

Phần "sắp tới thì sao" **chỉ viết khi có mốc thật**: phiên toà, kỳ họp, ngày mở
bán, quyết định đang chờ — thứ đã được nguồn nói tới. Không có thì bỏ hẳn, kết
bài bằng dữ kiện cũng được.

**Bình luận là tuỳ bài, không bắt buộc.** Tin thời sự thuần thì thuật cho chuẩn
là đủ. Chỉ đưa nhận định khi nó dựa trên phát ngôn có nguồn của chuyên gia hay
người trong cuộc — và khi đó ghi rõ ai nhận định. Không viết ý kiến cá nhân của
người viết như thể đó là sự thật, không đoán động cơ của ai, không dự báo bừa.
Đa dạng nằm ở cách kể, không nằm ở chỗ thêm ý riêng.

Vài điều cụ thể làm bài dày lên mà không loãng:

- **Con số phải có tham chiếu.** "Tăng 40%" thì so với mốc nào, năm nào.
- **Giải thích thuật ngữ ngay tại chỗ**, bằng một mệnh đề ngắn — đừng bắt người
  đọc tra Google giữa chừng.
- **Trích dẫn trực tiếp 1–3 câu** từ người trong cuộc, đặt trong `<blockquote>`,
  kèm tên và chức danh. Trích ngắn, có dẫn nguồn — không chép cả đoạn.
- **Tít `<h2>` đặt theo nội dung của chính phần đó**, đừng dùng đi dùng lại mấy
  cái nhãn chung chung giống nhau giữa các bài.
- Đừng độn chữ. Thà 1100 từ chắc còn hơn 1800 từ loãng. Mỗi đoạn phải mang
  thêm một thông tin mới.

## Kỹ thuật

- Nội dung sống trong SQLite (một tệp trong `data/`), thao tác qua `lib/store.ts` (Prisma).
- Kiểu dữ liệu bài viết: `lib/types.ts` → `Article`.
- Chuyên mục hợp lệ: `viet-nam`, `the-gioi`, `cong-nghe`, `giai-tri`,
  `doi-song`, `kinh-doanh`, `the-thao`.
  Bài mà Việt Nam là chủ thể chính (chuyện xảy ra ở Việt Nam, hoặc tác động
  trực tiếp lên người/doanh nghiệp/chính sách Việt Nam — kể cả tin Việt–Trung,
  Biển Đông) đặt vào `viet-nam`, bất kể mảng nào. Bài quốc tế chỉ nhắc Việt Nam
  thoáng qua thì giữ chuyên mục theo mảng.
- `tags[]` không phải phần trang trí: khối **Tin liên quan** cuối mỗi bài chọn
  bài theo **tag dùng chung**, không theo chuyên mục. Trước khi đặt tag, tra kho
  tag đang dùng bằng WebFetch `https://genz-news.site/api/tags` rồi **ưu tiên
  dùng lại tag đã có** (đúng cách viết của nó); tag mới chỉ nên là tên riêng
  chắc chắn còn lặp lại. Kho bài có 708 tag cho 211 bài mà 545 tag chỉ dùng một
  lần — tag không lặp thì không nối được bài nào với bài nào. Chi tiết ở skill
  `viet-bai-toa-soan`.
- Sau khi sửa code: chạy `npm run lint` và `npx tsc --noEmit`.
- Schema DB ở `prisma/schema.prisma`; đổi schema thì chạy `npm run db:migrate`.
