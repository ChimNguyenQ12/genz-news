import sharp from "sharp";

/**
 * Thu ảnh về WebP trước khi đẩy lên S3.
 *
 * Ảnh gốc từ máy ảnh hay từ báo nguồn trung bình ~390KB, có tấm vượt 1MB,
 * trong khi thẻ bài chỉ hiện rộng ~400px và trang bài rộng nhất ~900px.
 * 1600px vẫn đủ nét trên màn hình mật độ điểm ảnh gấp đôi.
 */
const MAX_SIDE = 1600;
const QUALITY = 80;

export interface OptimizedImage {
  buffer: Buffer;
  contentType: string;
  ext: string;
}

/**
 * Trả về bản WebP đã thu nhỏ, hoặc `null` nếu nên giữ nguyên tệp gốc:
 * ảnh động (sharp chỉ đọc khung đầu, sẽ mất chuyển động), tệp sharp không
 * đọc được, hay bản WebP không nhỏ hơn bản gốc.
 */
export async function toWebp(input: Buffer): Promise<OptimizedImage | null> {
  try {
    const meta = await sharp(input).metadata();
    if ((meta.pages ?? 1) > 1) return null;

    const output = await sharp(input)
      // Xoay theo EXIF trước: sau bước này siêu dữ liệu bị bỏ, kể cả toạ độ
      // GPS mà ảnh chụp điện thoại hay mang theo.
      .rotate()
      .resize({
        width: MAX_SIDE,
        height: MAX_SIDE,
        fit: "inside",
        withoutEnlargement: true,
      })
      .webp({ quality: QUALITY })
      .toBuffer();

    if (output.length >= input.length) return null;
    return { buffer: output, contentType: "image/webp", ext: "webp" };
  } catch (err) {
    console.warn("[upload] không chuyển được sang WebP, giữ tệp gốc:", err);
    return null;
  }
}
