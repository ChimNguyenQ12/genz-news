#!/usr/bin/env bash
# Cổng ghi bài duy nhất cho phóng viên AI. Nhận JSON qua stdin.
#
#   echo '{"title":...}' | genz-news-save-article
#
# Vì sao phải có tệp bọc này thay vì cho Claude gọi thẳng "docker exec":
# danh sách công cụ cho phép của Claude chỉ trỏ đúng lệnh này, nên nó không
# mượn được quyền docker để làm việc khác. Một cửa, đóng hẹp.
set -uo pipefail

CONTAINER="${CONTAINER:-genz-news}"
ENV_FILE="${ENV_FILE:-/etc/genz-news/newsroom.env}"

[ -f "$ENV_FILE" ] || { echo "THIẾU $ENV_FILE" >&2; exit 1; }
# shellcheck disable=SC1090
. "$ENV_FILE"

exec docker exec -i \
  -e APP_URL=http://127.0.0.1:3000 \
  -e DATABASE_PATH=/app/data/app.db \
  -e NEWSROOM_USER="${NEWSROOM_USER:-}" \
  -e NEWSROOM_PASS="${NEWSROOM_PASS:-}" \
  -e NEWSROOM_REQUEST_ID="${NEWSROOM_REQUEST_ID:-}" \
  "$CONTAINER" node scripts/newsroom-save.mjs
