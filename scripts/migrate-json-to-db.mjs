#!/usr/bin/env node
/**
 * Chuyển dữ liệu từ các file JSON cũ vào PostgreSQL.
 * Chạy một lần sau khi `npx prisma migrate deploy`.
 *
 *   node scripts/migrate-json-to-db.mjs
 *
 * An toàn khi chạy lại: bỏ qua bản ghi đã tồn tại (đối chiếu theo id).
 */
import "dotenv/config";
import fs from "fs/promises";
import path from "path";
import pkg from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const { PrismaClient } = pkg;
const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

const DATA = path.join(process.cwd(), "data");

async function readJson(name) {
  try {
    return JSON.parse(await fs.readFile(path.join(DATA, name), "utf8"));
  } catch (err) {
    if (err.code === "ENOENT") return null;
    throw err;
  }
}

const VALID_STATUS = new Set(["draft", "pending", "published", "rejected"]);
const VALID_REQ_STATUS = new Set(["pending", "in_progress", "done", "rejected"]);

try {
  // ---------------------------------------------------------- users
  const users = (await readJson("users.json")) ?? [];
  let userCount = 0;
  for (const u of users) {
    const exists = await prisma.user.findFirst({
      where: { OR: [{ id: u.id }, { username: u.username }] },
    });
    if (exists) continue;
    await prisma.user.create({
      data: {
        id: u.id,
        username: u.username,
        displayName: u.displayName,
        passwordHash: u.passwordHash,
        salt: u.salt,
        role: u.role === "admin" ? "admin" : "contributor",
        createdAt: u.createdAt ? new Date(u.createdAt) : new Date(),
      },
    });
    userCount++;
  }
  console.log(`users:     +${userCount} (bỏ qua ${users.length - userCount} đã có)`);

  // ---------------------------------------------------------- articles
  const articles = (await readJson("articles.json")) ?? [];
  const userIds = new Set((await prisma.user.findMany({ select: { id: true } })).map((u) => u.id));
  let artCount = 0;
  let orphaned = 0;

  for (const a of articles) {
    if (await prisma.article.findFirst({ where: { OR: [{ id: a.id }, { slug: a.slug }] } })) {
      continue;
    }
    // authorId trỏ tới user không còn tồn tại thì bỏ liên kết để không vỡ khoá ngoại.
    const authorId = a.authorId && userIds.has(a.authorId) ? a.authorId : null;
    if (a.authorId && !authorId) orphaned++;

    const gradient =
      Array.isArray(a.coverGradient) && a.coverGradient.length === 2
        ? a.coverGradient.map(String)
        : ["#7C3AED", "#22D3EE"];

    await prisma.article.create({
      data: {
        id: a.id,
        slug: a.slug,
        title: a.title,
        dek: a.dek ?? "",
        category: a.category,
        tags: Array.isArray(a.tags) ? a.tags.map(String) : [],
        coverGradient: gradient,
        coverImage: a.coverImage ?? null,
        coverImageCaption: a.coverImageCaption ?? null,
        author: a.author ?? "Ban biên tập",
        authorId,
        publishedAt: a.publishedAt,
        readingTimeMin: Number(a.readingTimeMin) || 3,
        featured: Boolean(a.featured),
        trending: Boolean(a.trending),
        status: VALID_STATUS.has(a.status) ? a.status : "draft",
        body: typeof a.body === "string" ? a.body : "",
        submittedAt: a.submittedAt ? new Date(a.submittedAt) : null,
        reviewNote: a.reviewNote ?? null,
        createdAt: a.createdAt ? new Date(a.createdAt) : new Date(),
        sources: {
          create: (Array.isArray(a.sources) ? a.sources : [])
            .filter((s) => s?.url)
            .map((s, i) => ({ name: s.name ?? "Nguồn", url: s.url, position: i })),
        },
      },
    });
    artCount++;
  }
  console.log(`articles:  +${artCount} (bỏ qua ${articles.length - artCount} đã có)`);
  if (orphaned) console.log(`           ${orphaned} bài mất liên kết tác giả → để trống authorId`);

  // ---------------------------------------------------------- research queue
  const queue = (await readJson("research-queue.json")) ?? [];
  let reqCount = 0;
  for (const r of queue) {
    if (await prisma.researchRequest.findUnique({ where: { id: r.id } })) continue;
    await prisma.researchRequest.create({
      data: {
        id: r.id,
        topic: r.topic,
        urls: Array.isArray(r.urls) ? r.urls.map(String) : [],
        notes: r.notes ?? "",
        status: VALID_REQ_STATUS.has(r.status) ? r.status : "pending",
        reporterNote: r.reporterNote ?? null,
        articleIds: Array.isArray(r.articleIds) ? r.articleIds.map(String) : [],
        createdAt: r.createdAt ? new Date(r.createdAt) : new Date(),
      },
    });
    reqCount++;
  }
  console.log(`requests:  +${reqCount} (bỏ qua ${queue.length - reqCount} đã có)`);

  // ---------------------------------------------------------- đối chiếu
  console.log("\n--- Trong database ---");
  console.log("users:            ", await prisma.user.count());
  console.log("articles:         ", await prisma.article.count());
  console.log("sources:          ", await prisma.source.count());
  console.log("research_requests:", await prisma.researchRequest.count());

  const byStatus = await prisma.article.groupBy({
    by: ["status"],
    _count: { status: true },
  });
  console.log(
    "trạng thái bài:   ",
    byStatus.map((s) => `${s.status}=${s._count.status}`).join(", "),
  );
} catch (err) {
  console.error("LỖI:", err.message);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
