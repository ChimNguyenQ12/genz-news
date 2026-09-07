# Setup chuẩn: Docker + nginx + GitLab CI + sao lưu S3

Bản ghi lại thứ tự dựng một dự án lên VPS, viết để **dùng lại cho dự án khác**.
Unveil là ví dụ chạy xuyên suốt; chỗ nào thay được thì nằm trong bảng biến số ở
ngay dưới.

```
Internet ──443/HTTPS──> nginx trên host ──proxy──> 127.0.0.1:$PORT ──> Docker
                                                                        │
                                          /srv/$APP/data  ─bind mount───┘
                                                 │
                                    cron 3h sáng ─┴─> tar+gpg ──> S3
```

Ba nguyên tắc chi phối toàn bộ phần còn lại:

1. **Dữ liệu không nằm trong thư mục checkout.** Runner deploy có `git clean`
   sạch thư mục làm việc cũng không chạm tới được.
2. **App không mở ra Internet.** Chỉ nghe trên `127.0.0.1`, nginx đứng ngoài lo
   SSL. Không có cách nào gọi thẳng vào container.
3. **Deploy tay một lần trước, rồi mới giao cho CI.** Lần đầu luôn có gì đó
   thiếu; thấy lỗi trên terminal của mình dễ hơn là đọc log pipeline.

---

## Biến số theo dự án

| biến | Unveil | ghi chú |
|---|---|---|
| `$APP` | `unveil` | tên project compose, tên container, tên thư mục |
| `$DOMAIN` | `unveil.wtf` | đã trỏ A record về IP máy chủ |
| `$PORT` | `5005` | cổng trên loopback, nginx proxy vào |
| `$DATA` | `/srv/unveil/data` | thư mục dữ liệu, **ngoài** checkout |
| `$REPO` | `/srv/unveil/repo` | nơi clone tay lần đầu |
| `$TAG` | `unveil-deploy` | thẻ của GitLab runner |
| `$BUCKET` | `s3://unveil-backup` | bucket sao lưu |
| `$UID` | `1000` | uid của user chạy trong container |
| biến CI | `UNVEIL_SECRET`, `UNVEIL_GTRANSLATE_KEY` | Masked + Protected. Cả hai đều **không bắt buộc** — xem bên dưới |

Về biến CI, tách rõ hai loại ngay từ đầu, vì nó quyết định mức độ khẩn:

* **Bí mật app không thể tự sinh** (khoá API bên thứ ba, DSN cơ sở dữ liệu ngoài):
  thiếu là mất tính năng. Với Unveil là `UNVEIL_GTRANSLATE_KEY`.
* **Bí mật app tự lo được** (khoá ký phiên, salt): để trống thì app sinh một lần
  rồi cất vào chính CSDL của nó. Với Unveil là `UNVEIL_SECRET`. Chỉ đặt tay khi
  cần xoay khoá hoặc chạy nhiều instance không chung CSDL.

Cách tốt để thiết kế: mọi bí mật *nên* có đường lui tự sinh, trừ khoá của dịch
vụ bên ngoài — thì lần deploy đầu không bao giờ chết vì quên một biến.

---

## Bước 0 — cài gói trên máy chủ

```bash
sudo apt update
sudo apt install -y docker.io docker-compose-plugin \
                    nginx certbot python3-certbot-nginx \
                    curl sqlite3 awscli gnupg
sudo systemctl enable --now docker
```

`sqlite3` chỉ cần nếu dự án dùng SQLite (để sao lưu bằng `.backup`). `curl` cần
cho bước healthcheck trong CI.

---

## Bước 1 — thư mục dữ liệu, ĐÚNG QUYỀN

Đây là chỗ hỏng số một của lần chạy đầu, và nó hỏng theo kiểu khó đoán:
container cứ khởi động rồi chết, log chỉ nói "không ghi được".

```bash
sudo mkdir -p $DATA
sudo chown -R $UID:$UID $DATA
```

**Vì sao:** bind mount trỏ vào thư mục chưa tồn tại thì Docker tự tạo nó với
quyền `root:root`. Container chạy bằng user thường (`USER node`, uid 1000) nên
không ghi được. Tạo sẵn và `chown` trước là xong.

Kiểm uid thật của image nếu không chắc:

```bash
docker run --rm <image> id
```

---

## Bước 2 — deploy tay lần đầu

```bash
sudo mkdir -p $(dirname $REPO)
git clone <repo-url> $REPO && cd $REPO
docker compose up -d --build
docker compose logs -f            # Ctrl-C khi thấy dòng khởi động thành công
curl -fsS http://127.0.0.1:$PORT/api/health
```

Chưa qua được bước này thì **đừng** đụng tới CI: CI chỉ chạy đúng mấy lệnh trên,
lỗi ở đây thì lỗi ở đó y hệt, chỉ khó đọc hơn.

### Ghim tên project trong compose

```yaml
name: unveil          # ← dòng này
services:
  app:
    container_name: unveil
```

