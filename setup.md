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
| Upload file lớn báo 413 | `client_max_body_size` của nginx nhỏ hơn giới hạn của app |
| Đọc dữ liệu được nhưng ghi báo `SQLITE_READONLY` | Chuỗi kết nối đưa `file:` vào driver; hoặc tệp `.db` do container migrate chạy bằng root tạo ra |
| SDK cloud báo `Could not load credentials` dù đã mount `~/.aws` | Thư mục khoá thuộc root quyền 600, container chạy uid khác nên không đọc được |
| Cả máy chủ mất SSH lẫn HTTP ngay sau khi build | Bước biên dịch giành hết CPU (không phải hết RAM — kiểm `journalctl -k` trước); xem mục L |

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

## L. Dựng ảnh ngay trên máy chủ dùng chung: nghẽn CPU, không phải hết RAM

Trên VPS nhỏ đang chạy sẵn nhiều dự án, `docker compose up -d --build` là lệnh
nguy hiểm nhất trong cả quy trình — nhưng thủ phạm thường bị đoán nhầm. Phản xạ
đầu tiên của ai cũng là "hết RAM". Phải đo rồi hãy kết luận.

Một lần thật, trên `t3.medium` (2 vCPU, 4 GB) đang chạy 5 dự án khác:

```
Mem:  total 3836 | used 3219 | free 118 | available 345 | Swap: 0
load average: 27.29, 64.89, 61.54          ← trên 2 nhân
journalctl -k: KHÔNG có dòng oom-killer nào
```

RAM căng thật, nhưng kernel **chưa hề** phải giết ai. Thứ chết là CPU: load 65
trên 2 nhân là gấp hơn 30 lần sức máy. Bước biên dịch (`tsc`, bundler, và
`npm ci` biên dịch native module bằng `g++`) sinh ra worker theo số nhân và ăn
sạch thời gian CPU. `sshd` với `nginx` không được cấp CPU để trả lời — nên
**cổng 22/80 vẫn bắt tay TCP được mà không tiến trình nào đáp**.

Trên máy burstable (`t2.*`, `t3.*`) còn nặng hơn: cạn CPU credit là bị bóp về
~20% baseline, một bản dựng 3 phút kéo thành 40 phút, và cả máy bò trong suốt
thời gian đó.

### Phân biệt hai bệnh trước khi chữa

```bash
uptime                                   # load / số nhân — nghẽn CPU?
free -m                                  # available còn bao nhiêu, có swap chưa
journalctl -k | grep -i oom-killer       # có dòng nào không? Không có = KHÔNG phải OOM
ps -eo pcpu,pmem,etimes,args --sort=-pcpu | head
```

Không có dòng OOM mà load cao ngất thì đừng thêm RAM, đừng reboot vội — reboot
giết luôn mọi dự án khác trên máy mà không chữa được nguyên nhân.

Ping không nói lên gì: security group của EC2 chặn ICMP mặc định.

### Cái bẫy lớn nhất: mỗi lần `git push` là một lần máy chủ tự biên dịch

Nếu `.gitlab-ci.yml` cho job deploy chạy `docker compose up -d --build` **trên
chính máy chủ**, thì đẩy 3 commit liên tiếp = 3 pipeline = 3 lần biên dịch lại
toàn bộ ứng dụng, xếp hàng chồng lên nhau. Sửa vài dòng tài liệu cũng đủ hạ cả
máy. Đây là cách tự bắn vào chân phổ biến nhất.

Trong lúc chưa đổi được kiến trúc CI: **gom thay đổi lại rồi push một lần**,
đừng push lắt nhắt.

### Ba cách xử lý, theo thứ tự nên chọn

**1. Dựng ảnh ở nơi khác, máy chủ chỉ kéo về.** Đây là cách đúng. Runner dựng
và đẩy lên registry (GitLab có registry sẵn cho mỗi repo), máy chủ chỉ
`pull` rồi `up -d`. Kéo ảnh gần như không tốn CPU.

Lưu ý: runner `shell` cài **ngay trên máy chủ** thì "dựng ở runner" vẫn là
dựng trên chính máy đó — không giải quyết gì. Muốn ăn thua thì runner phải nằm
ở máy khác (một VPS nhỏ riêng, hoặc runner dùng chung của GitLab).

```yaml
build:
  script:
    - docker build -t $CI_REGISTRY_IMAGE:$CI_COMMIT_SHA .
    - docker push $CI_REGISTRY_IMAGE:$CI_COMMIT_SHA
deploy:
  script:
    - docker compose pull && docker compose up -d
```

**2. Giới hạn CPU cho bản dựng.** Đừng bọc `nice` quanh `docker-compose` —
việc biên dịch chạy trong `dockerd`, không phải trong tiến trình client, nên
`nice` ở đó gần như vô tác dụng. Phải chặn ở chỗ thật sự làm việc:

```bash
# builder cổ điển: ghim bản dựng vào 1 nhân, chừa nhân kia cho dịch vụ
DOCKER_BUILDKIT=0 docker build --cpuset-cpus=0 -t myapp:new .
docker-compose up -d --no-build
```

**3. Thêm swap và chặn trần heap** — chốt chặn phụ, phòng khi RAM mới là vấn đề
thật ở dự án khác:

```bash
fallocate -l 4G /swapfile && chmod 600 /swapfile
mkswap /swapfile && swapon /swapfile
echo '/swapfile none swap sw 0 0' >> /etc/fstab
```

```dockerfile
FROM node:22-bookworm-slim AS build
ENV NODE_OPTIONS=--max-old-space-size=1536
RUN npm run build
```

### Nếu đã lỡ treo

Không cứu được từ xa: SSH chính là thứ đã chết. Phải vào console của nhà cung
cấp (EC2 → Instances → Reboot). Vì vậy giữ sẵn **quyền vào console** trước khi
deploy, đừng chỉ có mỗi khoá SSH. Reboot xong nhớ kiểm lại: job CI nào đang
chạy dở sẽ bị giết và pipeline báo failed — deploy lại từ đầu.
