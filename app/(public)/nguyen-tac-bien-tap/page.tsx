import type { Metadata } from "next";
import Link from "next/link";
import InfoPage from "@/components/InfoPage";

const BASE_URL =
  process.env.NEXT_PUBLIC_BASE_URL ?? "https://genz-news.site";

export const metadata: Metadata = {
  title: "Nguyên tắc biên tập & trích nguồn",
  description:
    "GenZ News kiểm chứng dữ kiện từ nhiều nguồn, viết lại hoàn toàn bằng lời của mình, ghi rõ nguồn từng bài và ghi công ảnh. Đây là nguyên tắc biên tập của chúng tôi.",
  alternates: { canonical: `${BASE_URL}/nguyen-tac-bien-tap` },
};

export default function EditorialPolicyPage() {
  return (
    <InfoPage
      title="Nguyên tắc biên tập & trích nguồn"
      summary="Chúng tôi tổng hợp và biên tập lại — không sao chép. Dưới đây là những gì chúng tôi buộc mình phải làm trước khi một bài được đăng."
      updatedAt="28/09/2026"
    >
      <h2>1. Dữ kiện thì không có bản quyền, cách diễn đạt thì có</h2>
      <p>
        Một sự việc ai cũng được quyền đưa tin. Nhưng cách viết ra nó là tài
        sản của người viết trước. Vì vậy{" "}
        <strong>mọi bài trên GenZ News đều được viết lại hoàn toàn</strong>,
        không dịch nguyên văn và không diễn đạt sát bản gốc. Chúng tôi lấy dữ
        kiện, không lấy câu chữ.
      </p>

      <h2>2. Mỗi bài phải có nguồn thật</h2>
      <p>
        Không có bài nào lên trang mà không kèm nguồn. Nguồn nằm ở mục{" "}
        <em>Nguồn tham khảo</em> cuối bài, là link thật đã được kiểm tra tồn
        tại trước khi lưu. Chúng tôi không bịa nguồn và không bịa URL.
      </p>

      <h2>3. Kiểm chứng trước khi viết</h2>
      <p>
        Mọi con số, tên riêng và ngày tháng phải khớp giữa các nguồn với nhau.
        Chi tiết nào không kiểm chứng được thì bị bỏ, chứ không được viết ra kèm
        chữ &ldquo;có thể&rdquo;.
      </p>

      <h2>4. Khi các nguồn nói khác nhau</h2>
      <p>
        Chúng tôi viết thẳng là{" "}
        <strong>chưa có thống nhất</strong> và nêu rõ bên nào nói gì, ai nói.
        Không chọn bừa một bên cho gọn, và không tự dựng ra mâu thuẫn để bài
        kịch tính hơn.
      </p>

      <h2>5. Ảnh và video: đúng vụ việc, hoặc không có</h2>
      <p>
        Người đọc mặc định ảnh trong bài là ảnh chụp chính chuyện đang kể. Một
        tấm ảnh &ldquo;cùng chủ đề&rdquo; nhưng khác vụ, khác nước là làm người
        đọc hiểu sai — tệ hơn hẳn một cái nền màu. Thứ tự ưu tiên của chúng tôi:
      </p>
      <ol>
        <li>
          <strong>Ảnh của chính bài báo nguồn</strong>, dùng kèm ghi công tên
          báo và link về bài gốc.
        </li>
        <li>
          <strong>Video chính thức</strong> trên kênh của hãng tin, cơ quan hoặc
          doanh nghiệp liên quan, nhúng từ chính nền tảng của họ.
        </li>
        <li>
          <strong>Ảnh kho tự do</strong>, tìm theo tên riêng. Loại này gần như
          luôn chỉ là bối cảnh, nên chú thích phải mở đầu bằng{" "}
          <em>Ảnh minh hoạ:</em> rồi mới tới phần ghi công.
        </li>
      </ol>
      <p>
        Nếu không có ảnh nào đúng vụ việc, bài sẽ dùng nền màu — chúng tôi coi
        việc bỏ trống ảnh là một lựa chọn đúng.
      </p>

      <h2>6. Chủ đề nhạy cảm</h2>
      <p>
        Với chủ quyền, biển đảo, chính trị, tôn giáo, sắc tộc và các vụ án đang
        điều tra, chúng tôi chỉ dùng phát ngôn chính thức có nguồn rõ ràng. Với
        tin chủ quyền, nguồn không nhất thiết phải là báo Việt Nam — báo nước
        ngoài viết về việc đó cũng được dùng, miễn là dẫn rõ.
      </p>

      <h2>7. Quy trình duyệt bài</h2>
      <p>
        Một bài chỉ đi theo một đường: <strong>nháp → chờ duyệt → đăng</strong>,
        hoặc bị trả lại kèm góp ý để sửa rồi gửi lại.{" "}
        <strong>Việc bấm đăng là quyết định của con người.</strong> Hệ thống
        được thiết kế sao cho tài khoản tự động chỉ có thể lưu bản nháp hoặc gửi
        chờ duyệt — nó không có quyền tự đăng bài.
      </p>

      <h2>8. Sửa sai</h2>
      <p>
        Khi phát hiện bài đã đăng có chi tiết sai, chúng tôi sửa lại nội dung và
        ghi rõ đã sửa. Nếu bạn thấy bài nào sai, xin báo qua trang{" "}
        <Link href="/lien-he">Liên hệ</Link> kèm link bài — chúng tôi sẽ kiểm
        tra lại nguồn và sửa.
      </p>

      <h2>9. Bình luận</h2>
      <p>
        Bình luận là ý kiến của người viết, không phải quan điểm của GenZ News.
        Chúng tôi không xoá bình luận chỉ vì trái chiều, nhưng sẽ xoá nội dung
        xúc phạm, sai sự thật, quảng cáo hoặc spam.
      </p>
    </InfoPage>
  );
}
