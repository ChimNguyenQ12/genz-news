#!/usr/bin/env node
/**
 * Nạp data/export.json vào cơ sở dữ liệu hiện tại.
 * An toàn khi chạy lại: bỏ qua bản ghi đã có (đối chiếu theo id).
 *
 *   node scripts/import-db.mjs
 */
import fs from "fs/promises";
import path from "path";
import pkg from "@prisma/client";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";

const { PrismaClient } = pkg;
const dbPath =
  process.env.DATABASE_PATH ?? path.join(process.cwd(), "data", "app.db");
const prisma = new PrismaClient({
  adapter: new PrismaBetterSqlite3({ url: dbPath }),
});

const file = path.join(process.cwd(), "data", "export.json");
const data = JSON.parse(await fs.readFile(file, "utf8"));

/** Danh sách có thể đã là mảng (từ Postgres) hoặc chuỗi JSON — chuẩn hoá về chuỗi. */
const asJson = (v, fallback = []) =>
  typeof v === "string" ? v : JSON.stringify(Array.isArray(v) ? v : fallback);

let n = { users: 0, articles: 0, sources: 0, comments: 0, requests: 0 };

for (const u of data.users ?? []) {
  if (await prisma.user.findUnique({ where: { id: u.id } })) continue;
  await prisma.user.create({
    data: {
      id: u.id,
      username: u.username,
      displayName: u.displayName,
      passwordHash: u.passwordHash,
      salt: u.salt,
      role: u.role === "admin" ? "admin" : "contributor",
      createdAt: new Date(u.createdAt),
    },
  });
  n.users++;
}

for (const a of data.articles ?? []) {
  if (await prisma.article.findUnique({ where: { id: a.id } })) continue;
  await prisma.article.create({
    data: {
      id: a.id,
      slug: a.slug,
      title: a.title,
      dek: a.dek ?? "",
      category: a.category,
      status: a.status ?? "draft",
      language: a.language ?? "vi",
      body: a.body ?? "",
      tags: asJson(a.tags),
      author: a.author,
      authorId: a.authorId ?? null,
      coverGradient: asJson(a.coverGradient, ["#7C3AED", "#22D3EE"]),
      coverImage: a.coverImage ?? null,
      coverImageCaption: a.coverImageCaption ?? null,
      publishedAt: a.publishedAt,
      readingTimeMin: a.readingTimeMin ?? 3,
      featured: Boolean(a.featured),
      trending: Boolean(a.trending),
      submittedAt: a.submittedAt ? new Date(a.submittedAt) : null,
      reviewNote: a.reviewNote ?? null,
      createdAt: new Date(a.createdAt),
      sources: {
        create: (a.sources ?? []).map((s, i) => ({
          id: s.id,
          name: s.name,
          url: s.url,
          position: s.position ?? i,
        })),
      },
    },
  });
  n.articles++;
  n.sources += (a.sources ?? []).length;
}

// Bình luận gốc trước, trả lời sau — để khoá ngoại parentId luôn hợp lệ.
const comments = [...(data.comments ?? [])].sort(
  (x, y) => (x.parentId ? 1 : 0) - (y.parentId ? 1 : 0),
);
for (const c of comments) {
  if (await prisma.comment.findUnique({ where: { id: c.id } })) continue;
  await prisma.comment.create({
    data: {
      id: c.id,
      body: c.body,
      articleId: c.articleId,
      userId: c.userId,
      parentId: c.parentId ?? null,
      createdAt: new Date(c.createdAt),
    },
  });
  n.comments++;
}

for (const r of data.researchRequests ?? []) {
  if (await prisma.researchRequest.findUnique({ where: { id: r.id } })) continue;
  await prisma.researchRequest.create({
    data: {
      id: r.id,
      topic: r.topic,
      urls: asJson(r.urls),
      notes: r.notes ?? "",
      status: r.status ?? "pending",
      reporterNote: r.reporterNote ?? null,
      articleIds: asJson(r.articleIds),
      createdAt: new Date(r.createdAt),
    },
  });
  n.requests++;
}

console.log("đã nạp:", JSON.stringify(n));
console.log("trong DB — users:", await prisma.user.count());
console.log("           articles:", await prisma.article.count());
console.log("           sources:", await prisma.source.count());
console.log("           comments:", await prisma.comment.count());
console.log("           requests:", await prisma.researchRequest.count());

await prisma.$disconnect();
