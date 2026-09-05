"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ArticleLanguage } from "@/lib/types";

/**
 * Dịch bài ngay trên trình duyệt bằng Translator API có sẵn của Chrome/Edge.
 * Mô hình chạy trên máy người đọc — không gọi server, không tốn phí,
 * và KHÔNG lưu bản dịch. Bấm lần nữa là quay lại bản gốc.
 */

type Availability = "available" | "downloadable" | "downloading" | "unavailable";

interface TranslatorInstance {
  translate(text: string): Promise<string>;
  destroy?: () => void;
}

interface TranslatorApi {
  availability(o: { sourceLanguage: string; targetLanguage: string }): Promise<Availability>;
  create(o: {
    sourceLanguage: string;
    targetLanguage: string;
    monitor?: (m: EventTarget) => void;
  }): Promise<TranslatorInstance>;
}

function getTranslatorApi(): TranslatorApi | null {
  if (typeof window === "undefined") return null;
  const api = (window as unknown as { Translator?: TranslatorApi }).Translator;
  return api ?? null;
}

/**
 * Chặn treo vô hạn: một số môi trường có sẵn API nhưng không tải được mô hình,
 * khiến create()/translate() không bao giờ trả về.
 */
function withTimeout<T>(p: Promise<T>, ms: number, message: string): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error(message)), ms)),
  ]);
}

const CREATE_TIMEOUT_MS = 45_000;
const TRANSLATE_TIMEOUT_MS = 20_000;

const LABEL: Record<ArticleLanguage, { to: string; back: string; target: string }> = {
  en: { to: "Dịch sang tiếng Việt", back: "Xem bản gốc (English)", target: "vi" },
  vi: { to: "Translate to English", back: "Xem bản gốc (Tiếng Việt)", target: "en" },
};

