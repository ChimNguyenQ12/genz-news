/**
 * Chuẩn hoá tag lúc lưu bài.
 *
 * Vì sao cần: kho bài hiện có 708 tag khác nhau cho 211 bài, trong đó 545 tag
 * chỉ xuất hiện đúng một lần. Một phần trong đó là do cùng một thứ được viết
 * khác nhau mỗi lần ("OpenAI" / "openai" / "Open AI", "Việt Nam" / "viet nam").
 * Tag trùng nghĩa làm loãng đúng cái tín hiệu mà khối "Tin liên quan" dựa vào,
 * nên phải gộp lại ngay lúc ghi, chứ không phải đi dọn sau.
 *
 * Quy tắc: nếu tag gửi lên khớp với một tag ĐÃ CÓ sau khi bỏ dấu/hoa-thường/
 * khoảng trắng, thì lưu bằng chính cách viết đang có. Tag mới hoàn toàn thì giữ
 * nguyên như người viết gõ — không tự bịa ra cách viết khác.
 */

/**
 * Khoá so sánh của một tag: bỏ dấu tiếng Việt, hoa/thường, và MỌI ký tự không
 * phải chữ-số kể cả khoảng trắng.
 *
 * Bỏ cả khoảng trắng là cố ý: tag là ĐỊNH DANH chứ không phải câu, nên "Open AI"
 * và "OpenAI", "A I" và "AI" là cùng một thứ. Giữ khoảng trắng thì chúng thành
 * hai tag khác nhau — đúng cái kiểu phân tán cần dẹp.
 */
export function foldTag(s: string): string {
  return String(s ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/đ/g, "d")
    .replace(/[^a-z0-9]+/g, "");
}

export function canonicalizeTags(incoming: string[], existing: string[]): string[] {
  // Cách viết đang dùng cho mỗi dạng đã bỏ dấu.
  const known = new Map<string, string>();
  for (const e of existing) {
    const key = foldTag(e);
    if (key && !known.has(key)) known.set(key, e);
  }

  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of incoming) {
    const tag = String(raw ?? "").trim().replace(/\s+/g, " ");
    const key = foldTag(tag);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(known.get(key) ?? tag);
  }
  return out;
}
