import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Be_Vietnam_Pro } from "next/font/google";
import { DEFAULT_OG_IMAGE, SITE_DESC, SITE_NAME } from "@/lib/seo";
import "./globals.css";

const BASE_URL =
  process.env.NEXT_PUBLIC_BASE_URL ?? "https://genz-news.site";

const beVietnamPro = Be_Vietnam_Pro({
  variable: "--font-be-vietnam-pro",
  subsets: ["latin", "vietnamese"],
  weight: ["400", "500", "600", "700", "800", "900"],
});

export const metadata: Metadata = {
  // metadataBase bắt buộc phải có để Next.js resolve canonical, og:image, sitemap
  metadataBase: new URL(BASE_URL),
  title: {
    default: `${SITE_NAME} — Tin thế giới, gọn cho Gen Z`,
    template: `%s | ${SITE_NAME}`,
  },
  description: SITE_DESC,
  applicationName: SITE_NAME,
  alternates: { canonical: "/" },
  robots: { index: true, follow: true, googleBot: { index: true, follow: true } },
  openGraph: {
    title: `${SITE_NAME} — Tin thế giới, gọn cho Gen Z`,
    description: SITE_DESC,
    siteName: SITE_NAME,
    locale: "vi_VN",
    type: "website",
    url: BASE_URL,
    // Ảnh mặc định cho mọi trang không tự khai báo (trang chủ, chuyên mục,
    // đăng nhập…). Bài viết có ảnh bìa sẽ ghi đè bằng ảnh của chính bài.
    images: [DEFAULT_OG_IMAGE],
  },
  icons: {
    icon: [
      { url: "/genz-news-logo.png", sizes: "32x32", type: "image/png" },
      { url: "/genz-news-logo.png", sizes: "192x192", type: "image/png" },
    ],
    apple: [
      { url: "/genz-news-logo.png", sizes: "180x180", type: "image/png" },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: `${SITE_NAME} — Tin thế giới, gọn cho Gen Z`,
    description: SITE_DESC,
    images: [DEFAULT_OG_IMAGE.url],
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

// Khai báo kiểu tường minh thay vì dùng LayoutProps của Next. LayoutProps là
// kiểu toàn cục Next sinh ra trong .next/, nên `tsc --noEmit` ở CI (chạy khi
// chưa build) sẽ báo TS2304: Cannot find name 'LayoutProps'.
export default function RootLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  return (
    <html
      lang="vi"
      className={`${beVietnamPro.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
        {/* RSS autodiscovery — trình đọc RSS và crawler AI engines tìm feed qua tag này */}
        <link
          rel="alternate"
          type="application/rss+xml"
          title="GenZ News — RSS Feed"
          href={`${BASE_URL}/feed`}
        />
      </head>
      <body className="flex min-h-full flex-col bg-background text-foreground">
        {children}
      </body>
    </html>
  );
}
