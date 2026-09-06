#!/usr/bin/env bash
# Cổng ghi bài duy nhất cho phóng viên AI. Nhận JSON qua tệp hoặc stdin.
#
#   genz-news-save-article /tmp/bai.json
#   echo '{"title":...}' | genz-news-save-article
#
# Vì sao phải có tệp bọc này thay vì cho Claude gọi thẳng node: danh sách công
# cụ cho phép của Claude chỉ trỏ đúng lệnh này, nên nó không chạy được node với
# script khác. Một cửa, đóng hẹp. Khoá tài khoản bot cũng nằm trong này chứ
# không lọt vào prompt.
set -uo pipefail

REPO="${REPO:-/srv/genz-news/repo}"
ENV_FILE="${ENV_FILE:-/etc/genz-news/newsroom.env}"

[ -f "$ENV_FILE" ] || { echo "THIẾU $ENV_FILE" >&2; exit 1; }
# set -a: biến trong tệp phải được XUẤT ra, không thì tiến trình node con
# không thấy gì và báo "thiếu NEWSROOM_USER".
set -a
# shellcheck disable=SC1090
. "$ENV_FILE"
set +a

export APP_URL="${APP_URL:-http://127.0.0.1:5006}"
export DATABASE_PATH="${DATABASE_PATH:-/srv/genz-news/data/app.db}"

exec node "$REPO/scripts/newsroom-save.mjs" "$@"
