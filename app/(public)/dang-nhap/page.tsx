import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import AuthForm from "@/components/AuthForm";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  if (await getSessionUser()) redirect("/admin");

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
