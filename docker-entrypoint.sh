#!/bin/sh
set -e

# Áp migration trước khi mở cổng. Chạy lại vô hại: migrate deploy bỏ qua
# những migration đã áp.
echo "[entrypoint] áp migration vào $DATABASE_PATH"
npx prisma migrate deploy

exec "$@"
