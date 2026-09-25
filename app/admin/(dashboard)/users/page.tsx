import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import UserManager from "@/components/admin/UserManager";

export const dynamic = "force-dynamic";

export default async function UsersPage() {
  const user = await getSessionUser();
  if (!user) redirect("/dang-nhap");
  if (user.role !== "admin") redirect("/dashboard");
  return <UserManager currentUserId={user.id} />;
}
