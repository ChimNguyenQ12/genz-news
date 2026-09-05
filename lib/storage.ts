import crypto from "crypto";
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";

/**
 * Lưu ảnh/video lên S3.
 *
 * Trên EC2 dùng IAM role hoặc profile trong ~/.aws — SDK tự tìm thông tin
 * đăng nhập theo thứ tự chuẩn, nên không cần nhét khoá vào mã nguồn.
 * Đặt AWS_PROFILE=s3-full-sandbox nếu máy có nhiều profile.
 */
export const S3_BUCKET = process.env.S3_BUCKET ?? "genz-news";
export const S3_REGION = process.env.AWS_REGION ?? "us-east-1";

/**
 * Tiền tố URL công khai để đọc file.
 * Mặc định dùng endpoint mặc định của bucket; đổi sang CloudFront nếu có.
 */
export const PUBLIC_BASE =
  process.env.S3_PUBLIC_BASE ?? `https://${S3_BUCKET}.s3.${S3_REGION}.amazonaws.com`;

let client: S3Client | null = null;

function getClient() {
  if (!client) client = new S3Client({ region: S3_REGION });
  return client;
}

export interface UploadResult {
  url: string;
  key: string;
}

/** Đẩy một tệp lên S3, trả về URL công khai. Tên tệp do server sinh. */
export async function uploadToS3(
  buffer: Buffer,
  contentType: string,
  extension: string,
): Promise<UploadResult> {
  const now = new Date();
  const key = [
    "uploads",
    String(now.getFullYear()),
    String(now.getMonth() + 1).padStart(2, "0"),
    `${crypto.randomUUID()}.${extension}`,
  ].join("/");

  await getClient().send(
    new PutObjectCommand({
      Bucket: S3_BUCKET,
      Key: key,
      Body: buffer,
      ContentType: contentType,
      // Cache lâu vì tên tệp là UUID, không bao giờ bị ghi đè.
      CacheControl: "public, max-age=31536000, immutable",
    }),
  );

  return { url: `${PUBLIC_BASE}/${key}`, key };
}
