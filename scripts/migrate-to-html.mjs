#!/usr/bin/env node
/**
 * Chuyển nội dung bài từ định dạng khối (Block[]) sang HTML cho trình soạn thảo mới.
 * Gộp luôn thông tin ghi công ảnh bìa vào phần chú thích để không mất dữ liệu.
 *
 *   node scripts/migrate-to-html.mjs
 */
import fs from "fs/promises";
import path from "path";

const FILE = path.join(process.cwd(), "data", "articles.json");

const esc = (s) =>
  String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

function blockToHtml(b) {
  switch (b.type) {
    case "paragraph":
      return `<p>${esc(b.text)}</p>`;
    case "heading":
      return `<h2>${esc(b.text)}</h2>`;
    case "quote":
      return `<blockquote><p>${esc(b.text)}${
        b.attribution ? ` — ${esc(b.attribution)}` : ""
      }</p></blockquote>`;
    case "list": {
      const items = b.items.map((i) => `<li>${esc(i)}</li>`).join("");
      return b.ordered ? `<ol>${items}</ol>` : `<ul>${items}</ul>`;
    }
    case "image": {
      const cap = [b.caption, b.credit ? `Ảnh: ${b.credit.author} (${b.credit.license})` : ""]
        .filter(Boolean)
        .join(" ");
      const img = `<img src="${esc(b.url)}" alt="${esc(b.caption ?? "")}">`;
      return cap ? `<figure>${img}<figcaption>${esc(cap)}</figcaption></figure>` : `<figure>${img}</figure>`;
    }
    case "video": {
      const src =
        b.provider === "vimeo"
          ? `https://player.vimeo.com/video/${b.videoId}`
          : `https://www.youtube-nocookie.com/embed/${b.videoId}`;
      const frame = `<div data-youtube-video><iframe src="${esc(src)}" allowfullscreen></iframe></div>`;
      return b.caption
        ? `<figure>${frame}<figcaption>${esc(b.caption)}</figcaption></figure>`
        : frame;
    }
    default:
      return "";
  }
}

function toHtml(body) {
  if (typeof body === "string") return body;
  if (!Array.isArray(body)) return "";
  if (body.every((b) => typeof b === "string")) {
    return body.filter((t) => t.trim()).map((t) => `<p>${esc(t)}</p>`).join("\n");
  }
  return body.map(blockToHtml).filter(Boolean).join("\n");
}

const articles = JSON.parse(await fs.readFile(FILE, "utf8"));
let convertedBody = 0;
let foldedCredit = 0;

for (const a of articles) {
  if (typeof a.body !== "string") {
    a.body = toHtml(a.body);
    convertedBody++;
  }
  // Gộp ghi công ảnh bìa vào chú thích rồi bỏ trường riêng.
  if (a.coverImageCredit) {
    const c = a.coverImageCredit;
    const line = `Ảnh: ${c.author}${c.license ? ` (${c.license})` : ""}`;
    a.coverImageCaption = [a.coverImageCaption, line].filter(Boolean).join(" ");
    delete a.coverImageCredit;
    foldedCredit++;
  }
}

await fs.writeFile(FILE, JSON.stringify(articles, null, 2), "utf8");
console.log(`Đã chuyển ${convertedBody}/${articles.length} bài sang HTML.`);
console.log(`Đã gộp ghi công ảnh của ${foldedCredit} bài vào chú thích.`);