**Vì sao:** compose suy tên project từ **tên thư mục**. Deploy tay ở `$REPO` rồi
chuyển sang runner (thư mục `builds/<hash>/<group>/<project>`) là hai project
khác nhau; compose sẽ đòi tạo container tên `unveil` trong khi cái cũ còn đó và
báo `container name already in use`. Ghim tên lại thì đổi thư mục vô hại.

### Bind mount có đường lui cho máy local

```yaml
volumes:
  - ${APP_DATA_DIR:-/srv/unveil/data}:/app/data
```

Trên máy chủ để trống → dùng đường tuyệt đối. Ở máy nhà đặt `APP_DATA_DIR=./data`
trong `.env` → không bao giờ lỡ tay đụng dữ liệu thật.

### Đóng sạch khi nhận SIGTERM

`docker compose down` gửi SIGTERM. Nếu dự án dùng SQLite ở chế độ WAL thì dồn
nhật ký vào tệp chính trước khi thoát:

```js
for (const sig of ['SIGTERM', 'SIGINT']) {
  process.on(sig, () => {
    try { db.exec('PRAGMA wal_checkpoint(TRUNCATE)'); db.close(); } catch (_) {}
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 3000).unref();
  });
}
```

**Vì sao:** không làm thì cạnh `app.db` luôn có `app.db-wal` cỡ vài chục MB. Ai
đó rsync thư mục data sang máy khác mà quên tệp `-wal` là mất phần dữ liệu mới
nhất, và mất im lặng — CSDL vẫn mở được, chỉ thiếu.

---

## Bước 3 — nginx + SSL

```bash
sudo ./deploy/setup-nginx.sh $DOMAIN
```

Script ghi server block cổng 80 rồi để `certbot --nginx` chèn phần SSL và block
chuyển hướng. Chạy lại nhiều lần vô hại, cấu hình cũ được sao lưu trước.

Không có script sẵn thì làm tay:

```bash
sudo certbot --nginx -d $DOMAIN --redirect --agree-tos --no-eff-email -m you@example.com
sudo certbot renew --dry-run          # kiểm gia hạn tự động
```

HTTPS không phải cho đẹp: nhiều API trình duyệt (clipboard, Web Speech,
Notification, service worker) chỉ chạy trong secure context.

---

## Bước 4 — GitLab runner

**Một runner là đủ.** Đăng ký kiểu `shell`, gắn thẻ, rồi cho nó dùng Docker:

```bash
sudo gitlab-runner register --executor shell --tag-list $TAG \
  --non-interactive --url https://gitlab.com/ --registration-token <token>
sudo usermod -aG docker gitlab-runner
sudo systemctl restart gitlab-runner
```

Biến ở **Settings → CI/CD → Variables**, đánh dấu *Masked* và *Protected*.

### Khung `.gitlab-ci.yml`

```yaml
variables:
  GIT_CLEAN_FLAGS: "-ffd"        # KHÔNG phải -ffdx

stages: [test, deploy]

test:
  stage: test
  tags: [unveil-deploy]          # cùng thẻ với deploy
  rules:
    - if: '$CI_PIPELINE_SOURCE == "merge_request_event"'
    - if: '$CI_COMMIT_BRANCH == "main"'
  script:
    - docker run --rm -v "$CI_PROJECT_DIR":/app -w /app node:22-alpine node tools/selftest.js

deploy:
  stage: deploy
  tags: [unveil-deploy]
  rules:
    - if: '$CI_COMMIT_BRANCH == "main"'
  script:
    - printf 'UNVEIL_SECRET=%s\n' "$UNVEIL_SECRET" > .env
    - docker compose up -d --build --remove-orphans
    - docker image prune -f
    - |
      for i in $(seq 1 30); do
        curl -fsS http://127.0.0.1:5005/api/health > /dev/null && exit 0
        sleep 1
      done
      docker compose logs --tail=80; exit 1
```

Năm chỗ đáng nhớ:

| | |
|---|---|
| **Mọi job dùng chung một thẻ** | Job mang thẻ mà không runner nào nhận thì nằm chờ mãi. Các stage chạy tuần tự, nên `test` treo là `deploy` **không bao giờ tới lượt** — pipeline đứng im, dễ tưởng CI hỏng. Cần Node/Python bản khác thì `docker run` ngay trên runner shell, đừng đòi runner thứ hai. |
| `GIT_CLEAN_FLAGS: "-ffd"` | `-ffdx` sẽ xoá cả tệp bị gitignore. Đây là lớp bảo vệ thứ hai; lớp thứ nhất là dữ liệu không nằm trong checkout. |
| **Chờ healthcheck** | Không chờ thì `docker compose up` trả về 0 ngay cả khi app chết sau đó hai giây, và pipeline báo xanh trong lúc site đang 502. |
| **Bí mật ghi ra `.env`** | `docker compose` tự đọc `.env` cạnh nó; `.env` phải nằm trong `.gitignore`. Biến rỗng cũng không sao nếu app có đường lui. |
| **Protected ⇒ nhánh cũng phải protected** | Biến đánh dấu *Protected* chỉ được đưa vào job chạy trên nhánh/tag **protected**. Nhánh deploy chưa được đặt protected thì biến ra rỗng và **không có lỗi nào cả** — pipeline xanh, app chạy, chỉ là thiếu mất tính năng phụ thuộc biến đó. Hoặc đặt nhánh thành protected (Settings → Repository → Protected branches), hoặc bỏ tick Protected. |

