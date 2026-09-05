import type { Metadata } from "next";
import { Be_Vietnam_Pro } from "next/font/google";
import "./globals.css";

const beVietnamPro = Be_Vietnam_Pro({
  variable: "--font-be-vietnam-pro",
  subsets: ["latin", "vietnamese"],
  weight: ["400", "500", "600", "700", "800", "900"],
});

const SITE_NAME = "GenZ News";
const SITE_DESC =
  "Tin tức quốc tế được chắt lọc, biên tập lại và trích dẫn nguồn rõ ràng — đọc nhanh, hiểu sâu.";

export const metadata: Metadata = {
  title: {
    default: `${SITE_NAME} — Tin thế giới, gọn cho Gen Z`,
    template: `%s | ${SITE_NAME}`,
  },
  description: SITE_DESC,
  applicationName: SITE_NAME,
  openGraph: {
    title: `${SITE_NAME} — Tin thế giới, gọn cho Gen Z`,
    description: SITE_DESC,
    siteName: SITE_NAME,
    locale: "vi_VN",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: `${SITE_NAME} — Tin thế giới, gọn cho Gen Z`,
    description: SITE_DESC,
  },
};

// Mặc định giao diện sáng. Chỉ bật tối khi người dùng tự chọn.
const themeInitScript = `
(function () {
  try {
    if (localStorage.getItem("theme") === "dark") {
      document.documentElement.classList.add("dark");
    }
  } catch (e) {}
})();
`;

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="vi"
      className={`${beVietnamPro.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body className="flex min-h-full flex-col bg-background text-foreground">
        {children}
      </body>
    </html>
  );
}
