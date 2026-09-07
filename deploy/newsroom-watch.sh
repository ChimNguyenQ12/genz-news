#!/usr/bin/env bash
# Canh "hộp thư" mà app thả yêu cầu viết bài vào, rồi gọi toà soạn tự động.
#
#   crontab -e
#   * * * * * /usr/local/bin/genz-news-watch.sh >> /var/log/genz-news-newsroom.log 2>&1
#
# Vì sao phải qua tệp: app chạy trong container, còn "claude" chạy trên host.
# Container không gọi được lệnh của host, nhưng hai bên dùng chung thư mục dữ
# liệu (bind mount), nên thư mục đó làm hộp thư là gọn nhất — không mở thêm
# cổng, không cấp thêm quyền cho container.
set -uo pipefail

INBOX="${INBOX:-/srv/genz-news/data/newsroom-requests}"
LOCK="${LOCK:-/var/lock/genz-news-newsroom.lock}"
RUNNER="${RUNNER:-/usr/local/bin/genz-news-newsroom.sh}"

log() { echo "$(date -Iseconds) [watch] $*"; }

[ -d "$INBOX" ] || exit 0
ls -A "$INBOX" >/dev/null 2>&1 || exit 0

# Một lượt viết mất vài phút, mà cron gõ cửa mỗi phút. Không có khoá thì các
# lượt chồng lên nhau và bóp chết máy chủ.
exec 9>"$LOCK"
flock -n 9 || exit 0

for f in "$INBOX"/*; do
  [ -e "$f" ] || continue
  id="$(basename "$f")"

  # Tên tệp do app đặt, nhưng vẫn kiểm: chỉ nhận đúng dạng uuid, vì cái tên này
  # đi thẳng vào dòng lệnh.
  case "$id" in
    [0-9a-f]*-[0-9a-f]*-[0-9a-f]*-[0-9a-f]*-[0-9a-f]*) ;;
    *) log "bỏ tên tệp lạ: $id"; rm -f "$f"; continue ;;
  esac

  # Xoá TRƯỚC khi chạy: nếu lượt này hỏng thì cũng đừng thử lại vô hạn.
  rm -f "$f"
  log "nhận yêu cầu từ /admin/research: $id"
  "$RUNNER" "$id"
  log "xong $id"
done