---

## Bước 5 — sao lưu S3

### Bucket

```bash
aws s3 mb $BUCKET
```

Rồi bật trong console: **Block Public Access** BẬT, **Versioning** BẬT, thêm một
lifecycle rule chuyển sang Glacier hoặc xoá bản cũ hơn 90 ngày.

### Quyền — chỉ ghi, không đọc, không xoá

IAM role gắn vào EC2 (đừng để access key trên đĩa):

```json
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Action": "s3:PutObject",
    "Resource": "arn:aws:s3:::unveil-backup/unveil/*"
  }]
}
```

**Vì sao chỉ `PutObject`:** máy chủ bị chiếm thì kẻ tấn công cũng không đọc được
bản sao lưu cũ, và không xoá được chúng đi trước khi tống tiền. Khôi phục thì
dùng máy khác với quyền riêng.

### Passphrase

```bash
openssl rand -base64 48 | sudo tee /root/.unveil_backup_pass
sudo chmod 600 /root/.unveil_backup_pass
```

**Chép một bản ra NGOÀI máy chủ** (trình quản lý mật khẩu). Máy chủ chết mà
passphrase chỉ nằm trên chính nó thì bản sao lưu thành một khối rác.

### Cron

```bash
sudo crontab -e
# 0 3 * * * /srv/unveil/repo/deploy/backup-to-s3.sh >> /var/log/unveil-backup.log 2>&1
```

Script làm: chụp CSDL bằng `sqlite3 .backup` (nhất quán khi app vẫn đang ghi) →
tar → gzip → `gpg --symmetric --cipher-algo AES256` → `aws s3 cp`. Mã hoá **trước
khi** đẩy đi, vì S3 chỉ nên nhìn thấy ciphertext.

### Diễn thử khôi phục — làm ngay, đừng để dành

```bash
aws s3 cp $BUCKET/unveil/unveil-NGAY.tgz.gpg .
gpg --batch --passphrase-file /root/.unveil_backup_pass -d unveil-NGAY.tgz.gpg \
  | tar xzf - -C /tmp/restore
ls -la /tmp/restore
```

**Bản sao lưu chưa từng khôi phục thử không phải là bản sao lưu.** Diễn một lần
vào thư mục tạm ngay sau khi dựng xong, rồi mới yên tâm.

---

## Kiểm lại trước khi coi là xong

- [ ] `$DATA` tồn tại, `chown $UID:$UID`, và **nằm ngoài** thư mục checkout
- [ ] `docker compose config` phân giải đúng đường mount ở cả hai trường hợp có
      và không có `.env`
- [ ] `name:` đã ghim trong `docker-compose.yml`
- [ ] `.gitignore` có `data/` và `.env`
- [ ] `curl -fsS https://$DOMAIN/api/health` trả về 200 (HTTPS, không phải HTTP)
- [ ] `sudo certbot renew --dry-run` sạch
- [ ] Pipeline chạy hết cả hai stage — không job nào kẹt ở *pending*
- [ ] Sửa một chữ, push lên `main`, thấy nó lên site
- [ ] `docker compose down && docker compose up -d` → dữ liệu còn nguyên
- [ ] Cron đã chạy ít nhất một đêm, `aws s3 ls $BUCKET/` có tệp
- [ ] Đã giải thử một bản sao lưu ra thư mục tạm
- [ ] Passphrase sao lưu có một bản cất ngoài máy chủ

---

## Vài chỗ khác cũng hay vấp

