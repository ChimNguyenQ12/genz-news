import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { getSessionUser } from "@/lib/auth";

export default async function PublicLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getSessionUser();

  return (
    <>
      <Header user={user} />
      <main className="flex-1">{children}</main>
      <Footer />
    </>
  );
}
