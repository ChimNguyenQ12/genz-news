#!/usr/bin/env bash
# Dựng server block nginx cho GenZ News rồi để certbot chèn phần SSL.
#
#   sudo ./deploy/setup-nginx.sh genz-news.site [email]
#
# Chạy lại nhiều lần vô hại: cấu hình cũ được sao lưu trước khi ghi đè.
set -euo pipefail

DOMAIN="${1:-genz-news.site}"
EMAIL="${2:-admin@${DOMAIN}}"
PORT="${PORT:-5006}"
SITE="/etc/nginx/sites-available/${DOMAIN}"

if [ "$(id -u)" -ne 0 ]; then
  echo "Cần chạy bằng root (sudo)." >&2
  exit 1
fi

if [ -f "$SITE" ]; then
  cp "$SITE" "${SITE}.bak.$(date +%Y%m%d%H%M%S)"
  echo "Đã sao lưu cấu hình cũ."
fi

cat > "$SITE" <<NGINX
# GenZ News — sinh bởi deploy/setup-nginx.sh cho ${DOMAIN}
# certbot --nginx sẽ chèn phần SSL và block chuyển hướng vào đây.
server {
    # Nhận cả www để có chứng chỉ cho nó; app tự chuyển www → tên miền gốc
    # bằng 301 (proxy.ts), nên không cần block chuyển hướng riêng ở đây.
    server_name ${DOMAIN} www.${DOMAIN};

    location /.well-known/acme-challenge/ {
        root /var/www/html;
    }

    location / {
        proxy_pass         http://127.0.0.1:${PORT};
        proxy_http_version 1.1;
        proxy_set_header   Host              \$host;
        # Ghi đè bằng \$remote_addr thay vì nối thêm, để client không tự khai
        # IP giả né hạn mức.
        proxy_set_header   X-Real-IP         \$remote_addr;
        proxy_set_header   X-Forwarded-For   \$remote_addr;
        proxy_set_header   X-Forwarded-Proto \$scheme;
        proxy_read_timeout 60s;
        proxy_connect_timeout 60s;
    }

    # Video tải lên tối đa 200MB — nginx phải cho qua, nếu không sẽ 413.
    client_max_body_size 220m;
    # Upload file lớn cần thời gian đọc body.
    client_body_timeout 300s;
    proxy_request_buffering off;

    gzip            on;
    gzip_min_length 1024;
    gzip_types      text/plain text/css application/json application/javascript
                    text/xml application/xml image/svg+xml;

    listen 80;
    listen [::]:80;
}
NGINX

ln -sf "$SITE" "/etc/nginx/sites-enabled/${DOMAIN}"
nginx -t
systemctl reload nginx
echo "nginx đã nhận cấu hình HTTP cho ${DOMAIN}."

# Xin chứng chỉ và bật chuyển hướng HTTPS.
certbot --nginx -d "${DOMAIN}" -d "www.${DOMAIN}" \
        --redirect --agree-tos --no-eff-email -m "${EMAIL}" -n

nginx -t
systemctl reload nginx
echo
echo "Xong. Kiểm tra:"
echo "  curl -fsS https://${DOMAIN}/api/health"
echo "  certbot renew --dry-run"