| triệu chứng | nguyên nhân |
|---|---|
| Container khởi động rồi chết ngay, log nói không ghi được | Bước 1: thư mục data thuộc `root` |
| `container name already in use` | Chưa ghim `name:` trong compose, deploy từ hai thư mục khác nhau |
| Pipeline nằm im ở *pending* | Job mang thẻ mà không runner nào nhận |
| Deploy xanh nhưng site 502 | Không chờ healthcheck, app chết sau khi compose trả về |
| Dữ liệu biến mất sau một lần deploy | `GIT_CLEAN_FLAGS: -ffdx`, hoặc data nằm trong checkout |
| Rsync data sang máy khác, thiếu bản ghi mới nhất | Quên tệp `-wal`; thêm checkpoint lúc SIGTERM |
| `gitlab-runner` báo permission denied khi gọi docker | Quên `usermod -aG docker gitlab-runner` + restart |
| Clipboard / phát âm / thông báo không chạy | Đang vào bằng HTTP, không phải HTTPS |
| Deploy xanh nhưng một tính năng cứ như chưa cấu hình | Biến CI đánh dấu *Protected* mà nhánh deploy chưa protected → biến rỗng, im lặng |
| `docker-entrypoint.sh: no such file or directory` dù tệp có thật | Script commit bằng CRLF; thiếu `.gitattributes` ép `eol=lf` |
| `docker compose: unknown command` trên máy chủ | Máy chỉ có binary `docker-compose` (v2 standalone), không có plugin |
| Job lint ở CI đỏ mà máy nhà xanh | Kiểu do framework sinh lúc build nằm trong .gitignore nên CI không có; xem mục M |
| Upload file lớn báo 413 | `client_max_body_size` của nginx nhỏ hơn giới hạn của app |
| Đọc dữ liệu được nhưng ghi báo `SQLITE_READONLY` | Chuỗi kết nối đưa `file:` vào driver; hoặc tệp `.db` do container migrate chạy bằng root tạo ra |
| SDK cloud báo `Could not load credentials` dù đã mount `~/.aws` | Thư mục khoá thuộc root quyền 600, container chạy uid khác nên không đọc được |
| Cả máy chủ mất SSH lẫn HTTP ngay sau khi build | Hết bộ nhớ trên máy KHÔNG swap. Đo `/proc/pressure/memory`, đừng tin việc thiếu dòng oom-killer; xem mục L |

---

# Phần bổ sung — những chỗ bản gốc chưa chạm tới

Ghi lại từ lần dựng một dự án Next.js + Prisma. Vẫn viết theo kiểu chung để
dùng lại; ví dụ đặt trong ngoặc.

## A. Kết thúc dòng: ép LF cho mọi tệp Linux phải chạy

Máy phát triển chạy Windows thì Git mặc định `core.autocrlf=true`: tệp được
commit với CRLF. Trên Linux, `#!/bin/sh\r` là một trình thông dịch **không tồn
tại**, và thông báo lỗi lại chỉ vào tên tệp — dễ tưởng thiếu tệp.

Thêm `.gitattributes` **trước** lần commit đầu:

```gitattributes
*.sh        text eol=lf
Dockerfile  text eol=lf
*.yml       text eol=lf
*.yaml      text eol=lf
```

Đã lỡ commit rồi thì chuẩn hoá lại rồi kiểm tra:

```bash
git add --renormalize .
git ls-files --eol <tệp.sh>      # phải thấy i/lf
```

## B. Kiểm phiên bản compose trên máy chủ trước khi viết CI

Hai thứ khác nhau và không thay thế nhau về mặt lệnh gọi:

| | lệnh | nguồn |
|---|---|---|
| plugin v2 | `docker compose` | gói `docker-compose-plugin` |
| binary v2 | `docker-compose` | tải rời về `/usr/local/bin` |

Máy chủ có thể chỉ có một trong hai. Kiểm trước, rồi viết đúng lệnh đó vào CI:

```bash
docker compose version || docker-compose --version
```

Viết nhầm thì job deploy chết ngay dòng đầu, trong khi build đã tốn vài phút.

## C. Chọn cơ sở dữ liệu: mặc định là SQLite

Trang nội dung một máy chủ, ghi ít (chỉ biên tập viên ghi, độc giả chỉ đọc) thì
SQLite là lựa chọn đúng, không phải lựa chọn tạm. Nó bỏ được một container, một
tiến trình, một chuỗi kết nối và một lớp cần sao lưu riêng — sao lưu trở thành
copy một tệp trong `$DATA`.

Chỉ đổi sang Postgres/MySQL khi có **lý do cụ thể**: nhiều instance ghi song
song, cần replica đọc, cần kiểu dữ liệu riêng (JSONB, PostGIS), hoặc dùng dịch
vụ quản lý sẵn.

Nếu dùng ORM, biết trước hai chỗ SQLite không có:

* **Không có kiểu mảng** — lưu chuỗi JSON, quy đổi ở tầng truy cập dữ liệu.
* **Không có enum** — lưu chuỗi, chặn giá trị sai ở tầng API.

Chuyển engine giữa chừng thì làm theo thứ tự này, đừng sửa schema trước:

```bash
node scripts/export-db.mjs     # xuất ra JSON khi DB cũ CÒN chạy
# sửa provider trong schema, xoá thư mục migrations cũ
npx prisma migrate dev --name init
node scripts/import-db.mjs     # nạp lại
```

Hash mật khẩu là chuỗi nên đi qua được; người dùng không phải đặt lại mật khẩu.

## D. ORM đời mới tách cấu hình ra khỏi schema

Prisma từ v7 **không nhận `url` trong `datasource`** nữa. Chuỗi kết nối chuyển
sang `prisma.config.ts`, và client phải được truyền một *driver adapter*:

```ts
// prisma.config.ts — cho CLI (migrate, studio)
export default defineConfig({
  schema: "prisma/schema.prisma",
  datasource: { url: `file:${dbPath}` },
});

// lib/prisma.ts — cho app
new PrismaClient({ adapter: new PrismaBetterSqlite3({ url: `file:${dbPath}` }) });
```

