import Script from "next/script";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { getSessionUser } from "@/lib/auth";

/** Google Analytics 4. Chỉ gắn ở trang công khai: lượt vào /admin, /dashboard không làm lệch số liệu. */
const GA_ID = "G-RGEEYB1PJE";

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
      <Script src={`https://www.googletagmanager.com/gtag/js?id=${GA_ID}`} strategy="afterInteractive" />
      <Script id="ga4" strategy="afterInteractive">
        {`window.dataLayer = window.dataLayer || [];
function gtag(){dataLayer.push(arguments);}
gtag('js', new Date());
gtag('config', '${GA_ID}');`}
      </Script>
    </>
  );
}
