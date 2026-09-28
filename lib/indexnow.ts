/**
 * IndexNow — báo thẳng cho Bing, Yandex, Seznam, Naver biết URL vừa đăng.
 *
 * Vì sao cần: Google KHÔNG dùng IndexNow, nhưng Bing thì có — và Bing nuôi
 * ChatGPT/Copilot search, DuckDuckGo, Yahoo. Toà soạn đăng tới 6 bài mỗi ngày;
 * chờ bot tự quét thì bài mới mất vài ngày mới vào chỉ mục, còn cách này tính
 * bằng phút.
 *
 * Khoá KHÔNG phải bí mật, cố tình công khai: máy tìm kiếm phải tải được nó ở
 * /<khoá>.txt để đối chiếu — đó chính là cách chứng minh mình làm chủ tên miền.
 * Khoá nằm ở HAI chỗ và phải khớp nhau: hằng số dưới đây và
 * `public/<khoá>.txt`.
 */

export const INDEXNOW_KEY = "9f4c1d7e2a6b8c3f5e0d9a4b7c1e6f28";

const BASE_URL =
  process.env.NEXT_PUBLIC_BASE_URL ?? "https://genz-news.site";

const ENDPOINT = "https://api.indexnow.org/indexnow";
const MAX_URLS = 10000;

/** Chỉ gửi khi thật sự đang chạy trên tên miền thật (bỏ qua localhost, http). */
function isRealSite(url: string): boolean {
  try {
    const x = new URL(url);
    return (
      x.protocol === "https:" &&
      !/^(localhost|127\.|0\.0\.0\.0|\[::1\])/.test(x.hostname)
    );
  } catch {
    return false;
  }
}

/**
 * Gửi danh sách URL cho IndexNow.
 *
 * KHÔNG bao giờ ném lỗi: đăng bài không được phép hỏng chỉ vì máy tìm kiếm
 * không trả lời. Trả về true/false để nơi gọi muốn ghi log thì ghi.
 */
export async function pingIndexNow(urls: string[]): Promise<boolean> {
  if (!isRealSite(BASE_URL)) return false;

  const list = [...new Set(urls)]
    .filter((u) => u.startsWith(BASE_URL))
    .slice(0, MAX_URLS);
  if (list.length === 0) return false;

  try {
    const res = await fetch(ENDPOINT, {
      method: "POST",
      headers: { "content-type": "application/json; charset=utf-8" },
      body: JSON.stringify({
        host: new URL(BASE_URL).host,
        key: INDEXNOW_KEY,
        keyLocation: `${BASE_URL}/${INDEXNOW_KEY}.txt`,
        urlList: list,
      }),
      signal: AbortSignal.timeout(8000),
    });
    // 200 = nhận rồi; 202 = khoá đang chờ xác minh lần đầu, vẫn coi là gửi được.
    return res.ok || res.status === 202;
  } catch {
    return false;
  }
}
