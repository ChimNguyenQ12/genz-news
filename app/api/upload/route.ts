import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { uploadToS3 } from "@/lib/storage";
import { toWebp } from "@/lib/image";

/** Loại file cho phép → phần mở rộng do server tự đặt (không tin tên file client gửi). */
const ALLOWED: Record<string, { ext: string; kind: "image" | "video"; maxMB: number }> = {
  "image/jpeg": { ext: "jpg", kind: "image", maxMB: 10 },
  "image/png": { ext: "png", kind: "image", maxMB: 10 },
  "image/webp": { ext: "webp", kind: "image", maxMB: 10 },
  "image/gif": { ext: "gif", kind: "image", maxMB: 15 },
  "image/avif": { ext: "avif", kind: "image", maxMB: 10 },
  "video/mp4": { ext: "mp4", kind: "video", maxMB: 200 },
  "video/webm": { ext: "webm", kind: "video", maxMB: 200 },
};

/** Kiểm tra magic bytes để chặn file đổi đuôi giả dạng ảnh. */
function sniff(buf: Buffer): string | null {
  if (buf.length < 12) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "image/jpeg";
  if (buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])))
    return "image/png";
  if (buf.subarray(0, 6).toString("ascii") === "GIF87a") return "image/gif";
  if (buf.subarray(0, 6).toString("ascii") === "GIF89a") return "image/gif";
  if (
    buf.subarray(0, 4).toString("ascii") === "RIFF" &&
    buf.subarray(8, 12).toString("ascii") === "WEBP"
  )
    return "image/webp";
  if (buf.subarray(4, 8).toString("ascii") === "ftyp") {
    const brand = buf.subarray(8, 12).toString("ascii");
    if (brand.startsWith("avif") || brand.startsWith("avis")) return "image/avif";
    return "video/mp4";
  }
  if (buf.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3]))) return "video/webm";
  return null;
}

export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: "Dữ liệu không hợp lệ" }, { status: 400 });
  }

  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Thiếu file" }, { status: 400 });
  }

  const declared = file.type;
  const rule = ALLOWED[declared];
  if (!rule) {
    return NextResponse.json(
      { error: "Chỉ nhận ảnh (JPG, PNG, WebP, GIF, AVIF) hoặc video (MP4, WebM)" },
      { status: 415 },
    );
  }
  if (file.size > rule.maxMB * 1024 * 1024) {
    return NextResponse.json(
      { error: `File quá lớn. Tối đa ${rule.maxMB}MB.` },
      { status: 413 },
    );
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const actual = sniff(buffer);
  // mp4 và avif dùng chung header "ftyp" nên chấp nhận lệch giữa hai loại này.
  const compatible =
    actual === declared ||
    (actual === "video/mp4" && declared === "image/avif") ||
    (actual === "image/avif" && declared === "video/mp4");
  if (!compatible) {
    return NextResponse.json(
      { error: "Nội dung file không khớp với định dạng khai báo." },
      { status: 415 },
    );
  }

  // GIF để nguyên: gần như luôn là ảnh động.
  const optimized =
    rule.kind === "image" && declared !== "image/gif" ? await toWebp(buffer) : null;

  try {
    const { url } = optimized
      ? await uploadToS3(optimized.buffer, optimized.contentType, optimized.ext)
      : await uploadToS3(buffer, declared, rule.ext);
    return NextResponse.json({ url, kind: rule.kind }, { status: 201 });
  } catch (err) {
    console.error("[upload] S3 thất bại:", err);
    return NextResponse.json(
      { error: "Không tải được file lên kho lưu trữ. Kiểm tra quyền S3." },
      { status: 502 },
    );
  }
}
