import sanitizeHtml from "sanitize-html";
import type { Block } from "./types";

/**
 * Làm sạch HTML từ trình soạn thảo trước khi lưu.
 * Nội dung do người dùng gửi lên nên bắt buộc phải lọc để chặn XSS.
 */
export function sanitizeArticleHtml(dirty: string): string {
  return sanitizeHtml(dirty, {
    allowedTags: [
      "p", "br", "strong", "em", "u", "s", "code",
      "h2", "h3", "blockquote",
      "ul", "ol", "li",
      "a", "img", "figure", "figcaption",
      "div", "iframe", "hr",
      "video", "source",
    ],
    allowedAttributes: {
      a: ["href", "target", "rel"],
      img: ["src", "alt", "title", "width", "height"],
      iframe: ["src", "allowfullscreen", "allow", "frameborder", "width", "height"],
      video: ["src", "controls", "playsinline", "preload", "poster", "width", "height"],
      source: ["src", "type"],
      div: ["data-youtube-video"],
      p: ["style"],
      h2: ["style"],
      h3: ["style"],
    },
    allowedStyles: {
      "*": { "text-align": [/^left$|^right$|^center$|^justify$/] },
    },
    // Chỉ cho nhúng video từ hai nền tảng này.
    allowedIframeHostnames: ["www.youtube.com", "www.youtube-nocookie.com", "player.vimeo.com"],
    allowedSchemes: ["http", "https", "mailto"],
    // Ảnh/video chỉ lấy từ chính server hoặc https.
    allowedSchemesByTag: {
      img: ["http", "https"],
      video: ["http", "https"],
      source: ["http", "https"],
    },
    transformTags: {
      a: (tagName, attribs) => ({
        tagName,
        attribs: { ...attribs, rel: "noopener noreferrer nofollow", target: "_blank" },
      }),
    },
  });
}

const escapeHtml = (s: string) =>
  s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

/** Chuyển nội dung dạng khối (định dạng cũ) sang HTML. */
export function blocksToHtml(blocks: Block[]): string {
  return blocks
    .map((b) => {
      switch (b.type) {
        case "paragraph":
          return `<p>${escapeHtml(b.text)}</p>`;
        case "heading":
          return `<h2>${escapeHtml(b.text)}</h2>`;
        case "quote":
          return `<blockquote><p>${escapeHtml(b.text)}${
            b.attribution ? ` — ${escapeHtml(b.attribution)}` : ""
          }</p></blockquote>`;
        case "list": {
          const items = b.items.map((i) => `<li>${escapeHtml(i)}</li>`).join("");
          return b.ordered ? `<ol>${items}</ol>` : `<ul>${items}</ul>`;
        }
        case "image": {
          const img = `<img src="${escapeHtml(b.url)}" alt="${escapeHtml(b.caption ?? "")}">`;
          const cap = [b.caption, b.credit ? `Ảnh: ${b.credit.author}` : ""]
            .filter(Boolean)
            .join(" ");
          return cap
            ? `<figure>${img}<figcaption>${escapeHtml(cap)}</figcaption></figure>`
            : `<figure>${img}</figure>`;
        }
        case "video": {
          const src =
            b.provider === "youtube"
              ? `https://www.youtube-nocookie.com/embed/${b.videoId}`
              : `https://player.vimeo.com/video/${b.videoId}`;
          const iframe = `<div data-youtube-video><iframe src="${escapeHtml(src)}" allowfullscreen></iframe></div>`;
          return b.caption
            ? `<figure>${iframe}<figcaption>${escapeHtml(b.caption)}</figcaption></figure>`
            : iframe;
        }
        default:
          return "";
      }
    })
    .join("\n");
}

/**
 * Chuẩn hoá nội dung về HTML.
 * Chấp nhận cả HTML mới lẫn Block[] / string[] của các phiên bản trước.
 */
export function normalizeArticleHtml(input: unknown): string {
  if (typeof input === "string") return sanitizeArticleHtml(input);

  if (Array.isArray(input)) {
    // Định dạng cũ: mảng chuỗi hoặc mảng block.
    if (input.every((i) => typeof i === "string")) {
      return sanitizeArticleHtml(
        (input as string[])
          .filter((t) => t.trim())
          .map((t) => `<p>${escapeHtml(t)}</p>`)
          .join("\n"),
      );
    }
    return sanitizeArticleHtml(blocksToHtml(input as Block[]));
  }

  return "";
}

/** Đếm từ để ước tính thời gian đọc. */
export function countWordsInHtml(html: string) {
  const text = sanitizeHtml(html, { allowedTags: [], allowedAttributes: {} });
  return text.split(/\s+/).filter(Boolean).length;
}

export function estimateReadingTimeFromHtml(html: string) {
  return Math.max(1, Math.round(countWordsInHtml(html) / 200));
}