Hai chỗ này phải trỏ **cùng một tệp**, nếu không `migrate` tạo bảng ở một nơi
còn app đọc ở nơi khác, và lỗi hiện ra là "không tìm thấy bảng".

**Định dạng chuỗi kết nối của CLI và của driver có thể khác nhau.** Với SQLite,
Prisma CLI cần `file:/duong/dan.db`, còn `better-sqlite3` cần **đường dẫn
thuần** `/duong/dan.db`. Đưa nhầm `file:` vào driver thì nó vẫn **mở được để
đọc** — app chạy, danh sách hiện đủ — nhưng mọi lệnh ghi báo
`SQLITE_READONLY: attempt to write a readonly database`. Rất dễ đổ oan cho
quyền tệp và mất hàng giờ `chown`.

Cách khoanh vùng nhanh, chạy ngay trong container:

```bash
docker exec <container> node -e '
const DB = require("better-sqlite3");
for (const p of ["/app/data/app.db", "file:/app/data/app.db"]) {
  try { const db=new DB(p); db.exec("CREATE TABLE IF NOT EXISTS _p(x)");
        db.exec("DROP TABLE _p"); console.log("GHI OK  :", p); db.close(); }
  catch (e) { console.log("GHI HỎNG:", p, e.message); }
}'
```

Đọc được mà ghi không được thì nghi chuỗi kết nối **trước**, đừng nghi quyền.

Vài cái bẫy liên quan:

* Tên class adapter không theo quy ước hoa/thường dễ đoán. Đọc `index.d.ts`
  trong gói thay vì đoán.
* Đổi schema xong phải chạy `prisma generate` **và khởi động lại dev server** —
  server đang chạy vẫn giữ client cũ trong bộ nhớ, báo lỗi kiểu "unknown
  argument" cho trường vốn vẫn đúng.
* `npm install <orm>` có thể kéo về bản RC nếu tag `latest` đang trỏ vào đó.
  Ghim major rõ ràng (`npm i prisma@7`) và kiểm lại bằng `npx prisma --version`.
* CLI của ORM thường kéo theo driver của **mọi** engine (kể cả engine không
  dùng) — đó là nơi `npm audit` báo lỗ hổng. Để CLI trong `devDependencies` rồi
  soát bằng `npm audit --omit=dev`; con số đó mới là thứ chạy trên production.

## E. Docker cho Next.js: standalone + migrate lúc khởi động

Bật `output: "standalone"` trong `next.config.ts`, rồi image runtime chỉ cần:

```dockerfile
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
COPY --from=build /app/public ./public
```

Ba điểm hay quên:

1. **Module native** (`better-sqlite3`, `sharp`) cần `python3 make g++` ở tầng
   cài phụ thuộc. Image `-slim` không có sẵn.
2. **Migration chạy ở service riêng, không nhét vào entrypoint.** CLI của ORM
   kéo theo cây phụ thuộc riêng mà bản standalone không gói; copy mỗi thư mục
   CLI vào image runtime sẽ chết ở `MODULE_NOT_FOUND` cho một gói bạn chưa từng
   nghe tên, và container vào vòng lặp khởi động lại.

   Cách gọn: thêm một tầng dựng từ chính tầng build (nơi `node_modules` còn
   đủ), rồi cho app đợi nó chạy xong.

   ```dockerfile
   FROM build AS migrator
   CMD ["npx", "prisma", "migrate", "deploy"]
   ```
   ```yaml
   services:
     migrate:
       build: { context: ., target: migrator }
       restart: "no"
       volumes: [ "$DATA:/app/data" ]
     app:
       build: { context: ., target: runner }
       depends_on:
         migrate:
           condition: service_completed_successfully
   ```

   Được hai thứ: image runtime vẫn nhỏ, và app **không bao giờ** khởi động trên
   schema cũ — migrate hỏng thì app không lên, thấy ngay thay vì lỗi mơ hồ lúc
   chạy.
3. **`HEALTHCHECK` trong Dockerfile** cần `curl` — image `-slim` cũng không có.

## F. Endpoint sức khoẻ phải chạm vào cơ sở dữ liệu

Trả về `{ok:true}` cứng thì nó chỉ chứng minh tiến trình Node còn sống. Cho nó
đếm một bảng:

```ts
const n = await prisma.article.count();
return Response.json({ ok: true, articles: n });
```

Khác biệt thật: DB hỏng quyền ghi, hoặc bind mount trỏ sai chỗ, thì bản cứng
vẫn xanh còn bản này đỏ ngay — đúng lúc CI còn đang chờ.

## G. Bí mật: tự sinh rồi cất vào thư mục dữ liệu

Bản gốc nói "nên có đường lui tự sinh". Cụ thể hoá:

```ts
const file = path.join(DATA_DIR, "session-secret");
try { return fs.readFileSync(file, "utf8").trim(); } catch {}
const generated = crypto.randomBytes(48).toString("hex");
fs.writeFileSync(file, generated, { mode: 0o600 });
```

Vì `$DATA` là bind mount nằm ngoài checkout, khoá sống qua mọi lần deploy mà
không cần biến CI nào. Muốn xoay khoá thì xoá tệp và khởi động lại.

