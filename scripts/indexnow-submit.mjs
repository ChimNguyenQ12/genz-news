#!/usr/bin/env node
/**
 * Gửi TOÀN BỘ URL trong sitemap lên IndexNow một lần.
 *
 * Dùng khi mới bật IndexNow, hoặc sau khi đổi hàng loạt. Các bài đăng hằng ngày
 * đã tự gửi rồi (xem app/api/articles/[id]/route.ts).
 *
 * Chạy: node scripts/indexnow-submit.mjs [baseUrl]
 *
 * Khoá đọc thẳng từ lib/indexnow.ts để chỉ có MỘT nguồn sự thật — chép khoá ra
 * đây thành bản thứ ba thì sớm muộn cũng lệch.
 */
import { readFile } from "node:fs/promises";

const BASE = (process.argv[2] ?? "https://genz-news.site").replace(/\/$/, "");
const ENDPOINT = "https://api.indexnow.org/indexnow";

const src = await readFile(new URL("../lib/indexnow.ts", import.meta.url), "utf8");
const key = /INDEXNOW_KEY\s*=\s*"([^"]+)"/.exec(src)?.[1];
if (!key) {
  console.error("Không đọc được INDEXNOW_KEY từ lib/indexnow.ts");
  process.exit(1);
}

const sitemapRes = await fetch(`${BASE}/sitemap.xml`);
if (!sitemapRes.ok) {
  console.error(`Không tải được sitemap: HTTP ${sitemapRes.status}`);
  process.exit(1);
}
const sitemap = await sitemapRes.text();
const urls = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1].trim());
if (urls.length === 0) {
  console.error("Sitemap rỗng.");
  process.exit(1);
}

// Kiểm tra file khoá phải tải được công khai, nếu không IndexNow trả 403.
const keyRes = await fetch(`${BASE}/${key}.txt`);
const keyBody = keyRes.ok ? (await keyRes.text()).trim() : "";
console.log(`File khoá ${BASE}/${key}.txt → HTTP ${keyRes.status}`);
if (keyBody !== key) {
  console.error(
    `Nội dung file khoá không khớp (nhận "${keyBody}"). Deploy trước rồi chạy lại.`
  );
  process.exit(1);
}

console.log(`Gửi ${urls.length} URL lên IndexNow…`);
const res = await fetch(ENDPOINT, {
  method: "POST",
  headers: { "content-type": "application/json; charset=utf-8" },
  body: JSON.stringify({
    host: new URL(BASE).host,
    key,
    keyLocation: `${BASE}/${key}.txt`,
    urlList: urls.slice(0, 10000),
  }),
});

// 200 = đã nhận; 202 = khoá đang chờ xác minh lần đầu (vẫn tính là gửi được).
const ok = res.ok || res.status === 202;
console.log(`IndexNow trả về HTTP ${res.status} ${res.statusText} → ${ok ? "OK" : "LỖI"}`);
const body = await res.text().catch(() => "");
if (body) console.log(body.slice(0, 400));
process.exitCode = ok ? 0 : 1;
