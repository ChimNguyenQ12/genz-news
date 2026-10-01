import Script from "next/script";
import Header from "@/components/Header";
import Footer from "@/components/Footer";

/** Google Analytics 4. Chỉ gắn ở trang công khai: lượt vào /admin, /dashboard không làm lệch số liệu. */
const GA_ID = "G-RGEEYB1PJE";

/**
 * KHÔNG đọc phiên đăng nhập ở đây: một lệnh đọc cookie trong layout là MỌI
 * trang công khai phải dựng lại ở từng lượt xem (không cache được, kể cả trang
 * tĩnh như /gioi-thieu). Header tự hỏi người xem ở trình duyệt.
 */
export default function PublicLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <Header />
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
