#!/usr/bin/env bash
# Tìm ảnh có giấy phép tự do trên Wikimedia Commons rồi đẩy lên S3 của mình.
#
#   genz-news-fetch-image "đường sắt cao tốc Việt Nam"
#
# In ra JSON {url, caption}. Dùng url làm coverImage, caption làm
# coverImageCaption — ghi công tác giả và giấy phép là bắt buộc.
set -uo pipefail

REPO="${REPO:-/srv/genz-news/repo}"
ENV_FILE="${ENV_FILE:-/etc/genz-news/newsroom.env}"

[ -f "$ENV_FILE" ] || { echo "THIẾU $ENV_FILE" >&2; exit 1; }
set -a
# shellcheck disable=SC1090
. "$ENV_FILE"
set +a

export APP_URL="${APP_URL:-http://127.0.0.1:5006}"
exec node "$REPO/scripts/fetch-image.mjs" "$@"