**Đừng để khoá mặc định ghi cứng trong mã.** Mã nguồn công khai thì khoá đó công
khai theo, và mọi phiên đăng nhập giả mạo được.

## H. Lưu tệp người dùng tải lên: S3 chứ không phải đĩa container

Ghi vào `public/uploads` thì mất khi container dựng lại, trừ phi mount thêm.
Đẩy thẳng lên object storage:

```ts
await s3.send(new PutObjectCommand({
  Bucket, Key: `uploads/${year}/${month}/${randomUUID()}.${ext}`,
  Body: buffer, ContentType: mime,
  CacheControl: "public, max-age=31536000, immutable",
}));
```

* Tên tệp do **server sinh** (UUID). Tên client gửi lên không bao giờ được dùng
  làm đường dẫn.
* Kiểm **magic bytes**, không tin phần mở rộng hay `Content-Type` client khai.
* Đặt `client_max_body_size` của nginx **lớn hơn** giới hạn của app, nếu không
  người dùng nhận 413 từ nginx trước khi app kịp báo lỗi tử tế.
* Cách xác thực tốt nhất là **IAM role gắn vào EC2**. Nếu buộc phải dùng access
  key trong `~/.aws`, mount chỉ đọc và đúng chỗ user trong container tìm:
  ```yaml
  volumes:
    - /root/.aws:/home/node/.aws:ro
  environment:
    AWS_PROFILE: <profile>
    AWS_SDK_LOAD_CONFIG: "1"
  ```

## I. Đăng ký runner trước, đừng để tới lúc push

Runner tồn tại trong GitLab UI **không** có nghĩa là nó đã đăng ký trên máy
chủ. Kiểm bằng:

```bash
gitlab-runner list        # phải thấy đúng thẻ dự án
```

Không có thì pipeline nằm im ở *pending*, không báo lỗi gì. Đăng ký:

```bash
sudo gitlab-runner register --executor shell --tag-list $TAG \
  --non-interactive --url https://gitlab.com/ --token <token>
sudo usermod -aG docker gitlab-runner && sudo systemctl restart gitlab-runner
```

## J. DNS phải trỏ đúng TRƯỚC khi gọi certbot

Certbot xác thực bằng HTTP-01: nó đặt tệp vào `/var/www/html/.well-known/` rồi
Let's Encrypt gọi vào `http://$DOMAIN/.well-known/...`. Muốn qua được thì tên
miền phải phân giải **về đúng IP máy chủ này**.

Kiểm trước, đừng chạy certbot rồi mới đọc lỗi:

```bash
dig +short A $DOMAIN          # phải ra IP máy chủ
dig +short A www.$DOMAIN
curl -s ifconfig.me           # so sánh
```

Hai kiểu hỏng hay gặp:

* **Apex không có A record.** Nhiều người chỉ thêm `www` rồi tưởng xong. Cần cả
  hai bản ghi, hoặc apex A + `www` CNAME về apex.
* **Đang qua CDN/proxy** (Cloudflare đám mây cam). `dig` sẽ ra IP của CDN chứ
  không phải máy chủ, và HTTP-01 đi vào CDN. Cách gọn nhất: **tắt proxy (đám
  mây xám) cho tới khi xin xong chứng chỉ**, rồi bật lại. Hoặc dùng DNS-01 với
  plugin của nhà cung cấp.

Chưa trỏ DNS thì vẫn dựng được server block cổng 80 và kiểm app qua IP:

```bash
curl -H 'Host: $DOMAIN' http://127.0.0.1/api/health
```

Xong DNS thì chỉ còn một lệnh certbot là site lên HTTPS.

## K. Chọn cổng: kiểm trước khi đặt

```bash
ss -tlnp | grep -E '50[0-9][0-9]'
docker ps --format '{{.Names}}\t{{.Ports}}'
```

Trên máy nhiều dự án, cổng tiếp theo còn trống không chắc là cổng tiếp theo
theo số. Và luôn bind `127.0.0.1:<port>` — thấy `0.0.0.0:<port>` ở dự án nào là
dự án đó đang phơi thẳng ra Internet, bỏ qua nginx.

## L. Máy chủ treo khi dựng ảnh: đo PSI trước, đừng đoán

Trên VPS nhỏ đang chạy sẵn nhiều dự án, `docker compose up -d --build` là lệnh
nguy hiểm nhất trong cả quy trình. Nhưng thủ phạm rất dễ đoán nhầm — tôi đã
đoán nhầm hai lần trên cùng một máy trước khi chịu đo.

Hiện tượng: cổng 22 và 80 vẫn **bắt tay TCP được** (kernel còn sống, còn nghe)
nhưng `sshd` và `nginx` không tiến trình nào trả lời. Ping không nói lên gì:
security group của EC2 chặn ICMP mặc định.

### Đoán sai lần 1: "hết RAM, OOM killer giết mất dịch vụ"

