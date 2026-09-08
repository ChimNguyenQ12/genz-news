import type { CategorySlug } from "./types";

// Tailwind cần thấy class name đầy đủ (không ghép chuỗi động), nên khai báo
// tường minh từng biến thể theo category ở đây.
export const categoryStyles: Record<
  CategorySlug,
  { pill: string; text: string; dot: string; ring: string }
> = {
  "the-gioi": {
    pill: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
    text: "text-blue-600 dark:text-blue-400",
    dot: "bg-blue-500",
    ring: "ring-blue-500",
  },
  "cong-nghe": {
    pill: "bg-violet-500/10 text-violet-600 dark:text-violet-400",
    text: "text-violet-600 dark:text-violet-400",
    dot: "bg-violet-500",
    ring: "ring-violet-500",
  },
  "giai-tri": {
    pill: "bg-pink-500/10 text-pink-600 dark:text-pink-400",
    text: "text-pink-600 dark:text-pink-400",
    dot: "bg-pink-500",
    ring: "ring-pink-500",
  },
  "doi-song": {
    pill: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
    text: "text-amber-600 dark:text-amber-400",
    dot: "bg-amber-500",
    ring: "ring-amber-500",
  },
  "kinh-doanh": {
    pill: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
    text: "text-emerald-600 dark:text-emerald-400",
    dot: "bg-emerald-500",
    ring: "ring-emerald-500",
  },
  "the-thao": {
    pill: "bg-orange-500/10 text-orange-600 dark:text-orange-400",
    text: "text-orange-600 dark:text-orange-400",
    dot: "bg-orange-500",
    ring: "ring-orange-500",
  },
  "thread-city": {
    pill: "bg-black/10 text-black dark:text-black",
    text: "text-black dark:text-black",
    dot: "bg-black",
    ring: "ring-black",
  },
};
