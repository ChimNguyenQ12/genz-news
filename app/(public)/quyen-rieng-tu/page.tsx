import type { Metadata } from "next";
import Link from "next/link";
import InfoPage from "@/components/InfoPage";

const BASE_URL =
  process.env.NEXT_PUBLIC_BASE_URL ?? "https://genz-news.site";

export const metadata: Metadata = {
  title: "Quyền riêng tư — GenZ News lưu dữ liệu gì?",
  description:
    "GenZ News không dùng công cụ theo dõi của bên thứ ba, không chạy quảng cáo và không bán dữ liệu. Đây là những dữ liệu chúng tôi thực sự lưu và vì sao.",
  alternates: { canonical: `${BASE_URL}/quyen-rieng-tu` },
};

// JSON-LD WebPage cho trang chính sách, kèm thực thể nhà xuất bản.
const jsonLd = {
  "@context": "https://schema.org",
  "@type": "WebPage",
  name: "Quyền riêng tư — GenZ News",
  url: `${BASE_URL}/quyen-rieng-tu`,
  description:
    "GenZ News không dùng công cụ theo dõi của bên thứ ba, không chạy quảng cáo và không bán dữ liệu người đọc.",
  inLanguage: "vi",
  isPartOf: { "@type": "WebSite", name: "GenZ News", url: BASE_URL },
  publisher: { "@type": "NewsMediaOrganization", name: "GenZ News", url: BASE_URL },
};

export default function PrivacyPage() {
  return (
    <InfoPage
      jsonLd={jsonLd}
      title="Quyền riêng tư"
      summary="Ngắn gọn: đọc bài thì không cần tài khoản, chúng tôi không chạy công cụ theo dõi nào của bên thứ ba, và không bán dữ liệu cho ai."
      updatedAt="28/09/2026"
    >
      <h2>Tóm tắt</h2>
      <ul>
        <li>Đọc bài không cần đăng nhập và không cần để lại thông tin gì.</li>
        <li>
          <strong>Không có công cụ phân tích hay theo dõi của bên thứ ba</strong>{" "}
          (không Google Analytics, không pixel quảng cáo).
        </li>
        <li>
          <strong>Không có quảng cáo</strong> và không có mạng quảng cáo nào nhúng
          trong trang.
        </li>
        <li>Không bán, không cho thuê, không chia sẻ dữ liệu của bạn.</li>
      </ul>

      <h2>Dữ liệu chúng tôi lưu</h2>
      <p>
        Chỉ khi bạn <strong>tạo tài khoản</strong> hoặc <strong>bình luận</strong>{" "}
        thì mới có dữ liệu được lưu:
      </p>
      <ul>
        <li>
          <strong>Tài khoản:</strong> tên đăng nhập, tên hiển thị, và mật khẩu.
          Khi đăng ký <em>chúng tôi không hỏi email</em>.
        </li>
        <li>
          <strong>Mật khẩu:</strong> được băm kèm salt riêng cho từng tài khoản.
          Chúng tôi không lưu mật khẩu gốc và không thể đọc mật khẩu của bạn.
        </li>
        <li>
          <strong>Bình luận:</strong> nội dung bạn viết, thời điểm gửi, và tên
          hiển thị. Bình luận <em>không cần đăng nhập</em> — chọn ẩn danh thì
          chúng tôi chỉ lưu nick bạn tự đặt, không gắn với tài khoản nào.
        </li>
      </ul>
      <p>
        Lượt đánh giá bài viết (👍/👎) chỉ là một con số cộng dồn trên bài —{" "}
        <strong>chúng tôi không lưu ai đã bấm</strong>.
      </p>
      <p>
        Chúng tôi <strong>không</strong> lưu địa chỉ IP kèm bình luận, không lưu
        vị trí, và không dựng hồ sơ hành vi đọc của bạn. Địa chỉ IP chỉ được đếm
        tạm trong bộ nhớ để chặn spam và phát hiện tấn công làm sập trang, không
        ghi xuống cơ sở dữ liệu. Lượt đọc bài cũng chỉ là một con số cộng dồn
        trên mỗi bài — chúng tôi không ghi ai đã đọc bài nào.
      </p>

      <h2>Quyền của bạn</h2>
      <p>
        Bạn có thể yêu cầu xem, sửa hoặc xoá dữ liệu của mình — kể cả xoá tài
        khoản và bình luận. Gửi yêu cầu qua trang{" "}
        <Link href="/lien-he">Liên hệ</Link> kèm tên đăng nhập để chúng tôi xác
        minh.
      </p>

      <h2>Trẻ em</h2>
      <p>
        Nội dung của GenZ News hướng tới người đọc trưởng thành trẻ. Chúng tôi
        không cố ý thu thập dữ liệu của trẻ em; nếu phát hiện có, xin báo để
        chúng tôi xoá.
      </p>

      <h2>Thay đổi chính sách</h2>
      <p>
        Khi cách vận hành thay đổi — ví dụ thêm công cụ đo lường — chúng tôi sẽ
        cập nhật trang này và ghi ngày ở đầu trang trước khi áp dụng.
      </p>

      <h2>Liên hệ</h2>
      <p>
        Mọi câu hỏi về quyền riêng tư, xin gửi về trang{" "}
        <Link href="/lien-he">Liên hệ</Link>. Cách chúng tôi vận hành nội dung
        nằm ở trang{" "}
        <Link href="/nguyen-tac-bien-tap">Nguyên tắc biên tập &amp; trích nguồn</Link>.
      </p>
    </InfoPage>
  );
}
