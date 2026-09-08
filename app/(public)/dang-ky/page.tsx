import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import AuthForm from "@/components/AuthForm";

export const dynamic = "force-dynamic";

const REGISTRATION_OPEN = process.env.ALLOW_REGISTRATION !== "0";

export default async function RegisterPage() {
  const user = await getSessionUser();
  if (user) {
    redirect(user.role === "admin" ? "/admin" : "/dashboard");
  }

  return (
    <div className="mx-auto flex max-w-sm flex-col justify-center px-4 py-16">
      <div className="mb-8 text-center">
        <h1 className="font-display text-2xl font-black">Đăng ký</h1>
      </div>

      {REGISTRATION_OPEN ? (
        <AuthForm mode="register" />
      ) : (
        <p className="rounded-xl border border-border bg-surface p-4 text-center text-sm text-muted">
          Đăng ký đang tạm đóng. Liên hệ admin để được cấp tài khoản.
        </p>
      )}

      <p className="mt-5 text-center text-sm text-muted">
        Đã có tài khoản?{" "}
        <Link href="/dang-nhap" className="font-semibold text-accent hover:underline">
          Đăng nhập
        </Link>
      </p>
    </div>
  );
}
