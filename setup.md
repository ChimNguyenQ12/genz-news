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

---

Chi tiết riêng của Unveil (khôi phục, đưa dữ liệu bản cũ vào workspace, dọn bảng
đời đầu): [deploy/README.md](deploy/README.md).
