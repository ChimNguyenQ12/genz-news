#!/usr/bin/env node
/**
 * Script kiểm tra và đăng thử một bài viết lên Facebook Fanpage.
 *
 * Cách dùng:
 *   node scripts/post-to-facebook.mjs --latest
 *   node scripts/post-to-facebook.mjs --slug=vua-vo-dich-xong-da-mat-nguoi...
 *   node scripts/post-to-facebook.mjs --id=uuid-bai-viet
 */

import fs from "fs";
import path from "path";
import { execFileSync } from "child_process";

const ROOT = process.cwd();
const DATA_DIR = process.env.DATA_DIR ?? path.join(ROOT, "data");
const DB = process.env.DATABASE_PATH ?? path.join(DATA_DIR, "app.db");
const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL ?? "https://genz-news.site";
const FB_GRAPH_VERSION = "v20.0";

// Tự đọc tệp .env nếu chưa có trong process.env
if (!process.env.FB_PAGE_ID || !process.env.FB_PAGE_ACCESS_TOKEN) {
  try {
    const envFile = fs.readFileSync(path.join(ROOT, ".env"), "utf8");
    for (const line of envFile.split("\n")) {
      const match = line.match(/^\s*([\w_]+)\s*=\s*(.*)\s*$/);
      if (match) {
        process.env[match[1]] = match[2].trim();
      }
    }
  } catch {}
}

const PAGE_ID = process.env.FB_PAGE_ID;
const ACCESS_TOKEN = process.env.FB_PAGE_ACCESS_TOKEN;

import Database from "better-sqlite3";

function sql(query) {
  try {
    const db = new Database(DB, { readonly: true });
    return db.prepare(query).all();
  } catch {
    try {
      const out = execFileSync("sqlite3", ["-cmd", ".timeout 5000", "-json", DB, query], {
        encoding: "utf8",
        maxBuffer: 64 * 1024 * 1024,
      }).trim();
      return out ? JSON.parse(out) : [];
    } catch {
      return [];
    }
  }
}

async function main() {
  console.log("=== Facebook AutoPost Tester ===");

  if (!PAGE_ID || !ACCESS_TOKEN) {
    console.error("❌ Thiếu biến môi trường: FB_PAGE_ID hoặc FB_PAGE_ACCESS_TOKEN");
    console.log("\nHãy thêm vào file .env:");
    console.log("  FB_PAGE_ID=61594370073139");
    console.log("  FB_PAGE_ACCESS_TOKEN=EAAYZAxr...");
    process.exit(1);
  }

  const args = process.argv.slice(2);
  const slugArg = args.find((a) => a.startsWith("--slug="))?.slice(7);
  const idArg = args.find((a) => a.startsWith("--id="))?.slice(5);

  let query = "";
  if (slugArg) {
    query = `SELECT * FROM articles WHERE slug = '${slugArg.replace(/'/g, "''")}' LIMIT 1;`;
  } else if (idArg) {
    query = `SELECT * FROM articles WHERE id = '${idArg.replace(/'/g, "''")}' LIMIT 1;`;
  } else {
    query = `SELECT * FROM articles WHERE status = 'published' ORDER BY publishedAt DESC LIMIT 1;`;
  }

  let rows = [];
  try {
    rows = sql(query);
  } catch {}

  if (!rows.length) {
    console.log("ℹ️ DB local chưa có bài đăng, sử dụng bài viết mẫu để kiểm tra kết nối Facebook API...");
    rows.push({
      id: "test-id",
      title: "Thử nghiệm đăng bài tự động từ GenZ News lên Facebook Fanpage",
      slug: "thu-nghiem-dang-bai-tu-dong-len-facebook",
      dek: "Hệ thống GenZ News kết nối trực tiếp Facebook Graph API v20.0 để xuất bản bài viết và tự động comment link bài báo ở bình luận đầu tiên.",
      category: "cong-nghe",
      coverImage: "https://genz-news.site/genz-news-logo.png",
      tags: JSON.stringify(["GenZNews", "Tech", "AutoPost"]),
    });
  }

  const article = rows[0];
  let tags = [];
  try {
    tags = JSON.parse(article.tags || "[]");
  } catch {
    tags = [];
  }

  console.log(`\n📌 Bài viết chọn: ${article.title}`);
  console.log(`   Slug: ${article.slug}`);
  console.log(`   Ảnh bìa: ${article.coverImage || "(không có)"}`);

  const hashtags = [
    "#GenZNews",
    `#${article.category}`,
    ...tags.slice(0, 4).map((t) => `#${t.replace(/[\s-]+/g, "")}`),
  ].join(" ");

  const caption = [
    `⚡ ${article.title.toUpperCase()}`,
    "",
    article.dek ? `📌 ${article.dek}` : "",
    "",
    "👇 Chi tiết bài viết và nguồn trích dẫn được cập nhật ở bình luận bên dưới!",
    "",
    hashtags,
  ].join("\n").trim();

  const articleUrl = `${BASE_URL}/bai-viet/${article.slug}`;

  console.log("\n--- Preview Caption ---");
  console.log(caption);
  console.log("-----------------------\n");

  try {
    let postId = null;

    if (article.coverImage) {
      console.log("Đang đăng bài kèm ảnh bìa...");
      const photoUrl = `https://graph.facebook.com/${FB_GRAPH_VERSION}/${encodeURIComponent(PAGE_ID)}/photos`;
      const res = await fetch(photoUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: article.coverImage,
          caption,
          access_token: ACCESS_TOKEN,
        }),
      });
      const data = await res.json();
      if (!res.ok || data.error) {
        throw new Error(data.error?.message || `HTTP ${res.status}`);
      }
      postId = data.post_id || data.id;
    } else {
      console.log("Đang đăng bài dạng status...");
      const feedUrl = `https://graph.facebook.com/${FB_GRAPH_VERSION}/${encodeURIComponent(PAGE_ID)}/feed`;
      const res = await fetch(feedUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: caption,
          access_token: ACCESS_TOKEN,
        }),
      });
      const data = await res.json();
      if (!res.ok || data.error) {
        throw new Error(data.error?.message || `HTTP ${res.status}`);
      }
      postId = data.id;
    }

    console.log(`✅ Đăng bài thành công! Post ID: ${postId}`);

    console.log("Đang tạo bình luận đầu tiên chứa link bài báo...");
    const commentUrl = `https://graph.facebook.com/${FB_GRAPH_VERSION}/${encodeURIComponent(postId)}/comments`;
    const commentRes = await fetch(commentUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: `👉 Đọc đầy đủ bài viết tại: ${articleUrl}`,
        access_token: ACCESS_TOKEN,
      }),
    });
    const commentData = await commentRes.json();
    if (commentRes.ok && commentData.id) {
      console.log(`✅ Đã comment link thành công! Comment ID: ${commentData.id}`);
    } else {
      console.warn("⚠️ Không tạo được comment:", commentData.error?.message);
    }

    console.log("\n🎉 HOÀN TẤT!");
  } catch (err) {
    console.error("❌ Lỗi khi gọi Facebook API:", err.message);
  }
}

main();
