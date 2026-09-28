import type { Metadata } from "next";
import Link from "next/link";
import InfoPage from "@/components/InfoPage";
import { jsonLdScript } from "@/lib/utils";

const BASE_URL =
  process.env.NEXT_PUBLIC_BASE_URL ?? "https://genz-news.site";

const CONTACT_EMAIL = "tinhbu0123@gmail.com";
const FACEBOOK_URL = "https://www.facebook.com/profile.php?id=61594370073139";

export const metadata: Metadata = {
  title: "Liên hệ GenZ News — gửi tin, báo sai, gỡ nội dung",
  description:
    "Liên hệ toà soạn GenZ News: báo bài sai, yêu cầu chỉnh sửa hoặc gỡ nội dung, gửi tin và góp ý. Email và Facebook chính thức.",
  alternates: { canonical: `${BASE_URL}/lien-he` },
};

const jsonLd = {
  "@context": "https://schema.org",
  "@type": "ContactPage",
  name: "Liên hệ GenZ News",
  url: `${BASE_URL}/lien-he`,
  inLanguage: "vi",
  mainEntity: {
    "@type": "NewsMediaOrganization",
    name: "GenZ News",
    url: BASE_URL,
    contactPoint: [
      {
        "@type": "ContactPoint",
        contactType: "editorial",
        email: CONTACT_EMAIL,
        availableLanguage: ["vi"],
      },
      {
        "@type": "ContactPoint",
        contactType: "customer support",
        email: CONTACT_EMAIL,
        url: FACEBOOK_URL,
        availableLanguage: ["vi"],
      },
    ],
  },
};

export default function ContactPage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLdScript(jsonLd) }}
      />
      <InfoPage
        title="Liên hệ"
        summary="Có bài sai cần sửa, có tin muốn gửi, hay có góp ý? Đây là những kênh duy nhất của GenZ News."
        updatedAt="28/09/2026"
      >
        <h2>Kênh chính thức</h2>
        <ul>
          <li>
            Email:{" "}
            <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>
          </li>
          <li>
            Facebook: <a href={FACEBOOK_URL}>GenZ News trên Facebook</a>
          </li>
        </ul>
        <p>
          Chúng tôi chỉ dùng hai kênh này. Nếu ai đó tự nhận là GenZ News qua
          một tài khoản khác, xin đừng cung cấp thông tin cá nhân.
        </p>

        <h2>Báo một bài sai</h2>
        <p>
          Gửi kèm <strong>link bài viết</strong> và cho biết chi tiết nào sai.
          Nếu có, gửi luôn nguồn đúng để chúng tôi đối chiếu. Chúng tôi sẽ kiểm
          tra lại nguồn gốc và sửa; với lỗi nghiêm trọng thì ghi rõ đã đính
          chính.
        </p>

        <h2>Yêu cầu chỉnh sửa hoặc gỡ nội dung</h2>
        <p>
          Nếu bạn là chủ sở hữu bản quyền của một ảnh, video hoặc đoạn nội dung
          xuất hiện trên GenZ News và muốn nó được chỉnh sửa hay gỡ bỏ, xin gửi
          kèm: <strong>link bài viết</strong>, <strong>nội dung cần gỡ</strong>,
          và <strong>cơ sở chứng minh quyền sở hữu</strong>. Chúng tôi xử lý các
          yêu cầu hợp lệ trước tiên.
        </p>
        <p>
          Cách chúng tôi dùng ảnh và trích nguồn được ghi rõ ở trang{" "}
          <Link href="/nguyen-tac-bien-tap">Nguyên tắc biên tập &amp; trích nguồn</Link>.
        </p>

        <h2>Gửi tin</h2>
        <p>
          Bạn có thông tin mà báo khác chưa đưa? Gửi qua email kèm nguồn kiểm
          chứng được nếu có (link, tài liệu, hình ảnh gốc). Chúng tôi sẽ kiểm
          chứng độc lập trước khi viết, và không tiết lộ danh tính người gửi nếu
          bạn yêu cầu.
        </p>

        <h2>Thời gian phản hồi</h2>
        <p>
          Toà soạn nhỏ, nên chúng tôi không cam kết một mốc thời gian cụ thể.
          Các yêu cầu liên quan bản quyền và nội dung sai sẽ được ưu tiên xử lý
          trước.
        </p>
      </InfoPage>
    </>
  );
}