`journalctl -k | grep -i oom-killer` không có một dòng nào. Kết luận vội là
"vậy không phải RAM" — và khuyên reboot. Reboot không chữa gì, lại làm chết
những container của dự án khác không có `restart: unless-stopped`.

### Đoán sai lần 2: "nghẽn CPU"

`load average: 27.29, 64.89, 61.54` trên 2 nhân, `us=91 sy=9 id=0`. Trông rất
giống nghẽn CPU. Nhưng load cao là **hậu quả**, không phải nguyên nhân — hàng
đợi dài vì mọi tiến trình đang kẹt chờ thứ khác.

Có nghi máy burstable bị bóp (`t2.*`, `t3.*` cạn CPU credit) thì đo `st` trong
`vmstat`. Ở đây `st=0`: nhà cung cấp không hề bóp. Loại giả thuyết đó.

### Đo đúng: PSI trả lời thẳng máy đang tắc ở đâu

```bash
for f in cpu memory io; do echo "$f: $(cat /proc/pressure/$f)"; done
```

Số thật lấy được lúc máy đang treo:

```
memory   full avg300=57.16     ← 57% thời gian MỌI tiến trình đứng im
io       full avg300=44.33
cpu      full avg300=0.00      ← CPU chưa bao giờ là thứ chặn
```

`full` nghĩa là **không một tiến trình nào chạy được**. CPU `full=0` đóng đinh
rằng CPU vô can. Thủ phạm là bộ nhớ.

### Vì sao hết RAM mà OOM killer không chạy

Đây là chỗ phản trực giác nhất, và là lý do lần đoán 1 bị loại oan.

Máy **không có swap**. Khi thiếu bộ nhớ, kernel không đẩy được dữ liệu ra swap,
nên thứ duy nhất nó thu hồi được là bộ nhớ đệm — **kể cả trang mã lệnh của
chính các chương trình đang chạy**. Nó đuổi mã của `sshd`, `nginx`, `node` ra
khỏi RAM, rồi ngay lệnh kế tiếp lại phải đọc ngược từ đĩa:

```
pgmajfault      9.136.049      ← 9 triệu lần phải đọc lại trang từ đĩa
pgscan_kswapd 411.569.503
pgsteal_kswapd 101.900.674     ← quét 411 triệu trang để thu hồi 101 triệu
pswpin / pswpout        0      ← không có swap để mà dùng
```

Vòng lặp đó **không bao giờ chạm ngưỡng OOM**, vì lúc nào cũng còn bộ nhớ đệm
để vứt. Kernel không giết ai cả — nó chỉ thoi thóp mãi. Nên **"không có dòng
oom-killer" KHÔNG chứng minh được là đủ RAM**, đặc biệt trên máy không swap.

### Chữa: thêm swap

```bash
fallocate -l 4G /swapfile && chmod 600 /swapfile
mkswap /swapfile && swapon /swapfile
echo '/swapfile none swap sw 0 0' >> /etc/fstab   # giữ sau khi reboot
sysctl -w vm.swappiness=10                        # chỉ dùng khi thật cần
```

Swap không làm máy nhanh hơn. Nó biến "cả máy đứng hình 50 phút" thành "bản
dựng chậm hơn một chút". Kết quả đo ngay sau khi bật, trong lúc một bản dựng
khác đang chạy:

```
Swap: đang dùng 948 MB        ← đúng phần trước đây gây thrash
load: 4.03 (1 phút)  ↓ từ 34.73 (15 phút)
ssh vào bình thường trong khi vẫn đang build
```

### Cái bẫy lớn nhất: mỗi lần `git push` là một lần máy chủ tự biên dịch

Nếu `.gitlab-ci.yml` cho job deploy chạy `docker compose up -d --build` **trên
chính máy chủ**, thì đẩy 3 commit liên tiếp = 3 pipeline = 3 lần biên dịch lại
toàn bộ ứng dụng, xếp hàng chồng lên nhau. Sửa vài dòng tài liệu cũng đủ hạ cả
máy. Đây là cách tự bắn vào chân phổ biến nhất.

Trong lúc chưa đổi được kiến trúc CI: **gom thay đổi lại rồi push một lần**,
đừng push lắt nhắt.

### Ngoài swap, hãy giảm hẳn SỐ LẦN phải dựng

Swap chữa triệu chứng. Cách bền hơn là đừng dựng nhiều đến thế.

**1. Chỉ dựng lại khi mã ứng dụng thật sự đổi.** Đây là thứ đáng làm nhất và
gần như miễn phí. Sửa một script chạy trên host hay một dòng tài liệu mà cũng
kích một bản dựng đầy đủ là lãng phí thuần tuý:

```yaml
deploy:
  rules:
    - if: '$CI_COMMIT_BRANCH == "main"'
      changes:
        - app/**/*
        - lib/**/*
        - package.json
        - package-lock.json
        - Dockerfile
```

Trong một ngày làm việc thật, cách này cắt được 4 trên 6 bản dựng.

**2. Gom thay đổi rồi push một lần.** Đẩy 3 commit liên tiếp là 3 pipeline xếp
hàng chồng lên nhau. Đây là kiểu tự bắn vào chân phổ biến nhất.

