#!/usr/bin/env node
/**
 * Script tự động quét và đăng tất cả các bài được xuất bản (published) trong ngày hôm nay lên Facebook.
 * Đảm bảo:
 * 1. Caption tự nhiên, có Headline ⚡, Dek 📌, Hashtag. Không đề cập 'AI', 'Bot', 'Auto'.
 * 2. Link bài viết nằm ở Comment đầu tiên để tối ưu reach & chống penalty.
 * 3. Tối ưu tần suất theo khung giờ vàng (3-4 bài/ngày).
 * 
 * Cách dùng:
 *   node scripts/publish-today-to-facebook.mjs
 *   node scripts/publish-today-to-facebook.mjs --max=4
 */

import fs from "fs";
import path from "path";
import Database from "better-sqlite3";
import { execFileSync } from "child_process";

const ROOT = process.cwd();
const DATA_DIR = process.env.DATA_DIR ?? path.join(ROOT, "data");
const DB_PATH = process.env.DATABASE_PATH ?? path.join(DATA_DIR, "app.db");
const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL ?? "https://genz-news.site";
const FB_GRAPH_VERSION = "v20.0";

// Tự nạp biến .env nếu chưa có
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

function getDb() {
  try {
    return new Database(DB_PATH);
  } catch (err) {
    console.error("Lỗi khi mở SQLite DB với better-sqlite3:", err);
    return null;
  }
}

function sqlQuery(query, params = []) {
  const db = getDb();
  if (db) {
    const stmt = db.prepare(query);
    const res = stmt.all(...params);
    db.close();
    return res;
  }
  // Fallback to sqlite3 CLI
  try {
    const out = execFileSync("sqlite3", ["-cmd", ".timeout 5000", "-json", DB_PATH, query], {
      encoding: "utf8",
      maxBuffer: 64 * 1024 * 1024,
    }).trim();
    return out ? JSON.parse(out) : [];
  } catch (e) {
    console.error("Lỗi fallback sqlite3 CLI:", e);
    return [];
  }
}

function sqlExec(query, params = []) {
  const db = getDb();
  if (db) {
    const stmt = db.prepare(query);
    stmt.run(...params);
    db.close();
    return;
  }
}

const CATEGORY_NAMES = {
  "viet-nam": "ViệtNam",
  "the-gioi": "ThếGiới",
  "cong-nghe": "CôngNghệ",
  "giai-tri": "GiảiTrí",
  "doi-song": "ĐờiSống",
  "kinh-doanh": "KinhDoanh",
  "the-thao": "ThểThao",
  "thread-city": "ThreadCity",
};

function formatCaption(article) {
  const catName = CATEGORY_NAMES[article.category] ? `#${CATEGORY_NAMES[article.category]}` : "#TinTuc";
  let tags = [];
  try {
    tags = JSON.parse(article.tags || "[]");
  } catch {
    tags = [];
  }

  const hashtags = [
    "#GenZNews",
    catName,
    ...tags.slice(0, 4).map((t) => `#${t.replace(/[\s-]+/g, "")}`),
  ]
    .filter(Boolean)
    .join(" ");

  const lines = [
    `⚡ ${article.title.toUpperCase()}`,
    "",
    article.dek ? `📌 ${article.dek}` : "",
    "",
    "👇 Chi tiết bài viết và nguồn trích dẫn được cập nhật ở bình luận bên dưới!",
    "",
    hashtags,
  ].filter((line, i, arr) => {
    if (line === "" && arr[i - 1] === "") return false;
    return true;
  });

  return lines.join("\n").trim();
}

