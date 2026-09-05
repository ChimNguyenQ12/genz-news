import path from "path";
import fs from "fs";
import { PrismaClient } from "@prisma/client";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";

/**
 * SQLite một tệp. Đường dẫn mặc định nằm trong thư mục data của dự án;
 * trên máy chủ, docker-compose bind mount /srv/<app>/data vào /app/data.
 * Đặt DATABASE_PATH nếu muốn để chỗ khác — không bắt buộc có .env.
 */
const DB_PATH =
  process.env.DATABASE_PATH ?? path.join(process.cwd(), "data", "app.db");

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

function createClient() {
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
  return new PrismaClient({
    adapter: new PrismaBetterSqlite3({ url: `file:${DB_PATH}` }),
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });
}

export const prisma = globalForPrisma.prisma ?? createClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

export { DB_PATH };
