import { revalidatePath, revalidateTag } from "next/cache";
import { ARTICLES_TAG } from "@/lib/publicCache";

/**
 * Làm mới ngay bản cache của các trang công khai liên quan tới một bài.
 *
 * Trang công khai giờ được cache (revalidate = 60) để người đọc nhận bản dựng
 * sẵn. Không có bước này thì sửa/đăng/gỡ bài phải chờ tới 60 giây mới hiện ra;
 * có nó thì lượt xem kế tiếp đã thấy bản mới. Lỗi ở đây chỉ log, không làm
 * hỏng việc lưu bài — tệ nhất là chờ hết 60 giây như bình thường.
 */
export function revalidateArticle(a: {
  slug: string;
  category: string;
  extraCategories?: string[];
}) {
  try {
    revalidatePath(`/bai-viet/${a.slug}`);
    // Dữ liệu trang chủ / chuyên mục: expire 0 = lượt xem kế tiếp lấy bản mới
    // luôn, không phát bản cũ thêm một lượt nữa.
    revalidateTag(ARTICLES_TAG, { expire: 0 });
    revalidatePath("/");
    for (const c of new Set([a.category, ...(a.extraCategories ?? [])])) {
      revalidatePath(`/chuyen-muc/${c}`);
    }
  } catch (err) {
    console.warn("[revalidate] không làm mới được cache:", err);
  }
}

/** Chỉ trang bài — khi đổi thứ không hiện ở trang chủ/chuyên mục (bình luận). */
export function revalidateArticlePage(slug: string) {
  try {
    revalidatePath(`/bai-viet/${slug}`);
  } catch (err) {
    console.warn("[revalidate] không làm mới được cache:", err);
  }
}

/** Trang chủ — khi đổi bố cục hero / Tin Nóng / Đang nóng. */
export function revalidateHome() {
  try {
    revalidateTag(ARTICLES_TAG, { expire: 0 });
    revalidatePath("/");
  } catch (err) {
    console.warn("[revalidate] không làm mới được cache:", err);
  }
}
