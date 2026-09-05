import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Gói sẵn node_modules cần thiết vào .next/standalone để image runtime nhỏ.
  output: "standalone",
  // Chỉ dev mới hiện overlay của Next; production không có.
  devIndicators: false,
};

export default nextConfig;