**3. Dựng ảnh ở máy khác, máy chủ chỉ kéo về.** Đúng về kiến trúc nhưng tốn
tiền: runner `shell` cài **ngay trên máy chủ** thì "dựng ở runner" vẫn là dựng
trên chính máy đó. Muốn ăn thua phải có máy riêng để dựng.

```yaml
build:
  script:
    - docker build -t $CI_REGISTRY_IMAGE:$CI_COMMIT_SHA .
    - docker push $CI_REGISTRY_IMAGE:$CI_COMMIT_SHA
deploy:
  script:
    - docker compose pull && docker compose up -d
```

**4. Chặn trần heap** — chốt chặn phụ, để nếu vẫn vỡ thì vỡ *bên trong* bản
dựng chứ không lôi cả máy xuống:

```dockerfile
ENV NODE_OPTIONS=--max-old-space-size=1536
```

Đừng bọc `nice` quanh `docker compose`: việc biên dịch chạy trong `dockerd`,
không phải trong tiến trình client, nên `nice` ở đó vô tác dụng.

### Nếu đã lỡ treo

**Đừng reboot vội.** Máy thoi thóp vì thu hồi bộ nhớ thì thường tự bò ra sau
vài chục phút, còn reboot thì giết luôn mọi container của dự án khác **không**
có `restart: unless-stopped` — và chúng sẽ không tự lên lại. Tôi đã khuyên
reboot một lần dựa trên chẩn đoán sai, và làm sập một dự án chẳng liên quan.

Kiểm trước khi quyết:

```bash
docker ps -a --filter status=exited --format '{{.Names}}'
for c in $(docker ps -aq); do
  echo "$(docker inspect -f '{{.Name}} {{.HostConfig.RestartPolicy.Name}}' $c)"
done
```

Cái nào `no` mà đang chạy thì reboot là mất. Và giữ sẵn **quyền vào console**
của nhà cung cấp trước khi deploy, đừng chỉ có mỗi khoá SSH — nếu thật sự phải
reboot thì SSH chính là thứ đã chết.

Reboot xong nhớ kiểm lại: job CI nào đang chạy dở sẽ bị giết và pipeline báo
failed — deploy lại từ đầu.

## M. Job lint ở CI đỏ dù máy nhà xanh: kiểu do framework tự sinh

Các framework đời mới sinh tệp khai báo kiểu lúc build rồi để trong thư mục
tạm (`.next/`, `.nuxt/`, `.svelte-kit/`) — và thư mục đó nằm trong
`.gitignore`. Nghĩa là **máy nhà có, CI không có**. Job chỉ chạy `tsc --noEmit`
mà không build trước sẽ đỏ ngay ở chỗ dùng kiểu toàn cục ấy:

```
app/layout.tsx(47,50): error TS2304: Cannot find name 'LayoutProps'.
```

Máy nhà xanh chỉ vì còn thư mục build cũ từ lần chạy trước. Muốn tái hiện thì
dọn đúng những thứ CI không có rồi hãy chạy — làm việc này trước khi đổ lỗi cho
runner:

```bash
mv .next /tmp/ && mv next-env.d.ts /tmp/
npx tsc --noEmit
```

Ba cách chữa, nên chọn cách đầu:

1. **Khai báo kiểu tường minh** tại chỗ dùng, đừng dựa vào kiểu toàn cục do
   build sinh ra. Ví dụ thay `LayoutProps<"/">` bằng
   `Readonly<{ children: ReactNode }>`. CI không phải làm gì thêm.
2. Chạy lệnh sinh kiểu trước khi kiểm (`next typegen`) — nhanh hơn build đủ.
3. Build đủ rồi mới `tsc` — chậm nhất, và trên máy chủ yếu thì đụng đúng vấn đề
   ở mục L.

## N. Bit thực thi của script phải nằm trong git

Script `deploy/*.sh` commit ở chế độ `100644` sẽ chạy được trên máy nhà (vì
bạn `chmod +x` một lần) rồi hỏng trên máy chủ, với thông báo khó lần:

```
exec: /srv/app/repo/deploy/run.sh: cannot execute: Permission denied
```

`ls -l` lại hiện `-rwxr-xr-x`, nên rất dễ tưởng là chuyện khác. Bẫy nằm ở chỗ:
mỗi lần deploy chạy `git reset --hard`, git **đặt lại chế độ tệp theo đúng thứ
đã commit** — tức xoá sạch bit thực thi vừa `chmod`. Nó chạy được ngay sau khi
bạn chmod, rồi tự hỏng ở lượt sau.

Kiểm và sửa:

```bash
git ls-files -s deploy/          # thấy 100644 là sai
git update-index --chmod=+x deploy/*.sh
git commit -m "ghi bit thực thi vào git"
```

Cùng họ với bẫy CRLF ở mục A: cả hai đều là **thuộc tính tệp không được commit**,
và cả hai đều chỉ lộ ra trên máy chủ.
