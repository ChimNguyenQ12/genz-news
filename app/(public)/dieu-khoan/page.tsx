import type { Metadata } from "next";
import Link from "next/link";
import InfoPage from "@/components/InfoPage";

const BASE_URL =
  process.env.NEXT_PUBLIC_BASE_URL ?? "https://genz-news.site";

export const metadata: Metadata = {
  title: "Điều khoản sử dụng",
  description:
    "Điều khoản sử dụng GenZ News: bản quyền nội dung, điều kiện trích dẫn lại, quy định tài khoản và bình luận, giới hạn trách nhiệm.",
  alternates: { canonical: `${BASE_URL}/dieu-khoan` },
};

// JSON-LD WebPage cho trang điều khoản, kèm thực thể nhà xuất bản.
const jsonLd = {
  "@context": "https://schema.org",
  "@type": "WebPage",
  name: "Điều khoản sử dụng — GenZ News",
  url: `${BASE_URL}/dieu-khoan`,
  description:
    "Điều khoản sử dụng GenZ News: bản quyền nội dung, điều kiện trích dẫn lại có ghi nguồn, quy định tài khoản và bình luận.",
  inLanguage: "vi",
  isPartOf: { "@type": "WebSite", name: "GenZ News", url: BASE_URL },
  publisher: { "@type": "NewsMediaOrganization", name: "GenZ News", url: BASE_URL },
};

export default function TermsPage() {
  return (
    <InfoPage
      jsonLd={jsonLd}
      title="Điều khoản sử dụng"
      summary="Bạn được đọc, trích dẫn và chia sẻ nội dung GenZ News — miễn là ghi rõ nguồn. Đây là các điều khoản chi tiết."
      updatedAt="28/09/2026"
    >
      <h2>1. Nội dung của GenZ News</h2>
      <p>
        Các bài viết do GenZ News biên tập thuộc bản quyền của GenZ News.
        <strong> Bạn được trích dẫn lại</strong> — một đoạn ngắn, hoặc dẫn ý
        chính — với điều kiện ghi rõ tên GenZ News và kèm link về bài gốc. Việc
        sao chép toàn bộ bài, hoặc đăng lại như nội dung của mình, là không được
        phép.
      </p>

      <h2>2. Nội dung tổng hợp từ nguồn khác</h2>
      <p>
        Phần lớn bài trên GenZ News là bản tổng hợp có biên tập. Bản quyền của
        các dữ kiện và bài báo gốc vẫn thuộc về cơ quan báo chí đã đưa tin đó;
        chúng tôi liệt kê đường dẫn tới từng nguồn ở mục{" "}
        <em>Nguồn tham khảo</em> cuối bài.
      </p>

      <h2>3. Hình ảnh và video</h2>
      <p>
        Ảnh, video trong bài thuộc bản quyền của tác giả hoặc cơ quan sở hữu.
        Chúng tôi ghi công và dẫn nguồn ngay dưới mỗi ảnh. Nếu bạn là chủ sở hữu
        và muốn nội dung của mình được chỉnh sửa hoặc gỡ bỏ, xin liên hệ theo
        hướng dẫn ở trang <Link href="/lien-he">Liên hệ</Link> — chúng tôi sẽ
        xử lý.
      </p>

      <h2>4. Tài khoản</h2>
      <ul>
        <li>Bạn tự chịu trách nhiệm bảo mật mật khẩu và phiên đăng nhập của mình.</li>
        <li>
          Không dùng tài khoản để đăng nội dung sai sự thật, xúc phạm, quảng cáo
          hoặc spam.
        </li>
        <li>
          Tài khoản vi phạm có thể bị khoá; khi bị khoá, phiên đang mở mất hiệu
          lực ngay.
        </li>
      </ul>

      <h2>5. Bình luận</h2>
      <p>
        Bạn giữ trách nhiệm về nội dung mình bình luận. Chúng tôi không xoá bình
        luận chỉ vì trái chiều, nhưng sẽ xoá nội dung xúc phạm, sai sự thật,
        quảng cáo, spam hoặc tiết lộ thông tin riêng tư của người khác.
      </p>

      <h2>6. Thông tin mang tính tham khảo</h2>
      <p>
        Nội dung trên GenZ News là thông tin thời sự để đọc,{" "}
        <strong>không phải tư vấn pháp lý, y tế hay tài chính</strong>. Dù đã
        kiểm chứng theo{" "}
        <Link href="/nguyen-tac-bien-tap">nguyên tắc biên tập</Link>, vẫn có thể
        còn sai sót — nếu bạn phát hiện, xin báo lại để chúng tôi sửa.
      </p>

      <h2>7. Liên kết ra ngoài</h2>
      <p>
        Bài viết có thể dẫn tới trang của bên khác. Chúng tôi không kiểm soát và
        không chịu trách nhiệm về nội dung của những trang đó.
      </p>

      <h2>8. Thay đổi điều khoản</h2>
      <p>
        Chúng tôi có thể cập nhật trang này khi cách vận hành thay đổi. Ngày cập
        nhật được ghi ở đầu trang.
      </p>

      <h2>9. Liên hệ</h2>
      <p>
        Mọi thắc mắc về điều khoản, xin gửi về trang{" "}
        <Link href="/lien-he">Liên hệ</Link>.
      </p>
    </InfoPage>
  );
}
