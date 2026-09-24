"use client";

import { useEffect, useState, useMemo } from "react";
import Link from "next/link";

interface FacebookPost {
  id: string;
  articleId: string;
  fbPostId: string;
  fbCommentId?: string | null;
  customCaption?: string | null;
  customComment?: string | null;
  postedAt: string;
}

interface Article {
  id: string;
  slug: string;
  title: string;
  dek: string;
  category: string;
  tags: string[];
  coverImage?: string;
  author: string;
  publishedAt: string;
  createdAt: string;
  facebookPost?: FacebookPost | null;
}

export default function FacebookAdminPage() {
  const [articles, setArticles] = useState<Article[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | "posted" | "unposted">("all");
  const [publishingToday, setPublishingToday] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // State cho Modal chỉnh sửa & đăng bài
  const [selectedArticle, setSelectedArticle] = useState<Article | null>(null);
  const [caption, setCaption] = useState("");
  const [comment, setComment] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const fetchArticles = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/facebook");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Không thể tải danh sách bài viết");
      setArticles(data.articles || []);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchArticles();
  }, []);

  // Thông báo Toast tự tắt
  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 4000);
  };

  // Mở modal chỉnh sửa
  const openEditModal = (article: Article) => {
    setSelectedArticle(article);
    // Nếu có caption đã đăng trước đó thì dùng lại, không thì tạo caption mặc định
    const defaultCaption = article.facebookPost?.customCaption || generateDefaultCaption(article);
    const defaultComment =
      article.facebookPost?.customComment ||
      `👉 Đọc đầy đủ bài viết và thảo luận thêm tại: https://genz-news.site/bai-viet/${article.slug}`;

    setCaption(defaultCaption);
    setComment(defaultComment);
  };

  const closeModal = () => {
    setSelectedArticle(null);
    setCaption("");
    setComment("");
  };

  // Tạo caption chuẩn phong cách Gen Z
  const generateDefaultCaption = (article: Article): string => {
    const hashtags = [
      "#GenZNews",
      `#${article.category.replace(/[\s-]+/g, "")}`,
      ...article.tags.slice(0, 4).map((t) => `#${t.replace(/[\s-]+/g, "")}`),
    ]
      .filter(Boolean)
      .join(" ");

    return [
      `⚡ ${article.title.toUpperCase()}`,
      "",
      article.dek ? `📌 ${article.dek}` : "",
      "",
      "👇 Chi tiết bài viết và nguồn trích dẫn được cập nhật ở bình luận bên dưới!",
      "",
      hashtags,
    ].join("\n").trim();
  };

  // Thực hiện đăng bài cụ thể
  const handlePublishSingle = async (articleId: string, customCap?: string, customCmt?: string) => {
    setSubmitting(true);
    try {
      const res = await fetch("/api/admin/facebook/post", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          articleId,
          customCaption: customCap,
          customComment: customCmt,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Đăng bài thất bại");

      showToast(`🎉 ${data.message}`);
      closeModal();
      await fetchArticles();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      alert(`Lỗi đăng bài: ${msg}`);
    } finally {
      setSubmitting(false);
    }
  };

  // Thực hiện tự động đăng tất cả bài hôm nay
  const handlePublishTodayBatch = async () => {
    if (!confirm("Bạn có chắc muốn tự động xuất bản tất cả bài mới hôm nay lên Facebook Fanpage?")) return;
    setPublishingToday(true);
    try {
      const res = await fetch("/api/admin/facebook/publish-today", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ limit: 4 }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Tự động đăng bài thất bại");

      showToast(`🚀 ${data.message}`);
      await fetchArticles();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      alert(`Lỗi: ${msg}`);
    } finally {
      setPublishingToday(false);
    }
  };

  // Lọc bài viết
  const filteredArticles = useMemo(() => {
    if (filter === "posted") return articles.filter((a) => !!a.facebookPost);
    if (filter === "unposted") return articles.filter((a) => !a.facebookPost);
    return articles;
  }, [articles, filter]);

  const postedCount = articles.filter((a) => !!a.facebookPost).length;
  const unpostedCount = articles.length - postedCount;

  return (
    <div className="space-y-6 pb-12">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed top-5 right-5 z-50 animate-bounce rounded-xl bg-accent px-5 py-3 text-sm font-bold text-white shadow-2xl">
          {toastMessage}
        </div>
      )}

      {/* Page Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-black tracking-tight text-foreground sm:text-3xl">
            Quản lý Bài Đăng Facebook Fanpage
          </h1>
          <p className="mt-1 text-sm text-muted">
            Theo dõi, chỉnh sửa caption và quản lý xuất bản tin tức tự động lên Fanpage GenZ News
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            onClick={fetchArticles}
            className="rounded-xl border border-border bg-surface px-4 py-2 text-sm font-semibold text-foreground transition hover:bg-surface-2"
          >
            🔄 Làm mới
          </button>
          <button
            onClick={handlePublishTodayBatch}
            disabled={publishingToday}
            className="flex items-center gap-2 rounded-xl bg-accent px-5 py-2 text-sm font-bold text-white shadow-md transition hover:opacity-90 disabled:opacity-50"
          >
            {publishingToday ? "⏳ Đang xuất bản..." : "🚀 Tự động đăng bài hôm nay"}
          </button>
        </div>
      </div>

      {/* Interactive Engagement Strategy Panel */}
      <div className="rounded-2xl border border-accent/20 bg-gradient-to-r from-accent/5 via-surface to-accent/5 p-5 shadow-sm">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-bold text-foreground flex items-center gap-2">
            💡 Chiến Lược Tối Ưu Tương Tác Giờ Vàng
          </h2>
          <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-accent/10 text-accent">
            Gen Z Optimization
          </span>
        </div>
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-4">
          <div className="rounded-xl border border-border/50 bg-surface/80 p-3">
            <div className="text-xs font-bold text-accent">⏰ Khung giờ vàng</div>
            <div className="mt-1 text-sm font-extrabold text-foreground">07:00 | 11:30 | 17:30 | 20:30</div>
            <div className="mt-0.5 text-[11px] text-muted">Đăng 3-4 bài/ngày để đạt reach cao nhất</div>
          </div>

          <div className="rounded-xl border border-border/50 bg-surface/80 p-3">
            <div className="text-xs font-bold text-emerald-500">📌 Chống Penalty Reach</div>
            <div className="mt-1 text-sm font-extrabold text-foreground">Link ở Comment 1</div>
            <div className="mt-0.5 text-[11px] text-muted">Không chèn link ngoài vào caption bài viết</div>
          </div>

          <div className="rounded-xl border border-border/50 bg-surface/80 p-3">
            <div className="text-xs font-bold text-blue-500">⚡ Tone Giả Tưởng Người Thật</div>
            <div className="mt-1 text-sm font-extrabold text-foreground"> headline emoji + dek</div>
            <div className="mt-0.5 text-[11px] text-muted">Tuyệt đối không ghi từ khóa bot/auto/AI</div>
          </div>

          <div className="rounded-xl border border-border/50 bg-surface/80 p-3">
            <div className="text-xs font-bold text-purple-500">🏷️ Hashtags Thương Hiệu</div>
            <div className="mt-1 text-sm font-extrabold text-foreground">#GenZNews #DanhMuc</div>
            <div className="mt-0.5 text-[11px] text-muted">Tối đa 4-5 hashtags ngắn gọn, dễ search</div>
          </div>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="flex items-center gap-2 border-b border-border pb-3">
        <button
          onClick={() => setFilter("all")}
          className={`rounded-lg px-4 py-2 text-sm font-semibold transition ${
            filter === "all" ? "bg-accent text-white" : "bg-surface text-muted hover:bg-surface-2"
          }`}
        >
          Tất cả ({articles.length})
        </button>
        <button
          onClick={() => setFilter("unposted")}
          className={`rounded-lg px-4 py-2 text-sm font-semibold transition ${
            filter === "unposted" ? "bg-amber-500 text-white" : "bg-surface text-muted hover:bg-surface-2"
          }`}
        >
          Chưa đăng FB ({unpostedCount})
        </button>
        <button
          onClick={() => setFilter("posted")}
          className={`rounded-lg px-4 py-2 text-sm font-semibold transition ${
            filter === "posted" ? "bg-emerald-600 text-white" : "bg-surface text-muted hover:bg-surface-2"
          }`}
        >
          Đã đăng FB ({postedCount})
        </button>
      </div>

      {/* Loading & Error States */}
      {loading && (
        <div className="py-12 text-center text-sm text-muted">
          ⏳ Đang tải danh sách bài viết và trạng thái Facebook...
        </div>
      )}

      {error && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-center text-sm font-medium text-red-500">
          ❌ {error}
        </div>
      )}

      {!loading && !error && filteredArticles.length === 0 && (
        <div className="py-12 text-center text-sm text-muted">Không tìm thấy bài viết nào.</div>
      )}

      {/* Article List Table / Cards */}
      {!loading && !error && filteredArticles.length > 0 && (
        <div className="space-y-3">
          {filteredArticles.map((article) => {
            const isPosted = !!article.facebookPost;
            const fbPost = article.facebookPost;

            return (
              <div
                key={article.id}
                className="flex flex-col gap-4 rounded-2xl border border-border bg-surface p-4 transition hover:border-accent/40 md:flex-row md:items-center md:justify-between"
              >
                {/* Article Info */}
                <div className="flex min-w-0 items-start gap-3.5">
                  {article.coverImage ? (
                    <img
                      src={article.coverImage}
                      alt={article.title}
                      className="size-16 shrink-0 rounded-xl object-cover"
                    />
                  ) : (
                    <div className="flex size-16 shrink-0 items-center justify-center rounded-xl bg-surface-2 text-xs font-bold text-muted">
                      No Image
                    </div>
                  )}

                  <div className="min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-md bg-accent/10 px-2 py-0.5 text-xs font-bold text-accent">
                        {article.category}
                      </span>
                      <span className="text-xs text-muted">
                        📅 {article.publishedAt || article.createdAt.slice(0, 10)}
                      </span>
                      {isPosted ? (
                        <span className="rounded-md bg-emerald-500/15 px-2 py-0.5 text-xs font-bold text-emerald-600 dark:text-emerald-400">
                          ✅ Đã đăng FB
                        </span>
                      ) : (
                        <span className="rounded-md bg-amber-500/15 px-2 py-0.5 text-xs font-bold text-amber-600 dark:text-amber-400">
                          ⏳ Chưa đăng FB
                        </span>
                      )}
                    </div>

                    <h3 className="truncate text-base font-bold text-foreground">
                      <Link href={`/bai-viet/${article.slug}`} target="_blank" className="hover:underline">
                        {article.title}
                      </Link>
                    </h3>

                    <p className="line-clamp-1 text-xs text-muted">{article.dek || "Không có tóm tắt ngắn."}</p>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex shrink-0 items-center gap-2 self-end md:self-center">
                  {isPosted && fbPost?.fbPostId && (
                    <a
                      href={`https://facebook.com/${fbPost.fbPostId}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="rounded-xl border border-border px-3 py-1.5 text-xs font-semibold text-foreground transition hover:border-accent hover:text-accent"
                    >
                      🔗 Xem FB ↗
                    </a>
                  )}

                  <button
                    onClick={() => openEditModal(article)}
                    className="rounded-xl border border-border px-3.5 py-1.5 text-xs font-bold text-foreground transition hover:bg-surface-2"
                  >
                    ✏️ {isPosted ? "Sửa & Đăng lại" : "Chỉnh sửa"}
                  </button>

                  <button
                    onClick={() => handlePublishSingle(article.id)}
                    disabled={submitting}
                    className="rounded-xl bg-accent px-4 py-1.5 text-xs font-bold text-white shadow transition hover:opacity-90 disabled:opacity-50"
                  >
                    🚀 {isPosted ? "Đăng lại ngay" : "Đăng ngay"}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Edit & Custom Publish Modal */}
      {selectedArticle && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <div className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-3xl border border-border bg-surface p-6 shadow-2xl">
            <div className="flex items-center justify-between border-b border-border pb-4">
              <div>
                <h2 className="text-xl font-black text-foreground">Soạn Thảo Bài Đăng Facebook</h2>
                <p className="text-xs text-muted">Tùy chỉnh nội dung Caption & Bình luận trước khi xuất bản</p>
              </div>
              <button
                onClick={closeModal}
                className="rounded-lg p-1.5 text-muted transition hover:bg-surface-2 hover:text-foreground"
              >
                ✕
              </button>
            </div>

            <div className="mt-5 grid grid-cols-1 gap-6 lg:grid-cols-2">
              {/* Form Input */}
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-foreground mb-1">⚡ Facebook Caption</label>
                  <textarea
                    rows={8}
                    value={caption}
                    onChange={(e) => setCaption(e.target.value)}
                    className="w-full rounded-xl border border-border bg-surface-2 p-3 text-xs text-foreground focus:border-accent focus:outline-none"
                    placeholder="Nhập caption Facebook tại đây..."
                  />
                  <p className="mt-1 text-[11px] text-muted">
                    Nên dùng emoji ⚡ cho tiêu đề, 📌 chodek ngắn, hashtag thương hiệu bên dưới.
                  </p>
                </div>

                <div>
                  <label className="block text-xs font-bold text-foreground mb-1">
                    💬 Bình Luận Đầu Tiên (Link Bài Viết)
                  </label>
                  <textarea
                    rows={3}
                    value={comment}
                    onChange={(e) => setComment(e.target.value)}
                    className="w-full rounded-xl border border-border bg-surface-2 p-3 text-xs text-foreground focus:border-accent focus:outline-none"
                    placeholder="Bình luận chứa link..."
                  />
                  <p className="mt-1 text-[11px] text-muted">
                    Bình luận này sẽ tự động đăng ngay sau bài viết để giữ link.
                  </p>
                </div>
              </div>

              {/* Live Preview Card */}
              <div className="space-y-2">
                <label className="block text-xs font-bold text-muted uppercase tracking-wider">
                  👁️ Live Facebook Preview
                </label>
                <div className="rounded-2xl border border-border bg-white p-4 font-sans text-black shadow-md dark:bg-zinc-900 dark:text-zinc-100">
                  {/* Header page info */}
                  <div className="flex items-center gap-2.5">
                    <img src="/genz-news-logo.png" alt="GenZ News" className="size-10 rounded-full border" />
                    <div>
                      <div className="text-sm font-bold leading-tight">GenZ News</div>
                      <div className="text-[11px] text-zinc-500 dark:text-zinc-400">Vừa xong · 🌐</div>
                    </div>
                  </div>

                  {/* Caption */}
                  <div className="mt-3 whitespace-pre-wrap text-xs leading-relaxed">
                    {caption || "Nội dung caption sẽ hiển thị tại đây..."}
                  </div>

                  {/* Image Preview */}
                  {selectedArticle.coverImage && (
                    <div className="mt-3 overflow-hidden rounded-xl border border-zinc-200 dark:border-zinc-800">
                      <img
                        src={selectedArticle.coverImage}
                        alt="Cover"
                        className="max-h-48 w-full object-cover"
                      />
                    </div>
                  )}

                  {/* First Comment Mockup */}
                  <div className="mt-4 rounded-xl bg-zinc-100 p-2.5 dark:bg-zinc-800/60">
                    <div className="text-[11px] font-bold text-zinc-500 dark:text-zinc-400 mb-1">
                      💬 Bình luận đầu tiên từ Trang:
                    </div>
                    <div className="text-xs text-blue-600 dark:text-blue-400 break-all font-medium">
                      {comment}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Modal Actions */}
            <div className="mt-6 flex items-center justify-end gap-3 border-t border-border pt-4">
              <button
                onClick={closeModal}
                disabled={submitting}
                className="rounded-xl border border-border px-4 py-2 text-xs font-semibold text-foreground transition hover:bg-surface-2"
              >
                Hủy
              </button>
              <button
                onClick={() => handlePublishSingle(selectedArticle.id, caption, comment)}
                disabled={submitting}
                className="flex items-center gap-2 rounded-xl bg-accent px-6 py-2 text-xs font-bold text-white shadow-lg transition hover:opacity-90 disabled:opacity-50"
              >
                {submitting ? "⏳ Đang gửi lên Facebook..." : "🚀 Đăng Ngay Lên Fanpage"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
