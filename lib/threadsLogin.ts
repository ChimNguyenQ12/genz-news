import crypto from "crypto";
import type { Browser, BrowserContext, Page } from "playwright-core";
import { writeThreadsSession, type StoredCookie } from "@/lib/threadsSession";

/**
 * Đăng nhập threads.com bằng một trình duyệt Chromium chạy ngầm, rồi lấy cookie
 * phiên lưu lại (lib/threadsSession.ts) cho bước research của collect-trends.
 *
 * Vì sao dùng trình duyệt thật chứ không gọi thẳng API đăng nhập: API đó không
 * công khai, đòi mã hoá mật khẩu theo khoá của Meta và đổi liên tục. Điền đúng
 * form như người dùng thì chỉ phụ thuộc vào việc trang có ô mật khẩu.
 *
 * Mật khẩu chỉ đi qua bộ nhớ trong lượt này, không ghi ở đâu, không log.
 *
 * Nếu Threads hỏi mã xác minh (2FA, mã gửi email/SMS), trình duyệt được GIỮ
 * MỞ tối đa CODE_TTL_MS trong bộ nhớ, chờ admin gõ mã vào màn hình.
 */

const LOGIN_URL = process.env.THREADS_LOGIN_URL ?? "https://www.threads.com/login";
/** Cookie của chính trang đăng nhập (đổi được khi chạy thử với trang giả). */
const LOGIN_HOST = new URL(LOGIN_URL).hostname;
const BROWSER_PATH = process.env.THREADS_BROWSER_PATH ?? "/usr/bin/chromium";
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";

/** Chờ kết quả sau mỗi lần bấm đăng nhập / gửi mã. */
const WAIT_MS = 30_000;
/** Giữ trình duyệt chờ mã xác minh bao lâu. */
const CODE_TTL_MS = 5 * 60_000;

const CODE_INPUT =
  'input[autocomplete="one-time-code"], input[name="verificationCode"], input[name="security_code"], input[inputmode="numeric"]';

export type LoginResult =
  | { state: "ok"; username: string }
  | { state: "code"; flowId: string; message: string }
  | { state: "error"; message: string };

interface PendingFlow {
  browser: Browser;
  context: BrowserContext;
  page: Page;
  username: string;
  timer: ReturnType<typeof setTimeout>;
}

const g = globalThis as unknown as { __genzThreadsFlows?: Map<string, PendingFlow> };
const flows: Map<string, PendingFlow> = (g.__genzThreadsFlows ??= new Map());

async function closeFlow(id: string) {
  const f = flows.get(id);
  if (!f) return;
  flows.delete(id);
  clearTimeout(f.timer);
  await f.browser.close().catch(() => {});
}

async function sessionCookies(context: BrowserContext): Promise<StoredCookie[] | null> {
  const all = await context.cookies();
  if (!all.some((c) => c.name === "sessionid" && c.value)) return null;
  return all
    .filter((c) => /threads\.(com|net)|instagram\.com/.test(c.domain) || c.domain.replace(/^\./, "") === LOGIN_HOST)
    .map((c) => ({ name: c.name, value: c.value, domain: c.domain, path: c.path, expires: c.expires }));
}

/** Đọc dòng báo lỗi trên form (sai mật khẩu…), nếu trang có hiện. */
async function visibleError(page: Page): Promise<string> {
  for (const sel of ['[role="alert"]', '[id*="error" i]', '[data-testid*="error" i]']) {
    const el = page.locator(sel).first();
    if (await el.isVisible().catch(() => false)) {
      const text = (await el.innerText().catch(() => "")).trim();
      if (text) return text.slice(0, 300);
    }
  }
  return "";
}

/**
 * Chờ một trong ba kết cục: có cookie phiên (xong), trang hỏi mã (2FA), hoặc
 * trang báo lỗi. Hết giờ mà không ra gì thì coi là lỗi.
 */
