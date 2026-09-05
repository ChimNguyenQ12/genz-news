"use client";

import { useCallback, useRef, useState } from "react";
import { EditorContent, useEditor, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Link from "@tiptap/extension-link";
import Image from "@tiptap/extension-image";
import Underline from "@tiptap/extension-underline";
import Youtube from "@tiptap/extension-youtube";
import TextAlign from "@tiptap/extension-text-align";
import { VideoNode } from "./VideoNode";

function ToolbarButton({
  onClick,
  active,
  title,
  children,
  disabled,
}: {
  onClick: () => void;
  active?: boolean;
  title: string;
  children: React.ReactNode;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      disabled={disabled}
      className={`min-w-8 rounded-md px-2 py-1 text-sm font-semibold transition disabled:opacity-30 ${
        active
          ? "bg-accent text-white"
          : "text-foreground/70 hover:bg-surface-2 hover:text-foreground"
      }`}
    >
      {children}
    </button>
  );
}

function Divider() {
  return <span className="mx-1 h-5 w-px shrink-0 bg-border" />;
}

export default function RichTextEditor({
  value,
  onChange,
}: {
  value: string;
  onChange: (html: string) => void;
}) {
  const fileInput = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        heading: { levels: [2, 3] },
        link: false,
      }),
      Underline,
      Link.configure({ openOnClick: false, autolink: true }),
      Image.configure({ inline: false, allowBase64: false }),
      Youtube.configure({ nocookie: true, controls: true, modestBranding: true }),
      TextAlign.configure({ types: ["heading", "paragraph"] }),
      VideoNode,
    ],
    content: value,
    editorProps: {
      attributes: {
        class:
          "prose-editor min-h-[420px] w-full px-4 py-3 text-[15px] leading-relaxed outline-none",
      },
    },
    onUpdate: ({ editor }) => onChange(editor.getHTML()),
  });

  const upload = useCallback(
    async (file: File) => {
      if (!editor) return;
      setUploading(true);
      setUploadError("");

      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/upload", { method: "POST", body: form });
      setUploading(false);

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setUploadError(data.error ?? "Tải lên thất bại");
        return;
      }

      const { url, kind } = await res.json();
      if (kind === "image") {
        editor.chain().focus().setImage({ src: url }).run();
      } else {
        editor.chain().focus().setVideo({ src: url }).run();
      }
    },
    [editor],
  );

  if (!editor) {
    return (
      <div className="rounded-xl border border-border bg-surface p-4 text-sm text-muted">
        Đang tải trình soạn thảo...
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-surface focus-within:border-accent">
      <div className="no-scrollbar flex flex-wrap items-center gap-0.5 border-b border-border px-2 py-1.5">
        <ToolbarButton
          onClick={() => editor.chain().focus().undo().run()}
          disabled={!editor.can().undo()}
          title="Hoàn tác (Ctrl+Z)"
        >
          ↶
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().redo().run()}
          disabled={!editor.can().redo()}
          title="Làm lại (Ctrl+Y)"
        >
          ↷
        </ToolbarButton>

        <Divider />

        <ToolbarButton
          onClick={() => editor.chain().focus().toggleBold().run()}
          active={editor.isActive("bold")}
          title="In đậm (Ctrl+B)"
        >
          <strong>B</strong>
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleItalic().run()}
          active={editor.isActive("italic")}
          title="In nghiêng (Ctrl+I)"
        >
          <em>I</em>
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleUnderline().run()}
          active={editor.isActive("underline")}
          title="Gạch chân (Ctrl+U)"
        >
          <u>U</u>
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleStrike().run()}
          active={editor.isActive("strike")}
          title="Gạch ngang"
        >
          <s>S</s>
        </ToolbarButton>

        <Divider />

        <ToolbarButton
          onClick={() => editor.chain().focus().setParagraph().run()}
          active={editor.isActive("paragraph")}
          title="Đoạn văn thường"
        >
          ¶
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
          active={editor.isActive("heading", { level: 2 })}
          title="Tiêu đề lớn"
        >
          H2
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
          active={editor.isActive("heading", { level: 3 })}
          title="Tiêu đề nhỏ"
        >
          H3
        </ToolbarButton>

        <Divider />

        <ToolbarButton
          onClick={() => editor.chain().focus().toggleBulletList().run()}
          active={editor.isActive("bulletList")}
          title="Danh sách chấm"
        >
          •
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
          active={editor.isActive("orderedList")}
          title="Danh sách số"
        >
          1.
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleBlockquote().run()}
          active={editor.isActive("blockquote")}
          title="Trích dẫn"
        >
          ❝
        </ToolbarButton>

        <Divider />

        <ToolbarButton
          onClick={() => editor.chain().focus().setTextAlign("left").run()}
          active={editor.isActive({ textAlign: "left" })}
          title="Căn trái"
        >
          ⇤
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().setTextAlign("center").run()}
          active={editor.isActive({ textAlign: "center" })}
          title="Căn giữa"
        >
          ⇔
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().setTextAlign("right").run()}
          active={editor.isActive({ textAlign: "right" })}
          title="Căn phải"
        >
          ⇥
        </ToolbarButton>

        <Divider />

        <ToolbarButton
          onClick={() => {
            const previous = editor.getAttributes("link").href ?? "";
            const url = prompt("Địa chỉ liên kết:", previous);
            if (url === null) return;
            if (url === "") {
              editor.chain().focus().unsetLink().run();
              return;
            }
            editor.chain().focus().setLink({ href: url }).run();
          }}
          active={editor.isActive("link")}
          title="Chèn liên kết"
        >
          🔗
        </ToolbarButton>

        <ToolbarButton
          onClick={() => fileInput.current?.click()}
          title="Tải ảnh hoặc video lên"
          disabled={uploading}
        >
          {uploading ? "..." : "🖼"}
        </ToolbarButton>

        <ToolbarButton
          onClick={() => {
            const url = prompt("Dán link YouTube:");
            if (!url) return;
            editor.commands.setYoutubeVideo({ src: url, width: 640, height: 360 });
          }}
          title="Nhúng video YouTube"
        >
          ▶
        </ToolbarButton>

        <ToolbarButton
          onClick={() => editor.chain().focus().setHorizontalRule().run()}
          title="Đường kẻ ngang"
        >
          —
        </ToolbarButton>

        <input
          ref={fileInput}
          type="file"
          accept="image/*,video/mp4,video/webm"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) upload(file);
            e.target.value = "";
          }}
        />
      </div>

      {uploadError && (
        <p className="border-b border-border bg-red-500/10 px-4 py-2 text-xs text-red-600 dark:text-red-400">
          {uploadError}
        </p>
      )}
      {uploading && (
        <p className="border-b border-border bg-surface-2 px-4 py-2 text-xs text-muted">
          Đang tải file lên...
        </p>
      )}

      <EditorContent editor={editor} />
    </div>
  );
}

export type { Editor };
