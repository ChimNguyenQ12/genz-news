import path from "path";
import { defineConfig } from "prisma/config";

/**
 * Đường dẫn tệp SQLite dùng cho lệnh prisma migrate / studio.
 * Trùng với lib/prisma.ts để CLI và app luôn nói chuyện với cùng một tệp.
 */
const dbPath =
  process.env.DATABASE_PATH ?? path.join(process.cwd(), "data", "app.db");

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: `file:${dbPath}`,
  },
});
