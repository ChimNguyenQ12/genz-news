"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type { Article, CategorySlug, SourceRef } from "@/lib/types";
import type { Role } from "@/lib/users";
import { categories } from "@/lib/data";
import BackToTopButton from "@/components/BackToTopButton";
import RichTextEditor from "./RichTextEditor";

const STATUS_LABEL: Record<Article["status"], string> = {
  draft: "Draft",
  pending: "In review",
  published: "Live",
  rejected: "Sent back",
};

const STATUS_STYLE: Record<Article["status"], string> = {
  draft: "bg-neutral-500/10 text-neutral-500",
  pending: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  published: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  rejected: "bg-red-500/10 text-red-600 dark:text-red-400",
};

export default function ArticleEditor({
  article,
  role,
  baseRoute,
}: {
  article: Article;
  role: Role;
  baseRoute?: string;
}) {
  const router = useRouter();
  const isAdmin = role === "admin";
  const base = baseRoute ?? (isAdmin ? "/admin" : "/dashboard");

  const [title, setTitle] = useState(article.title);
  const [slug, setSlug] = useState(article.slug);
  const [dek, setDek] = useState(article.dek);
  const [category, setCategory] = useState<CategorySlug>(article.category);
  const [author, setAuthor] = useState(article.author);
  const [publishedAt, setPublishedAt] = useState(article.publishedAt);
  const [readingTimeMin, setReadingTimeMin] = useState(article.readingTimeMin);
  const [tags, setTags] = useState(article.tags.join(", "));
  const [bodyHtml, setBodyHtml] = useState(article.body);
  const [sources, setSources] = useState<SourceRef[]>(article.sources);
  const [coverFrom, setCoverFrom] = useState(article.coverGradient[0]);
  const [coverTo, setCoverTo] = useState(article.coverGradient[1]);
  const [coverImage, setCoverImage] = useState(article.coverImage ?? "");
  const [coverCaption, setCoverCaption] = useState(article.coverImageCaption ?? "");
  const [coverUploading, setCoverUploading] = useState(false);
  const [coverError, setCoverError] = useState("");
  const coverInput = useRef<HTMLInputElement>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  const plainText = bodyHtml.replace(/<[^>]*>/g, " ");
  const wordCount = plainText.split(/\s+/).filter(Boolean).length;
  const suggestedTime = Math.max(1, Math.round(wordCount / 200));
  const mediaCount = (bodyHtml.match(/<(img|iframe|video)\b/g) ?? []).length;

  async function uploadCover(file: File) {
    setCoverUploading(true);
    setCoverError("");
    const form = new FormData();
    form.append("file", file);
    const res = await fetch("/api/upload", { method: "POST", body: form });
    setCoverUploading(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setCoverError(data.error ?? "Upload failed.");
      return;
    }
    const { url } = await res.json();
    setCoverImage(url);
  }

  function payload(status?: Article["status"]) {
    return {
      title,
      slug,
      dek,
      category,
      language: "vi",
      author,
      publishedAt,
      readingTimeMin,
      tags: tags.split(",").map((t) => t.trim()).filter(Boolean),
      body: bodyHtml,
      sources: sources.filter((s) => s.url.trim()),
      coverGradient: [coverFrom, coverTo],
      coverImage: coverImage.trim(),
      coverImageCaption: coverCaption.trim(),
      ...(status ? { status } : {}),
    };
  }

  // Ảnh chụp trạng thái đã lưu — dùng để biết còn thay đổi nào chưa lưu không.
  const [savedSnapshot, setSavedSnapshot] = useState(() => JSON.stringify(payload()));
  const currentSnapshot = JSON.stringify(payload());
  const isDirty = currentSnapshot !== savedSnapshot;

  // Cảnh báo khi rời trang mà chưa lưu.
  useEffect(() => {
    if (!isDirty) return;
    const handler = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [isDirty]);

  async function save(status?: Article["status"]) {
    setSaving(true);
    setMessage("");
    const res = await fetch(`/api/articles/${article.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload(status)),
    });
    setSaving(false);
    if (res.ok) {
      setSavedSnapshot(JSON.stringify(payload()));
      setMessage(
        status === "published"
          ? "Article published."
          : status === "pending"
            ? "Submitted for review."
            : status === "draft"
              ? "Moved back to draft."
              : "Changes saved.",
      );
      if (status === "pending") router.push(base);
      else router.refresh();
    } else {
      const data = await res.json().catch(() => ({}));
      setMessage(data.error ?? "Save failed.");
    }
  }

  return (
    <div>
      <div className="sticky top-0 z-30 -mx-3 mb-5 flex flex-wrap items-center justify-between gap-3 border-b border-border bg-background/95 px-3 py-3 backdrop-blur sm:static sm:mx-0 sm:mb-6 sm:border-0 sm:bg-transparent sm:p-0">
        <Link href={base} className="text-sm font-semibold text-muted hover:text-accent">
          ← All articles
        </Link>
        <div className="grid w-full grid-cols-2 items-center gap-2 sm:flex sm:w-auto sm:flex-wrap">
          {message && !isDirty && (
            <span className="text-sm text-emerald-600 dark:text-emerald-400">
              {message}
            </span>
          )}
          <span
            className={`rounded-full px-3 py-1 text-xs font-bold ${STATUS_STYLE[article.status]}`}
          >
            {STATUS_LABEL[article.status]}
          </span>

          {isDirty && (
            <span className="rounded-full bg-amber-500/10 px-3 py-1 text-xs font-bold text-amber-600 dark:text-amber-400">
              ● Unsaved
            </span>
          )}

          <button
            onClick={() => save()}
            disabled={saving || !isDirty}
            title={
              isDirty
                ? "Save changes, keep the current published/draft state"
                : "Nothing to save"
            }
            className="w-full rounded-xl border border-border px-3 py-2 text-sm font-bold transition hover:border-accent hover:text-accent disabled:cursor-not-allowed disabled:opacity-40 sm:w-auto sm:px-4"
          >
            {saving ? "Saving..." : isDirty ? "Save changes" : "Saved"}
          </button>

          {isAdmin ? (
            article.status === "published" ? (
              <button
                onClick={() => save("draft")}
                disabled={saving}
                className="w-full rounded-xl border border-border px-3 py-2 text-sm font-bold transition hover:border-amber-500 hover:text-amber-500 disabled:opacity-50 sm:w-auto sm:px-4"
              >
                Unpublish
              </button>
            ) : (
              <button
                onClick={() => save("published")}
                disabled={saving}
                className="w-full rounded-xl bg-emerald-600 px-3 py-2 text-sm font-bold text-white transition hover:opacity-90 disabled:opacity-50 sm:w-auto sm:px-4"
              >
                Publish
              </button>
            )
          ) : (
            <button
              onClick={() => save("pending")}
              disabled={saving}
              title="Send this article for review"
              className="w-full rounded-xl bg-amber-600 px-3 py-2 text-sm font-bold text-white transition hover:opacity-90 disabled:opacity-50 sm:w-auto sm:px-4"
            >
              Submit
            </button>
          )}
        </div>
      </div>

      {article.status === "rejected" && article.reviewNote && (
        <div className="mb-5 rounded-2xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-600 dark:text-red-400">
          <strong>Sent back:</strong> {article.reviewNote}
          <p className="mt-1 text-red-600/80 dark:text-red-400/80">
            Fix it up, then hit “Submit” again.
          </p>
        </div>
      )}

      {article.status === "pending" && !isAdmin && (
        <div className="mb-5 rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-700 dark:text-amber-400">
          This article is in review and locked. To edit it, go back to the list and
          hit <strong>Back to draft</strong>.
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Field label="Headline">
            <textarea
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              rows={2}
              className="w-full resize-none rounded-xl border border-border bg-surface px-4 py-2.5 font-display text-xl font-black outline-none focus:border-accent"
            />
          </Field>

          <Field label="Dek" hint="One sentence with the freshest point — do not repeat the headline">
            <textarea
              value={dek}
              onChange={(e) => setDek(e.target.value)}
              rows={2}
              className="w-full resize-none rounded-xl border border-border bg-surface px-4 py-2.5 text-sm outline-none focus:border-accent"
            />
          </Field>

          <Field
            label="Nội dung"
            hint={`${mediaCount} media · ~${wordCount} words · ~${suggestedTime} min read`}
          >
            <RichTextEditor value={bodyHtml} onChange={setBodyHtml} />
            {suggestedTime !== readingTimeMin && (
              <button
                type="button"
                onClick={() => setReadingTimeMin(suggestedTime)}
                className="mt-2 text-xs font-semibold text-accent hover:underline"
              >
                Set reading time to {suggestedTime} min
              </button>
            )}
          </Field>

          <Field label="Sources" hint="Required for a round-up — at least 2 independent outlets">
            <div className="space-y-2">
              {sources.map((s, i) => (
                <div key={i} className="flex flex-col gap-2 sm:flex-row">
                  <input
                    value={s.name}
                    onChange={(e) => {
                      const next = [...sources];
                      next[i] = { ...next[i], name: e.target.value };
                      setSources(next);
                    }}
                    placeholder="Outlet name"
                    className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-accent sm:w-40 sm:shrink-0"
                  />
                  <input
                    value={s.url}
                    onChange={(e) => {
                      const next = [...sources];
                      next[i] = { ...next[i], url: e.target.value };
                      setSources(next);
                    }}
                    placeholder="https://..."
                    className="min-w-0 flex-1 rounded-xl border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-accent"
                  />
                  <button
                    onClick={() => setSources(sources.filter((_, j) => j !== i))}
                    className="self-end rounded-xl border border-border px-3 py-2 text-sm text-red-500 hover:border-red-500 sm:self-auto"
                  >
                    ✕
                  </button>
                </div>
              ))}
              <button
                onClick={() => setSources([...sources, { name: "", url: "" }])}
                className="rounded-xl border border-dashed border-border px-3 py-2 text-sm font-semibold text-muted hover:border-accent hover:text-accent"
              >
                + Add source
              </button>
            </div>
          </Field>
        </div>

        <div className="space-y-4">
          <Field label="Section">
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value as CategorySlug)}
              className="w-full rounded-xl border border-border bg-surface px-4 py-2.5 text-sm outline-none focus:border-accent"
            >
              {categories.map((c) => (
                <option key={c.slug} value={c.slug}>
                  {c.name}
                </option>
              ))}
            </select>
          </Field>

          {isAdmin && (
            <>
              <Field label="Slug">
                <input
                  value={slug}
                  onChange={(e) => setSlug(e.target.value)}
                  className="w-full rounded-xl border border-border bg-surface px-4 py-2.5 text-sm outline-none focus:border-accent"
                />
              </Field>

              <Field label="Author">
                <input
                  value={author}
                  onChange={(e) => setAuthor(e.target.value)}
                  className="w-full rounded-xl border border-border bg-surface px-4 py-2.5 text-sm outline-none focus:border-accent"
                />
              </Field>
            </>
          )}

          <div className="grid grid-cols-2 gap-3">
            <Field label="Publish date">
              <input
                type="date"
                value={publishedAt}
                onChange={(e) => setPublishedAt(e.target.value)}
                className="w-full rounded-xl border border-border bg-surface px-3 py-2.5 text-sm outline-none focus:border-accent"
              />
            </Field>
            <Field label="Read time (min)">
              <input
                type="number"
                min={1}
                value={readingTimeMin}
                onChange={(e) => setReadingTimeMin(Number(e.target.value))}
                className="w-full rounded-xl border border-border bg-surface px-3 py-2.5 text-sm outline-none focus:border-accent"
              />
            </Field>
          </div>

          <Field label="Tags" hint="Separate with commas">
            <input
              value={tags}
              onChange={(e) => setTags(e.target.value)}
              className="w-full rounded-xl border border-border bg-surface px-4 py-2.5 text-sm outline-none focus:border-accent"
            />
          </Field>

          <Field label="Cover image" hint="Leave empty to use a gradient">
            {coverImage ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={coverImage}
                alt=""
                className="mb-2 h-28 w-full rounded-xl bg-surface-2 object-cover"
              />
            ) : (
              <div
                className="mb-2 h-28 w-full rounded-xl"
                style={{
                  background: `linear-gradient(135deg, ${coverFrom}, ${coverTo})`,
                }}
              />
            )}

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => coverInput.current?.click()}
                disabled={coverUploading}
                className="flex-1 rounded-xl bg-accent px-3 py-2 text-xs font-bold text-white transition hover:opacity-90 disabled:opacity-50"
              >
                {coverUploading ? "Uploading..." : "Upload image"}
              </button>
              {coverImage && (
                <button
                  type="button"
                  onClick={() => {
                    setCoverImage("");
                    setCoverCaption("");
                  }}
                  className="rounded-xl border border-border px-3 py-2 text-xs font-semibold text-red-500 hover:border-red-500"
                >
                  Remove
                </button>
              )}
            </div>
            <input
              ref={coverInput}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) uploadCover(file);
                e.target.value = "";
              }}
            />

            {coverError && (
              <p className="mt-2 text-xs text-red-500">{coverError}</p>
            )}

            <input
              value={coverImage}
              onChange={(e) => setCoverImage(e.target.value)}
              placeholder="or paste an image URL"
              className="mt-2 w-full rounded-xl border border-border bg-surface px-3 py-2 text-xs outline-none focus:border-accent"
            />

            {coverImage && (
              <input
                value={coverCaption}
                onChange={(e) => setCoverCaption(e.target.value)}
                placeholder="Image caption and credit"
                className="mt-2 w-full rounded-xl border border-border bg-surface px-3 py-2 text-xs outline-none focus:border-accent"
              />
            )}

            <div className="mt-2 flex gap-2">
              <input
                type="color"
                value={coverFrom}
                onChange={(e) => setCoverFrom(e.target.value)}
                className="h-9 w-full cursor-pointer rounded-lg border border-border bg-surface"
              />
              <input
                type="color"
                value={coverTo}
                onChange={(e) => setCoverTo(e.target.value)}
                className="h-9 w-full cursor-pointer rounded-lg border border-border bg-surface"
              />
            </div>
          </Field>

          {isAdmin && (article.featuredOrder != null || article.trendingOrder != null) && (
            <Field label="Placement">
              <p className="text-xs text-muted">
                {article.featuredOrder != null && `On the home page hero at #${article.featuredOrder}. `}
                {article.trendingOrder != null && `In Trending at #${article.trendingOrder}. `}
                Manage this on{" "}
                <Link href="/admin/homepage" className="font-semibold text-accent hover:underline">
                  the Homepage page
                </Link>
                .
              </p>
            </Field>
          )}
        </div>
      </div>
      <BackToTopButton />
    </div>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="mb-1.5 flex flex-col items-start gap-0.5 sm:flex-row sm:items-baseline sm:justify-between sm:gap-2">
        <label className="text-xs font-bold uppercase tracking-wide text-muted">
          {label}
        </label>
        {hint && <span className="text-xs text-muted">{hint}</span>}
      </div>
      {children}
    </div>
  );
}
