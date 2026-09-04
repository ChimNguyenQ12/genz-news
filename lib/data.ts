import type { Article, Category } from "./types";

export const categories: Category[] = [
  { slug: "the-gioi", name: "Thế Giới", color: "blue" },
  { slug: "cong-nghe", name: "Công Nghệ", color: "violet" },
  { slug: "giai-tri", name: "Giải Trí", color: "pink" },
  { slug: "doi-song", name: "Đời Sống", color: "amber" },
  { slug: "kinh-doanh", name: "Kinh Doanh", color: "emerald" },
  { slug: "the-thao", name: "Thể Thao", color: "orange" },
];

export function getCategory(slug: string) {
  return categories.find((c) => c.slug === slug);
}

// NOTE: Nội dung bên dưới là dữ liệu mẫu (placeholder) để dựng khung giao diện.
// Khi lấy tin thật, mỗi bài PHẢI được biên tập/viết lại (không dịch nguyên văn)
// và luôn giữ mục "sources" để trích dẫn nguồn gốc.
export const articles: Article[] = [
  {
    slug: "ai-tao-sinh-thay-doi-cach-gen-z-lam-viec",
    title: "AI tạo sinh đang định hình lại cách Gen Z chọn nghề nghiệp",
    dek: "Khảo sát mới từ các hãng tuyển dụng lớn cho thấy giới trẻ ngày càng ưu tiên công việc có thể kết hợp cùng AI thay vì bị thay thế.",
    category: "cong-nghe",
    tags: ["AI", "Việc làm", "Gen Z"],
    coverGradient: ["#7C3AED", "#22D3EE"],
    author: "Minh Anh",
    publishedAt: "2026-09-03",
    readingTimeMin: 4,
    featured: true,
    trending: true,
    body: [
      "Theo tổng hợp từ nhiều khảo sát thị trường lao động quốc tế công bố gần đây, một bộ phận lớn người trẻ thuộc thế hệ Z tại các nước phát triển đang chủ động tìm kiếm công việc cho phép họ sử dụng công cụ AI tạo sinh như một phần quy trình làm việc hằng ngày, thay vì né tránh vì lo sợ bị thay thế.",
      "Xu hướng này phản ánh sự thay đổi trong tư duy nghề nghiệp: thay vì xem AI là đối thủ, nhiều bạn trẻ coi đây là công cụ tăng năng suất, giúp họ cạnh tranh tốt hơn trong thị trường việc làm ngày càng khắt khe.",
      "Các chuyên gia nhân sự cảnh báo rằng khoảng cách kỹ năng AI giữa các nhóm lao động có thể tạo ra bất bình đẳng mới, và khuyến nghị người trẻ nên đầu tư học cách sử dụng công cụ này một cách có trách nhiệm.",
    ],
    sources: [
      { name: "Reuters", url: "https://www.reuters.com" },
      { name: "Bloomberg", url: "https://www.bloomberg.com" },
    ],
  },
  {
    slug: "chau-au-siet-quy-dinh-mang-xa-hoi",
    title: "Châu Âu tiếp tục siết quy định với các nền tảng mạng xã hội",
    dek: "Loạt quy định mới nhắm vào thuật toán đề xuất nội dung được cho là ảnh hưởng đến sức khỏe tâm lý thanh thiếu niên.",
    category: "the-gioi",
    tags: ["Châu Âu", "Chính sách", "Mạng xã hội"],
    coverGradient: ["#3B82F6", "#0EA5E9"],
    author: "Gia Bảo",
    publishedAt: "2026-09-02",
    readingTimeMin: 5,
    trending: true,
    body: [
      "Các cơ quan quản lý tại châu Âu vừa công bố hướng dẫn mới yêu cầu nền tảng mạng xã hội minh bạch hơn về cách thuật toán đề xuất nội dung hoạt động, đặc biệt với người dùng vị thành niên.",
      "Động thái này nối tiếp làn sóng lo ngại kéo dài nhiều năm về tác động của mạng xã hội đến sức khỏe tinh thần giới trẻ, sau hàng loạt nghiên cứu và điều trần trước nghị viện.",
      "Các nền tảng lớn được cho là đang chuẩn bị phương án tuân thủ, dù một số ý kiến trong ngành cho rằng quy định có thể ảnh hưởng đến trải nghiệm cá nhân hóa nội dung.",
    ],
    sources: [{ name: "The Guardian", url: "https://www.theguardian.com" }],
  },
  {
    slug: "xu-huong-lam-viec-4-ngay-tuan",
    title: "Thử nghiệm tuần làm việc 4 ngày mở rộng sang nhiều ngành nghề mới",
    dek: "Kết quả tích cực từ các đợt thử nghiệm trước khiến nhiều công ty ở lĩnh vực dịch vụ và sáng tạo bắt đầu áp dụng.",
    category: "kinh-doanh",
    tags: ["Việc làm", "Xu hướng"],
    coverGradient: ["#10B981", "#34D399"],
    author: "Thanh Trúc",
    publishedAt: "2026-09-01",
    readingTimeMin: 3,
    body: [
      "Sau các chương trình thí điểm quy mô lớn tại Anh và một số nước Bắc Âu, mô hình tuần làm việc 4 ngày đang được nhiều công ty vừa và nhỏ trong lĩnh vực dịch vụ, truyền thông và công nghệ cân nhắc áp dụng chính thức.",
      "Những đơn vị đã triển khai cho biết năng suất không giảm, trong khi mức độ hài lòng và giữ chân nhân sự trẻ tăng rõ rệt.",
      "Tuy vậy, giới phân tích lưu ý mô hình này khó áp dụng đồng đều ở các ngành đòi hỏi vận hành liên tục.",
    ],
    sources: [{ name: "Financial Times", url: "https://www.ft.com" }],
  },
  {
    slug: "phim-hoat-hinh-doc-lap-gay-sot",
    title: "Một phim hoạt hình độc lập bất ngờ gây sốt toàn cầu nhờ mạng xã hội",
    dek: "Không có ngân sách quảng bá lớn, bộ phim lan tỏa nhờ các đoạn clip ngắn được chia sẻ chóng mặt trên nền tảng video.",
    category: "giai-tri",
    tags: ["Điện ảnh", "Viral"],
    coverGradient: ["#EC4899", "#F472B6"],
    author: "Bảo Ngọc",
    publishedAt: "2026-08-31",
    readingTimeMin: 3,
    trending: true,
    body: [
      "Một dự án hoạt hình độc lập, ban đầu chỉ ra mắt giới hạn tại vài liên hoan phim nhỏ, bất ngờ trở thành hiện tượng sau khi các đoạn cắt ngắn từ phim được lan truyền rộng rãi trên mạng xã hội.",
      "Phong cách hình ảnh khác biệt cùng cách kể chuyện táo bạo được xem là yếu tố giúp tác phẩm chạm đến khán giả trẻ, nhóm vốn ngày càng ít xem quảng cáo truyền thống.",
      "Các hãng phát hành lớn hiện đang theo dõi sát hiện tượng này như một case study cho chiến lược phát hành trong tương lai.",
    ],
    sources: [{ name: "Variety", url: "https://variety.com" }],
  },
  {
    slug: "the-thao-dien-tu-vao-olympic",
    title: "Thể thao điện tử tiến gần hơn đến việc góp mặt chính thức tại Olympic",
    dek: "Ủy ban Olympic quốc tế xác nhận đang thử nghiệm thêm các hạng mục thi đấu esports trong khuôn khổ sự kiện liên quan.",
    category: "the-thao",
    tags: ["Esports", "Olympic"],
    coverGradient: ["#F97316", "#FB923C"],
    author: "Đức Anh",
    publishedAt: "2026-08-30",
    readingTimeMin: 4,
    body: [
      "Sau nhiều năm tổ chức các sự kiện thử nghiệm bên lề, thể thao điện tử đang tiến gần hơn tới việc được công nhận là một hạng mục thi đấu chính thức trong hệ sinh thái Olympic.",
      "Giới quan sát cho rằng đây là bước đi tất yếu khi lượng khán giả trẻ theo dõi esports toàn cầu đã vượt xa nhiều môn thể thao truyền thống.",
      "Tuy nhiên, việc thống nhất tựa game thi đấu và tiêu chuẩn tổ chức vẫn là rào cản lớn cần giải quyết.",
    ],
    sources: [{ name: "AP News", url: "https://apnews.com" }],
  },
  {
    slug: "xu-huong-tieu-dung-ben-vung",
    title: "Gen Z toàn cầu chi tiêu nhiều hơn cho sản phẩm bền vững, dù giá cao hơn",
    dek: "Một khảo sát tiêu dùng quy mô lớn cho thấy yếu tố môi trường ngày càng ảnh hưởng đến quyết định mua sắm của giới trẻ.",
    category: "doi-song",
    tags: ["Tiêu dùng", "Bền vững"],
    coverGradient: ["#F59E0B", "#FBBF24"],
    author: "Ngọc Hân",
    publishedAt: "2026-08-29",
    readingTimeMin: 3,
    body: [
      "Báo cáo tiêu dùng mới nhất từ một số tổ chức nghiên cứu thị trường quốc tế chỉ ra rằng phần lớn người tiêu dùng Gen Z sẵn sàng trả giá cao hơn cho sản phẩm có yếu tố bền vững, minh bạch về nguồn gốc.",
      "Xu hướng này đang buộc nhiều thương hiệu thời trang và tiêu dùng nhanh phải điều chỉnh chuỗi cung ứng cũng như cách truyền thông sản phẩm.",
      "Dù vậy, một số chuyên gia cảnh báo khoảng cách giữa 'nói' và 'làm' trong hành vi mua sắm thực tế vẫn còn đáng kể.",
    ],
    sources: [{ name: "Reuters", url: "https://www.reuters.com" }],
  },
];

export function getArticle(slug: string) {
  return articles.find((a) => a.slug === slug);
}

export function getArticlesByCategory(slug: string) {
  return articles.filter((a) => a.category === slug);
}

export function getFeatured() {
  return articles.find((a) => a.featured) ?? articles[0];
}

export function getTrending() {
  return articles.filter((a) => a.trending);
}
