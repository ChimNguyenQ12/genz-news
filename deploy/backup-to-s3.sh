#!/usr/bin/env bash
# Sao lưu cơ sở dữ liệu SQLite lên S3, đã mã hoá.
#
#   sudo crontab -e
#   0 3 */3 * * /usr/local/bin/genz-news-backup.sh >> /var/log/genz-news-backup.log 2>&1
#
# 3 ngày một lần (các ngày 1, 4, 7, … trong tháng; cuối tháng có khi chỉ cách
# 1–2 ngày). Nghĩa là sự cố có thể mất tới 3 ngày bài mới.
#
# Mã hoá TRƯỚC khi đẩy đi: S3 chỉ nên nhìn thấy ciphertext.
set -euo pipefail

APP="${APP:-genz-news}"
DATA="${DATA:-/srv/${APP}/data}"
BUCKET="${BUCKET:-s3://${APP}}"
PREFIX="${PREFIX:-backup}"
PROFILE="${AWS_PROFILE:-s3-full-sandbox}"
PASSFILE="${PASSFILE:-/root/.${APP}_backup_pass}"

if [ ! -f "$PASSFILE" ]; then
  echo "Thiếu passphrase tại $PASSFILE. Tạo bằng:" >&2
  echo "  openssl rand -base64 48 | sudo tee $PASSFILE && sudo chmod 600 $PASSFILE" >&2
  exit 1
fi

STAMP="$(date +%Y%m%d-%H%M%S)"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

# .backup cho bản chụp nhất quán ngay cả khi app đang ghi — không copy tay.
sqlite3 "${DATA}/app.db" ".backup '${WORK}/app.db'"

# Kèm luôn khoá phiên: mất nó thì mọi người phải đăng nhập lại.
cp -f "${DATA}/session-secret" "${WORK}/session-secret" 2>/dev/null || true

tar czf "${WORK}/${APP}-${STAMP}.tgz" -C "$WORK" app.db session-secret 2>/dev/null \
  || tar czf "${WORK}/${APP}-${STAMP}.tgz" -C "$WORK" app.db

gpg --batch --yes --symmetric --cipher-algo AES256 \
    --passphrase-file "$PASSFILE" \
    -o "${WORK}/${APP}-${STAMP}.tgz.gpg" \
    "${WORK}/${APP}-${STAMP}.tgz"

aws s3 cp "${WORK}/${APP}-${STAMP}.tgz.gpg" \
    "${BUCKET}/${PREFIX}/${APP}-${STAMP}.tgz.gpg" --profile "$PROFILE"

echo "$(date -Iseconds) đã sao lưu ${APP}-${STAMP}.tgz.gpg"
