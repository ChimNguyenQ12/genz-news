import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import ChangePasswordForm from "@/components/admin/ChangePasswordForm";

export const dynamic = "force-dynamic";

export default async function AccountPage() {
  const user = await getSessionUser();
  if (!user) redirect("/dang-nhap");
  if (user.role !== "admin") redirect("/dashboard");

  return (
    <div className="max-w-md">
      <h1 className="font-display text-2xl font-black">Profile</h1>
      <dl className="mt-4 space-y-1 rounded-2xl border border-border bg-surface p-4 text-sm">
        <div className="flex items-baseline justify-between gap-4">
          <dt className="text-muted">Username</dt>
          <dd className="min-w-0 truncate text-right font-semibold">{user.username}</dd>
        </div>
        <div className="flex items-baseline justify-between gap-4">
          <dt className="text-muted">Display name</dt>
          <dd className="min-w-0 truncate text-right font-semibold">{user.displayName}</dd>
        </div>
        <div className="flex items-baseline justify-between gap-4">
          <dt className="text-muted">Vai trò</dt>
          <dd className="font-semibold">
            {user.role === "admin" ? "Administrator" : "Contributor"}
          </dd>
        </div>
      </dl>

      <h2 className="mt-8 font-display text-lg font-black">Đổi mật khẩu</h2>
      <ChangePasswordForm />
    </div>
  );
}