export default function TranslateButton({
  language,
  targetSelector,
}: {
  /** Ngôn ngữ gốc của bài. */
  language: ArticleLanguage;
  /** Vùng chứa nội dung cần dịch. */
  targetSelector: string;
}) {
  const [supported, setSupported] = useState<boolean | null>(null);
  const [translated, setTranslated] = useState(false);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState("");

  /** Văn bản gốc của từng text node, để khôi phục khi bấm lại. */
  const originals = useRef<{ node: Text; text: string }[]>([]);

  const label = LABEL[language];

  // Chỉ kiểm tra trình duyệt có API hay không. Việc tải mô hình / kiểm tra cặp
  // ngôn ngữ để lúc bấm nút mới làm — tránh trường hợp availability() treo
  // khiến nút không bao giờ hiện ra.
  useEffect(() => {
    let cancelled = false;
    Promise.resolve().then(() => {
      if (!cancelled) setSupported(getTranslatorApi() !== null);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const collectTextNodes = useCallback(() => {
    const nodes: Text[] = [];
    // targetSelector có thể là nhiều vùng, ngăn nhau bằng dấu phẩy.
    for (const root of document.querySelectorAll(targetSelector)) {
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
        acceptNode(node) {
          if (!node.nodeValue?.trim()) return NodeFilter.FILTER_REJECT;
          const parent = node.parentElement;
          if (!parent) return NodeFilter.FILTER_REJECT;
          // Bỏ qua code và phần đã đánh dấu không dịch.
          if (parent.closest("code, pre, [data-no-translate]")) {
            return NodeFilter.FILTER_REJECT;
          }
          return NodeFilter.FILTER_ACCEPT;
        },
      });
      let n = walker.nextNode();
      while (n) {
        nodes.push(n as Text);
        n = walker.nextNode();
      }
    }
    return nodes;
  }, [targetSelector]);

  async function toggle() {
    setError("");

    // Quay lại bản gốc.
    if (translated) {
      for (const { node, text } of originals.current) node.nodeValue = text;
      originals.current = [];
      setTranslated(false);
      return;
    }

    const api = getTranslatorApi();
    if (!api) {
      setError("Trình duyệt chưa hỗ trợ dịch. Dùng Chrome hoặc Edge bản mới.");
      return;
    }

    setBusy(true);
    try {
      const availability = await withTimeout(
        api.availability({
          sourceLanguage: language,
          targetLanguage: label.target,
        }),
        10_000,
        "Trình duyệt không phản hồi khi kiểm tra khả năng dịch.",
      );
      if (availability === "unavailable") {
        setError(
          `Trình duyệt chưa hỗ trợ cặp ngôn ngữ ${language.toUpperCase()} → ${label.target.toUpperCase()}.`,
        );
        setBusy(false);
        return;
      }

      const translator = await withTimeout(
        api.create({
          sourceLanguage: language,
          targetLanguage: label.target,
          monitor(m) {
            m.addEventListener("downloadprogress", (e) => {
              const ev = e as Event & { loaded?: number };
              if (typeof ev.loaded === "number") setProgress(Math.round(ev.loaded * 100));
            });
          },
        }),
        CREATE_TIMEOUT_MS,
        "Quá lâu khi chuẩn bị mô hình dịch. Mô hình có thể đang tải — thử lại sau.",
      );
      setProgress(null);

      const nodes = collectTextNodes();
      const saved: { node: Text; text: string }[] = [];
      let changed = 0;
      let failed = 0;
      let firstFailure = "";

      // Dịch tuần tự từng đoạn văn bản để giữ nguyên bố cục HTML.
      for (const node of nodes) {
        const text = node.nodeValue ?? "";
        saved.push({ node, text });
        try {
          const out = await withTimeout(
            translator.translate(text),
            TRANSLATE_TIMEOUT_MS,
            "Quá lâu khi dịch một đoạn.",
          );
          node.nodeValue = out;
          if (out !== text) changed++;
        } catch (e) {
          // Đoạn lỗi thì giữ nguyên chữ, nhưng vẫn phải đếm để báo cho người đọc.
          failed++;
          if (!firstFailure) firstFailure = String(e).slice(0, 120);
        }
      }

      translator.destroy?.();

      // Không đoạn nào dịch được thì đừng giả vờ là đã dịch.
      if (changed === 0) {
        for (const { node, text } of saved) node.nodeValue = text;
        setError(
          failed > 0
            ? `Không dịch được (${failed} đoạn lỗi). ${firstFailure}`
            : "Trình duyệt chưa tải xong mô hình dịch. Thử lại sau ít phút.",
        );
        return;
      }

      originals.current = saved;
      setTranslated(true);
      if (failed > 0) {
        setError(`Có ${failed} đoạn không dịch được, vẫn giữ nguyên bản gốc.`);
      }
    } catch (e) {
      setError(
        e instanceof Error && e.message
          ? e.message
          : "Không dịch được. Thử tải lại trang.",
      );
    } finally {
      setBusy(false);
      setProgress(null);
    }
  }

  // Chưa biết trình duyệt có hỗ trợ không thì chưa hiện gì.
  if (supported === null) return null;

  if (!supported) {
    return (
      <p className="mt-3 text-xs text-muted">
        Trình duyệt này chưa hỗ trợ dịch tại chỗ. Mở bằng Chrome hoặc Edge bản mới để
        dùng.
      </p>
    );
  }

  return (
    <div className="mt-3">
      <button
        onClick={toggle}
        disabled={busy}
        className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface px-3.5 py-1.5 text-xs font-bold transition hover:border-accent hover:text-accent disabled:opacity-50"
      >
        <span aria-hidden>🌐</span>
        {busy
          ? progress !== null
            ? `Đang tải mô hình ${progress}%`
            : "Đang dịch..."
          : translated
            ? label.back
            : label.to}
      </button>
      {translated && !busy && (
        <span className="ml-2 text-xs text-muted">Bản dịch máy, chỉ để tham khảo.</span>
      )}
      {error && <p className="mt-2 text-xs text-red-500">{error}</p>}
    </div>
  );
}