async function waitOutcome(
  flowId: string,
  f: Omit<PendingFlow, "timer">,
  /** Vừa gửi mã: đang ở trang hỏi mã là chuyện bình thường, chỉ chờ cookie hoặc lỗi. */
  afterCode = false,
): Promise<LoginResult> {
  const deadline = Date.now() + WAIT_MS;
  // Cho trang kịp chuyển sau khi bấm Enter — không thì vòng dưới nhìn thấy
  // đúng trang cũ và kết luận sai (VD "vẫn đang hỏi mã").
  await f.page.waitForLoadState("domcontentloaded").catch(() => {});
  await f.page.waitForTimeout(1500);
  while (Date.now() < deadline) {
    const cookies = await sessionCookies(f.context);
    if (cookies) {
      writeThreadsSession({
        username: f.username,
        cookies,
        savedAt: new Date().toISOString(),
        method: "login",
        lastCheck: { at: new Date().toISOString(), ok: true, message: "Vừa đăng nhập" },
      });
      await f.browser.close().catch(() => {});
      return { state: "ok", username: f.username };
    }

    const url = f.page.url();
    const err = await visibleError(f.page);
    const needsCode =
      /two_factor|checkpoint|challenge|codeentry|confirm/i.test(url) ||
      (await f.page.locator(CODE_INPUT).first().isVisible().catch(() => false));

    // Gõ sai mã: Threads ở lại trang hỏi mã kèm dòng báo lỗi. Giữ trình duyệt
    // mở để gõ lại, khỏi phải nhập mật khẩu từ đầu.
    if (afterCode && needsCode && err) {
      const timer = setTimeout(() => void closeFlow(flowId), CODE_TTL_MS);
      timer.unref?.();
      flows.set(flowId, { ...f, timer });
      return { state: "code", flowId, message: `Threads báo: ${err} — nhập lại mã.` };
    }

    if (needsCode && !afterCode) {
      const timer = setTimeout(() => void closeFlow(flowId), CODE_TTL_MS);
      timer.unref?.();
      flows.set(flowId, { ...f, timer });
      const hint = (await f.page.locator("h1, h2, [role='heading']").first().innerText().catch(() => "")).trim();
      return {
        state: "code",
        flowId,
        message: hint || "Threads yêu cầu mã xác minh (2FA / mã gửi qua email hoặc SMS).",
      };
    }

    if (err && !needsCode) {
      await f.browser.close().catch(() => {});
      return { state: "error", message: `Threads báo: ${err}` };
    }
    await f.page.waitForTimeout(750);
  }

  const title = await f.page.title().catch(() => "");
  await f.browser.close().catch(() => {});
  return {
    state: "error",
    message:
      `Không đăng nhập được sau ${WAIT_MS / 1000} giây (trang: "${title || f.page.url()}"). ` +
      "Threads có thể đang chặn đăng nhập tự động — thử lại sau, hoặc dùng cách dán cookie.",
  };
}

export async function startThreadsLogin(username: string, password: string): Promise<LoginResult> {
  let browser: Browser;
  try {
    const { chromium } = await import("playwright-core");
    browser = await chromium.launch({
      executablePath: BROWSER_PATH,
      headless: true,
      // Trong container chạy bằng user thường: sandbox của Chromium cần quyền
      // mà container không có; /dev/shm của Docker mặc định chỉ 64MB.
      args: ["--no-sandbox", "--disable-dev-shm-usage"],
    });
  } catch (err) {
    return {
      state: "error",
      message: `Không mở được trình duyệt Chromium ở ${BROWSER_PATH}: ${(err as Error).message.split("\n")[0]}`,
    };
  }

  try {
    const context = await browser.newContext({ userAgent: UA, locale: "vi-VN", viewport: { width: 1280, height: 900 } });
    const page = await context.newPage();
    await page.goto(LOGIN_URL, { waitUntil: "domcontentloaded", timeout: WAIT_MS });

    // Banner cookie của Meta (ở EU/một số vùng) che mất form.
    for (const label of [/allow all cookies/i, /cho phép tất cả cookie/i, /accept all/i]) {
      const btn = page.getByRole("button", { name: label }).first();
      if (await btn.isVisible().catch(() => false)) await btn.click().catch(() => {});
    }

    const pass = page.locator('input[type="password"]').first();
    await pass.waitFor({ state: "visible", timeout: WAIT_MS });
    const user = page
      .locator('input[autocomplete="username"], input[type="text"], input[type="email"], input:not([type])')
      .first();
    await user.fill(username);
    await pass.fill(password);
    await pass.press("Enter");

    return await waitOutcome(crypto.randomUUID(), { browser, context, page, username });
  } catch (err) {
    await browser.close().catch(() => {});
    return {
      state: "error",
      message: `Trang đăng nhập Threads không như mong đợi: ${(err as Error).message.split("\n")[0]}`,
    };
  }
}

export async function submitThreadsCode(flowId: string, code: string): Promise<LoginResult> {
  const f = flows.get(flowId);
  if (!f) return { state: "error", message: "Phiên chờ mã đã hết hạn (5 phút). Đăng nhập lại từ đầu." };
  flows.delete(flowId);
  clearTimeout(f.timer);
  try {
    const input = f.page.locator(CODE_INPUT).first();
    if (await input.isVisible().catch(() => false)) {
      await input.fill(code, { timeout: 5000 });
    } else {
      // Không nhận ra ô mã theo thuộc tính: điền vào ô nhập đầu tiên đang hiện.
      await f.page.locator("input:visible").first().fill(code, { timeout: 5000 });
    }
    await f.page.keyboard.press("Enter");
    return await waitOutcome(flowId, f, true);
  } catch (err) {
    await f.browser.close().catch(() => {});
    return { state: "error", message: `Không gửi được mã: ${(err as Error).message.split("\n")[0]}` };
  }
}
