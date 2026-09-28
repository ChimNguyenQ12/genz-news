import type { Metadata } from "next";
import Link from "next/link";
import InfoPage from "@/components/InfoPage";
import { jsonLdScript } from "@/lib/utils";

const BASE_URL =
  process.env.NEXT_PUBLIC_BASE_URL ?? "https://genz-news.site";

export const metadata: Metadata = {
  title: "Giới thiệu GenZ News — tin gọn cho người Việt",
  description:
    "GenZ News là trang tin quốc tế chắt lọc cho người đọc trẻ Việt Nam: tin ngắn, hiểu sâu, mỗi bài đều trích dẫn nguồn gốc rõ ràng.",
  alternates: { canonical: `${BASE_URL}/gioi-thieu` },
};

// JSON-LD AboutPage + tổ chức: giúp Google và các máy tìm kiếm AI hiểu đây là
// trang danh tính của nhà xuất bản, không phải một bài viết.
const jsonLd = {
  "@context": "https://schema.org",
  "@type": "AboutPage",
  name: "Giới thiệu GenZ News",
  url: `${BASE_URL}/gioi-thieu`,
  inLanguage: "vi",
  mainEntity: {
    "@type": "NewsMediaOrganization",
    name: "GenZ News",
    url: BASE_URL,
    description:
      "Trang tin quốc tế được chắt lọc, biên tập lại và trích dẫn nguồn rõ ràng, dành cho người đọc trẻ Việt Nam.",
    logo: {
      "@type": "ImageObject",
      url: `${BASE_URL}/logo.png`,
      width: 695,
      height: 696,
    },
    sameAs: ["https://www.facebook.com/profile.php?id=61594370073139"],
    contactPoint: {
      "@type": "ContactPoint",
      contactType: "editorial",
      email: "tinhbu0123@gmail.com",
      availableLanguage: ["vi"],
    },
  },
};

export default function AboutPage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLdScript(jsonLd) }}
      />
      <InfoPage
        title="Giới thiệu GenZ News"
        summary="Tin thế giới, gọn cho Gen Z — đọc nhanh, hiểu sâu, luôn có nguồn."
        updatedAt="28/09/2026"
      >
        <h2>GenZ News là gì</h2>
        <p>
          GenZ News là một trang tin độc lập, chuyên đưa tin
          quốc tế và tin Việt Nam dưới dạng ngắn gọn, dễ đọc. Mỗi bài là một bản
          tổng hợp có biên tập: chúng tôi đọc nhiều nguồn, kiểm chứng dữ kiện,
          được viết lại kèm nguồn cụ thể.
        </p>
        <p>
          Các bạn có thể tự tạo bài viết của mình kèm những thông tin hữu ích khi muốn
          chia sẻ lên website này để không bị &ldquo;ai đó&rdquo; xóa mất :). Mình rất cảm ơn đóng góp của các bạn.
        </p>

        <h2>Chúng tôi viết cho ai</h2>
        <p>
          Cho toàn bộ người Việt Nam — nhóm thường không đọc
          báo dài, nhưng vẫn muốn hiểu chuyện gì đang xảy ra và{" "}
          <strong>nó dính gì tới mình</strong>. Vì vậy mỗi bài đều cố trả lời
          câu đó ngay trong đoạn đầu, thay vì để ở cuối.
        </p>

        <h2>Khác gì so với đọc bản gốc</h2>
        <ul>
          <li>
            <strong>Gộp nhiều nguồn thành một mạch kể</strong>, không tóm tắt
            một bài rồi gắn thêm link.
          </li>
          <li>
            <strong>Chỉ rõ chỗ các nguồn không khớp nhau</strong> — không chọn
            bừa một bên rồi viết như thể đó là sự thật duy nhất.
          </li>
          <li>
            <strong>Từ khoá và tên riêng khó được giải thích ngay tại chỗ</strong>
            , để bạn không phải mở tab khác để tra.
          </li>
          <li>
            <strong>Khoảng 70% bài dính tới Việt Nam</strong>, kể cả khi bài gốc
            là của báo nước ngoài viết về Việt Nam.
          </li>
        </ul>

        <h2>Nguyên tắc và liên hệ</h2>
        <p>
          Cách chúng tôi chọn nguồn, dùng ảnh và sửa sai nằm ở trang{" "}
          <Link href="/nguyen-tac-bien-tap">Nguyên tắc biên tập &amp; trích nguồn</Link>.
          Góp ý, báo sai hoặc yêu cầu chỉnh sửa nội dung, xin gửi về trang{" "}
          <Link href="/lien-he">Liên hệ</Link>.
        </p>
      </InfoPage>
    </>
  );
}