async function postArticle(article) {
  const caption = formatCaption(article);
  const articleUrl = `${BASE_URL}/bai-viet/${article.slug}`;
  const commentText = `👉 Đọc đầy đủ bài viết và thảo luận thêm tại: ${articleUrl}`;

  console.log(`\n--------------------------------------------------`);
  console.log(`🚀 Đang xuất bản bài: [${article.publishedAt}] ${article.title}`);
  console.log(`   Slug: ${article.slug}`);

  let postId = null;

  if (article.coverImage) {
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

  console.log(`   ✅ Post ID Facebook: ${postId}`);

  let commentId = null;
  try {
    const commentUrl = `https://graph.facebook.com/${FB_GRAPH_VERSION}/${encodeURIComponent(postId)}/comments`;
    const commentRes = await fetch(commentUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: commentText,
        access_token: ACCESS_TOKEN,
      }),
    });
    const commentData = await commentRes.json();
    if (commentRes.ok && commentData.id) {
      commentId = commentData.id;
      console.log(`   ✅ Comment ID link: ${commentId}`);
    }
  } catch (err) {
    console.error("   ⚠️ Lỗi chèn comment link:", err.message);
  }

  // Lưu record vào SQLite DB
  const nowStr = new Date().toISOString();
  try {
    const existing = sqlQuery(`SELECT id FROM facebook_posts WHERE articleId = '${article.id.replace(/'/g, "''")}';`);
    if (existing.length > 0) {
      sqlExec(`UPDATE facebook_posts SET fbPostId = ?, fbCommentId = ?, customCaption = ?, customComment = ?, updatedAt = ? WHERE articleId = ?;`,
        [postId, commentId, caption, commentText, nowStr, article.id]
      );
    } else {
      const uuid = article.id + "-fb";
      sqlExec(`INSERT INTO facebook_posts (id, articleId, fbPostId, fbCommentId, customCaption, customComment, postedAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?);`,
        [uuid, article.id, postId, commentId, caption, commentText, nowStr, nowStr]
      );
    }
    console.log(`   💾 Đã lưu lịch sử FacebookPost vào CSDL.`);
  } catch (dbErr) {
    console.error("   ⚠️ Lỗi ghi CSDL facebook_posts:", dbErr.message);
  }

  return { postId, commentId };
}

async function main() {
  console.log("==================================================");
  console.log("   GENZ NEWS - FACEBOOK AUTO PUBLISHER TODAY");
  console.log("==================================================");

  if (!PAGE_ID || !ACCESS_TOKEN) {
    console.error("❌ Chưa cấu hình FB_PAGE_ID hoặc FB_PAGE_ACCESS_TOKEN!");
    process.exit(1);
  }

  const args = process.argv.slice(2);
  const maxArg = args.find((a) => a.startsWith("--max="))?.slice(6);
  const maxArticles = maxArg ? parseInt(maxArg, 10) : 4; // Tối đa 4 bài theo chiến lược tối ưu

  const todayStr = new Date().toISOString().slice(0, 10); // "YYYY-MM-DD"
  console.log(`📅 Ngày quét tin: ${todayStr} (Giới hạn đăng tối đa: ${maxArticles} bài/ngày)`);

  // Lấy các bài đăng hôm nay chưa được đăng Facebook
  const query = `
    SELECT a.* FROM articles a
    LEFT JOIN facebook_posts fp ON a.id = fp.articleId
    WHERE a.status = 'published' 
      AND (a.publishedAt LIKE '${todayStr}%' OR a.publishedAt >= '${todayStr}')
      AND fp.id IS NULL
    ORDER BY a.publishedAt ASC
    LIMIT ${maxArticles};
  `;

  let todayArticles = [];
  try {
    todayArticles = sqlQuery(query);
  } catch (err) {
    console.error("Lỗi truy vấn danh sách bài viết hôm nay:", err);
  }

  if (!todayArticles.length) {
    console.log(`ℹ️ Không có bài viết mới nào hôm nay (${todayStr}) chưa đăng Facebook.`);
    console.log("👉 Đang kiểm tra 3 bài xuất bản mới nhất chưa đăng Facebook gần đây...");
    const fallbackQuery = `
      SELECT a.* FROM articles a
      LEFT JOIN facebook_posts fp ON a.id = fp.articleId
      WHERE a.status = 'published' AND fp.id IS NULL
      ORDER BY a.publishedAt DESC
      LIMIT ${maxArticles};
    `;
    todayArticles = sqlQuery(fallbackQuery);
  }

  if (!todayArticles.length) {
    console.log("✅ Tất cả các bài viết xuất bản mới nhất đều đã được đăng lên Facebook Fanpage!");
    return;
  }

  console.log(`📌 Tìm thấy ${todayArticles.length} bài viết cần xuất bản lên Fanpage:`);
  todayArticles.forEach((art, idx) => {
    console.log(`   ${idx + 1}. [${art.publishedAt}] ${art.title}`);
  });

  for (const article of todayArticles) {
    try {
      await postArticle(article);
      // Chờ 3 giây giữa các lần post để tránh rate limit
      await new Promise((r) => setTimeout(r, 3000));
    } catch (err) {
      console.error(`❌ Đăng bài thất bại (${article.title}):`, err.message);
    }
  }

  console.log("\n==================================================");
  console.log("🎉 TẤT CẢ BÀI VIẾT HÔM NAY ĐÃ ĐƯỢC XUẤT BẢN LÊN FANPAGE!");
  console.log("==================================================");
}

main();
