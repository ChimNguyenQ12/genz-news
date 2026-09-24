import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Gói sẵn node_modules cần thiết vào .next/standalone để image runtime nhỏ.
  output: "standalone",
  // Chỉ dev mới hiện overlay của Next; production không có.
  devIndicators: false,
  // Ảnh trên S3 đi qua chính tên miền để Cloudflare cache ở edge gần Việt Nam
  // (xem lib/media.ts). Phải trùng với S3_UPLOADS_BASE ở đó.
  async rewrites() {
    const s3 =
      process.env.S3_PUBLIC_BASE ??
      `https://${process.env.S3_BUCKET ?? "genz-news"}.s3.${process.env.AWS_REGION ?? "us-east-1"}.amazonaws.com`;
    return [{ source: "/media/:path*", destination: `${s3}/uploads/:path*` }];
  },
};

export default nextConfig;
