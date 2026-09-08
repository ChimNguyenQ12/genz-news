import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import DashboardNav from "@/components/dashboard/DashboardNav";

export const dynamic = "force-dynamic";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getSessionUser();
  if (!user) redirect("/dang-nhap");

  return (
    <div className="min-h-screen">
      <DashboardNav user={user} />
      <main className="mx-auto max-w-6xl px-4 py-8">{children}</main>
    </div>
  );
}
