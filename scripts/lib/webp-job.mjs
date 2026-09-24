/**
 * Phần chạy BÊN TRONG container app của convert-images-webp.mjs.
 *
 * Container có sẵn sharp (bản Linux) và quyền S3; máy chủ thì không có sharp.
 * Và container ở cùng vùng AWS với bucket, nên tải ảnh gốc về rất nhanh.
 *
 * Đọc danh sách key từ /app/data/webp-keys.json, ghi kết quả từng ảnh (nối
 * thêm) vào /app/data/webp-map.jsonl. Không đụng tới DB.
 *
 * Thông số phải khớp lib/image.ts để ảnh cũ và ảnh mới upload giống nhau.
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";

const DIR = "/app/data";
const MAX_SIDE = 1600;
const QUALITY = 80;

// Máy chủ dùng chung 2 vCPU: xử lý từng ảnh một, một luồng.
sharp.concurrency(1);

const Bucket = process.env.S3_BUCKET ?? "genz-news";
const s3 = new S3Client({ region: process.env.AWS_REGION ?? "us-east-1" });

const keys = JSON.parse(fs.readFileSync(path.join(DIR, "webp-keys.json"), "utf8"));
const out = fs.openSync(path.join(DIR, "webp-map.jsonl"), "a");

for (const [i, key] of keys.entries()) {
  let rec;
  try {
    const obj = await s3.send(new GetObjectCommand({ Bucket, Key: key }));
    const input = Buffer.from(await obj.Body.transformToByteArray());
    const meta = await sharp(input).metadata();

    if ((meta.pages ?? 1) > 1) {
      rec = { old: key, skip: "ảnh động" };
    } else {
      const output = await sharp(input)
        .rotate()
        .resize({ width: MAX_SIDE, height: MAX_SIDE, fit: "inside", withoutEnlargement: true })
        .webp({ quality: QUALITY })
        .toBuffer();

      if (output.length >= input.length) {
        rec = { old: key, skip: "WebP không nhỏ hơn", before: input.length, after: output.length };
      } else {
        // Tên mới, cùng thư mục năm/tháng. Không ghi đè ảnh gốc: tên UUID được
        // hứa là bất biến (Cache-Control immutable), và giữ gốc để còn quay lại.
        const newKey = path.posix.join(path.posix.dirname(key), `${crypto.randomUUID()}.webp`);
        await s3.send(
          new PutObjectCommand({
            Bucket,
            Key: newKey,
            Body: output,
            ContentType: "image/webp",
            CacheControl: "public, max-age=31536000, immutable",
          }),
        );
        rec = { old: key, new: newKey, before: input.length, after: output.length };
      }
    }
  } catch (err) {
    rec = { old: key, error: String(err?.message ?? err) };
  }

  fs.writeSync(out, JSON.stringify(rec) + "\n");
  const note = rec.new
    ? `${Math.round(rec.before / 1024)}KB → ${Math.round(rec.after / 1024)}KB`
    : rec.skip ?? `LỖI: ${rec.error}`;
  console.log(`[${i + 1}/${keys.length}] ${key} ${note}`);
}

fs.closeSync(out);
