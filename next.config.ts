import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Gói sẵn node_modules cần thiết vào .next/standalone để image runtime nhỏ.
  output: "standalone",
  // Chỉ dev mới hiện overlay của Next; production không có.
  devIndicators: false,
  // playwright-core (đăng nhập Threads, lib/threadsLogin.ts) nạp tệp bằng
  // đường dẫn động — để nguyên gói trong node_modules, không cho bundler gói.
  serverExternalPackages: ["playwright-core"],
  // …và bộ dò tệp của bản standalone bỏ sót mấy tệp nó đọc lúc chạy
  // (browsers.json…), nên chép nguyên gói vào cho route đăng nhập.
  outputFileTracingIncludes: {
    "/api/admin/threads-session": ["./node_modules/playwright-core/**/*"],
    "/api/internal/threads-search": ["./node_modules/playwright-core/**/*"],
  },
  // Ảnh trên S3 đi qua chính tên miền để Cloudflare cache ở edge gần Việt Nam
  // (xem lib/media.ts). Phải trùng với S3_UPLOADS_BASE ở đó.
  async rewrites() {
    const s3 =
      process.env.S3_PUBLIC_BASE ??
      `https://${process.env.S3_BUCKET ?? "genz-news"}.s3.${process.env.AWS_REGION ?? "us-east-1"}.amazonaws.com`;
    return [{ source: "/media/:path*", destination: `${s3}/uploads/:path*` }];
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          // Không trang nào được nhúng trang này vào iframe: chặn lừa admin bấm
          // nút (clickjacking) qua một trang giả phủ lên /admin.
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Content-Security-Policy", value: "frame-ancestors 'none'; base-uri 'self'; object-src 'none'" },
          // File trong /media (người dùng tải lên) chỉ được hiểu đúng kiểu khai báo,
          // không bị trình duyệt "đoán" thành HTML/JS.
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
          { key: "Strict-Transport-Security", value: "max-age=31536000" },
        ],
      },
    ];
  },
};

export default nextConfig;
