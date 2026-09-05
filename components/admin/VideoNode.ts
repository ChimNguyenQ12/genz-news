import { Node, mergeAttributes } from "@tiptap/core";

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    videoNode: {
      /** Chèn video tự tải lên vào bài. */
      setVideo: (options: { src: string }) => ReturnType;
    };
  }
}

/**
 * Node cho video tự tải lên (<video>).
 * Tiptap loại bỏ mọi thẻ không có trong schema, nên bắt buộc phải khai báo
 * node này thì thẻ <video> mới tồn tại được trong trình soạn thảo.
 */
export const VideoNode = Node.create({
  name: "video",
  group: "block",
  atom: true,
  draggable: true,
  selectable: true,

  addAttributes() {
    return {
      src: { default: null },
    };
  },

  parseHTML() {
    return [{ tag: "video[src]" }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "video",
      mergeAttributes(HTMLAttributes, {
        controls: "controls",
        playsinline: "playsinline",
        preload: "metadata",
      }),
    ];
  },

  addCommands() {
    return {
      setVideo:
        (options) =>
        ({ commands }) =>
          commands.insertContent({ type: this.name, attrs: { src: options.src } }),
    };
  },
});
