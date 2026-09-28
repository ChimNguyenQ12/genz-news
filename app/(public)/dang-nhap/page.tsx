import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import AuthForm from "@/components/AuthForm";

export const dynamic = "force-dynamic";

const BASE_URL =
  process.env.NEXT_PUBLIC_BASE_URL ?? "https://genz-news.site";

/**
 * Không khai báo metadata thì trang này thừa hưởng nguyên title/description/
 * canonical của layout gốc — tức tít trùng trang chủ và canonical trỏ về "/".
 * Khai báo riêng để mỗi trang có canonical đúng chính nó.
 */
export const metadata: Metadata = {
  title: "Đăng nhập",
  description:
    "Đăng nhập tài khoản GenZ News để viết bài, lưu bản nháp và theo dõi bài đã gửi duyệt.",
  alternates: { canonical: `${BASE_URL}/dang-nhap` },
};

export default async function LoginPage() {
  const user = await getSessionUser();
  if (user) {
    redirect(user.role === "admin" ? "/admin" : "/dashboard");
  }

  return (
    <div className="mx-auto flex max-w-sm flex-col justify-center px-4 py-16">
      <div className="mb-8 text-center">
        <h1 className="font-display text-2xl font-black">Đăng nhập</h1>
      </div>

      <AuthForm mode="login" />

      <p className="mt-5 text-center text-sm text-muted">
        Chưa có tài khoản?{" "}
        <Link href="/dang-ky" className="font-semibold text-accent hover:underline">
          Đăng ký
        </Link>
      </p>
    </div>
  );
}
