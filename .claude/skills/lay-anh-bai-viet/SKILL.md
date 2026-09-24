---
name: lay-anh-bai-viet
description: Tìm và gắn ảnh/video ĐÚNG VỤ VIỆC cho một bài báo GenZ News, theo đúng thứ tự ưu tiên trong hiến chương (video chính thức > ảnh của chính bài báo nguồn > ảnh kho tự do tìm bằng tên riêng > không có ảnh, dùng gradient). Dùng ở bước gắn ảnh khi đang viết một bài mới (được skill viet-bai-toa-soan gọi tới), hoặc khi tổng biên tập yêu cầu trực tiếp "tìm/đổi ảnh cho bài X". KHÔNG dùng để tự bịa hay dán thẳng URL ảnh của báo khác — mọi ảnh phải đi qua lệnh genz-news-fetch-image.
tools: Bash, WebFetch
---

# Lấy ảnh & video cho bài viết

## Luật số một

Ảnh sai còn tệ hơn không có ảnh. Người đọc mặc định ảnh trong bài là ảnh chụp
chính chuyện đang kể. Một bài về vụ nam sinh ở Thanh Hoá từng bị gắn tấm ảnh
hành lang một trường tiểu học Nhật Bản — đó là làm người đọc hiểu sai, không
phải minh hoạ. Thà không có ảnh (dùng nền gradient) còn hơn có ảnh sai.

Kỹ năng này nhận đầu vào: danh sách URL nguồn đã dùng trong bài, tên riêng có
thật xuất hiện trong bài (địa danh, tổ chức, doanh nghiệp, sản phẩm, công
trình, nhân vật công chúng), và cờ **"ảnh báo chí"** — BẬT hay TẮT (do tổng
biên tập đặt ở công tắc *Photos from source articles* trong `/admin/research`;
mặc định BẬT nếu không ai nói khác).

## Thứ tự ưu tiên

### a) Video chính thức

Nếu có video trên kênh YouTube/Vimeo chính thức của hãng tin (VTV, VnExpress,
Tuổi Trẻ, Reuters, AP...), của cơ quan nhà nước hay doanh nghiệp liên quan, thì
nhúng vào thân bài:

```html
<div data-youtube-video><iframe src="https://www.youtube-nocookie.com/embed/VIDEO_ID" allowfullscreen></iframe></div>
```

Chỉ nhúng video đã thực sự mở và xác nhận đúng nội dung, đúng vụ việc. Không
bịa `VIDEO_ID`.

### b) Nếu cờ "ảnh báo chí" BẬT — ảnh của chính bài báo nguồn (ưu tiên số một)

Đây là ảnh của đúng vụ việc, không phải ảnh minh hoạ. Với từng nguồn đã dùng:

```bash
genz-news-fetch-image --from-article="https://tuoitre.vn/bai-that.htm"
```

Lệnh đọc thẻ `og:image` của bài đó — đúng tấm hiện ra khi chia sẻ link — tải
về, đẩy lên kho của toà soạn rồi in ra `{url, caption, source}`. Thử lần lượt
2–3 nguồn cho tới khi được ảnh. Thêm `--html` để có sẵn thẻ figure kèm link ghi
nguồn:

```bash
genz-news-fetch-image --html --from-article="https://..."
```

**Bắt buộc** với ảnh loại này: caption ghi TÊN BÁO và dẫn link về bài gốc —
đây là ảnh có bản quyền của hãng tin, dùng theo quyết định của tổng biên tập.
Dùng `--html` là có sẵn; viết tay thì theo đúng dạng:

```html
<figure><img src="URL_KHO" alt="mô tả ngắn"><figcaption>Ảnh: Tuổi Trẻ (<a href="URL_BÀI_GỐC">nguồn</a>)</figcaption></figure>
```

Ảnh bìa cũng lấy y như vậy: url vào `coverImage`, caption vào
`coverImageCaption`.

Không nguồn nào cho ảnh (từ chối kết nối, không có og:image...) thì chuyển
sang bước c.

### b') Nếu cờ "ảnh báo chí" TẮT

Bỏ hẳn bước b, chuyển thẳng sang bước c — chỉ dùng ảnh kho có giấy phép tự do.

### c) Ảnh kho tự do — tìm bằng TÊN RIÊNG

```bash
genz-news-fetch-image "Thanh Hoa province Vietnam"
genz-news-fetch-image --count=2 --html "Hanoi metro Cat Linh"
```

Từ khoá phải là **TÊN RIÊNG có thật trong bài** — địa danh, tổ chức, doanh
nghiệp, sản phẩm, công trình, nhân vật công chúng. Lệnh tìm trên Wikipedia,
Wikimedia Commons và Openverse — cả ba đều khai rõ giấy phép.

**TUYỆT ĐỐI KHÔNG** tìm bằng từ tả cảnh chung chung: "school hallway", "mental
health", "hospital room", "students in classroom", "sad teenager". Kiểu đó chỉ
ra ảnh vu vơ của một nước khác, một vụ khác. Lệnh cũng đã chặn sẵn: khớp mỗi từ
tả cảnh chung chung là bị loại.

Ảnh kho tự do gần như không bao giờ chụp đúng vụ việc — nó chỉ là bối cảnh
(địa danh nơi xảy ra chuyện, trụ sở doanh nghiệp, sản phẩm được nhắc tới). Vì
vậy caption **phải mở đầu bằng `Ảnh minh hoạ:`**, rồi mới tới phần ghi công
phía sau. Khác với ảnh báo chí ở bước b — ảnh báo chí đúng vụ việc thật, không
cần tiền tố này.

### d) Không có gì đúng thì để trống

Bỏ trống ảnh, bài dùng nền `coverGradient` — đây là một lựa chọn ĐÚNG, không
phải thất bại. Thử vài cách rồi mới bỏ cuộc (2–3 nguồn cho b, vài từ khoá khác
nhau cho c), nhưng đừng hạ tiêu chuẩn xuống một tấm ảnh "cùng chủ đề" cho có.

## Gắn ảnh vào thân bài

Mỗi bài nên có ảnh bìa và 1–3 ảnh xen giữa các đoạn, đặt rải ra chứ đừng dồn
một chỗ. Ảnh trong thân bài luôn nằm trong `<figure>` kèm `<figcaption>` nếu có, và ưu tiên **mọi** ảnh (cả bìa lẫn trong thân) nằm trên kho S3 của chính toà
soạn. Url do `genz-news-fetch-image` trả về là hợp lệ nhất — tuy nhiên có thể tự dán URL ảnh của báo khác vào.

## Kết quả trả về cho bước viết bài

Sau khi xong, báo lại: đã dùng ảnh nào (nguồn b/c/không có), url kho, caption
đầy đủ, và có video nhúng hay không — để bước lưu bài (`genz-news-save-article`)
điền đúng `coverImage`, `coverImageCaption`, và các `<figure>` trong `body`.
