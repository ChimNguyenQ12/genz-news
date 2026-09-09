import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import AdminNav from "@/components/admin/AdminNav";

export const dynamic = "force-dynamic";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getSessionUser();
  if (!user) redirect("/dang-nhap");
  if (user.role !== "admin") redirect("/dashboard");

  return (
    <div className="min-h-screen">
      <AdminNav user={user} />
      <main className="mx-auto max-w-6xl px-3 py-4 sm:px-4 sm:py-8">{children}</main>
    </div>
  );
}
