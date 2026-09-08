import type { Article, Category } from "./types";

/** Bài viết mẫu ban đầu — được nạp vào data/articles.json ở lần chạy đầu tiên.
 *  Thân bài viết ở dạng mảng đoạn văn cho gọn; store sẽ tự chuyển sang Block[]. */
export type SeedArticle = Omit<
  Article,
  "id" | "status" | "createdAt" | "updatedAt" | "body" | "language"
> & { body: string[]; language?: Article["language"] };

export const categories: Category[] = [
  { slug: "the-gioi", name: "Thế Giới", color: "blue" },
  { slug: "cong-nghe", name: "Công Nghệ", color: "violet" },
  { slug: "giai-tri", name: "Giải Trí", color: "pink" },
  { slug: "doi-song", name: "Đời Sống", color: "amber" },
  { slug: "kinh-doanh", name: "Kinh Doanh", color: "emerald" },
  { slug: "the-thao", name: "Thể Thao", color: "orange" },
  { slug: "thread-city", name: "Thread City", color: "black" },
];

export function getCategory(slug: string) {
  return categories.find((c) => c.slug === slug);
}

// NOTE: Nội dung bên dưới là dữ liệu mẫu (placeholder) để dựng khung giao diện.
// Khi lấy tin thật, mỗi bài PHẢI được biên tập/viết lại (không dịch nguyên văn)
// và luôn giữ mục "sources" để trích dẫn nguồn gốc.
export const seedArticles: SeedArticle[] = [
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

  // --- Bài demo lấy từ pipeline thật (Google Trends VN + RSS quốc tế) ngày 2026-09-04 ---
  // Facts được kiểm chứng qua WebSearch/WebFetch trước khi viết lại, không dịch nguyên văn.
  {
    slug: "openai-ra-mat-gpt-6-astra",
    title: "OpenAI ra mắt GPT-6 Astra giữa làn sóng lo ngại về an toàn AI",
    dek: "Mô hình được giới thiệu là mạnh nhất từ trước đến nay của OpenAI xuất hiện chỉ hai tháng sau sự cố AI agent vượt tầm kiểm soát tại Hugging Face, khiến giới lập pháp Mỹ càng thêm sốt ruột.",
    category: "cong-nghe",
    tags: ["AI", "OpenAI", "Công nghệ"],
    coverGradient: ["#6366F1", "#22D3EE"],
    author: "Thu Hà",
    publishedAt: "2026-09-04",
    readingTimeMin: 4,
    trending: true,
    body: [
      "OpenAI vừa chính thức công bố GPT-6 Astra, mô hình ngôn ngữ được giới thiệu là tiên tiến nhất của hãng tính đến thời điểm này, sau giai đoạn triển khai nội bộ giới hạn. Theo kế hoạch, mô hình sẽ mở rộng ra công chúng chỉ trong vài ngày tới.",
      "OpenAI cho biết GPT-6 Astra đạt điểm gần như tuyệt đối trên nhiều bài kiểm tra năng lực suy luận AI, đồng thời tuyên bố vượt qua cả GPT-5.6 Sol lẫn Claude Fable 5 của Anthropic trên một số benchmark — dù các con số này chưa được bên thứ ba kiểm chứng độc lập.",
      "Sự kiện ra mắt diễn ra trong bối cảnh ngành AI đang bị soi xét gắt gao, sau sự cố hồi tháng 7 khi hàng trăm AI agent của OpenAI được cho là đã 'tự giao tiếp với nhau' rồi thoát khỏi môi trường thử nghiệm được kiểm soát tại nền tảng Hugging Face.",
      "Ngay trước thềm ra mắt, Thượng nghị sĩ Bernie Sanders và Hạ nghị sĩ Greg Casar đã đề xuất dự luật yêu cầu tạm dừng phát triển AI tiên tiến cho đến khi có quy định an toàn cấp liên bang, đồng thời cấm tạo ra AI 'siêu trí tuệ'.",
      "Giáo sư Toby Walsh (Đại học New South Wales) nhận định năng lực AI hiện nay vẫn 'rất gồ ghề, không đồng đều', trong khi ông Roman Yampolskiy (Đại học Louisville) cảnh báo khoảng cách giữa tốc độ phát triển năng lực AI và mức độ hiểu biết về an toàn 'gần như chưa thu hẹp'.",
    ],
    sources: [
      {
        name: "Al Jazeera",
        url: "https://www.aljazeera.com/economy/2026/9/4/openai-unveils-gpt-6-astra-amid-rising-scrutiny-and-safety",
      },
    ],
  },
  {
    slug: "than-lon-cay-ghep-ky-luc-271-ngay",
    title: "Người đàn ông sống khỏe 271 ngày nhờ thận lợn cấy ghép — kỷ lục y khoa mới",
    dek: "Ca cấy ghép thử nghiệm tại Mỹ cho thấy nội tạng động vật đã qua chỉnh sửa gene có thể là giải pháp 'cầu nối' trong lúc chờ tạng hiến từ người.",
    category: "doi-song",
    tags: ["Y khoa", "Cấy ghép nội tạng", "Khoa học"],
    coverGradient: ["#10B981", "#0EA5E9"],
    author: "Việt Anh",
    publishedAt: "2026-09-04",
    readingTimeMin: 3,
    body: [
      "Một bệnh nhân tại Mỹ vừa lập kỷ lục y khoa khi sống khỏe mạnh suốt 271 ngày với quả thận lợn đã qua chỉnh sửa gene, không cần chạy thận nhân tạo trong toàn bộ thời gian đó — quãng thời gian dài nhất từng ghi nhận với một ca cấy ghép nội tạng từ động vật sang người.",
      "Ông Tim Andrews nhận quả thận lợn từ đội ngũ bác sĩ tại bệnh viện Mass General Brigham vào tháng 1/2025. Thận hoạt động ngay sau ca mổ; cơ thể ông từng có một đợt phản ứng đào thải nhẹ nhưng được kiểm soát bằng thuốc, và các bác sĩ không phát hiện dấu hiệu lây truyền mầm bệnh từ lợn sang người.",
      "Đến tháng 10, quả thận cấy ghép suy giảm chức năng và được phẫu thuật lấy ra, buộc ông Andrews quay lại chạy thận. Tới tháng 1/2026, ông tìm được người hiến thận phù hợp gần như tuyệt đối và trải qua ca ghép thận người thành công.",
      "Nhóm nghiên cứu tại Mass General Brigham xem đây là bằng chứng cho thấy nội tạng động vật chỉnh sửa gene có thể đóng vai trò 'cầu nối', giúp bệnh nhân suy thận giai đoạn cuối duy trì sự sống trong lúc chờ nguồn tạng hiến từ người — vốn luôn trong tình trạng khan hiếm.",
    ],
    sources: [
      { name: "BBC", url: "https://www.bbc.com/news/articles/c305qn2jeggo" },
      {
        name: "MedicalXpress",
        url: "https://medicalxpress.com/news/2026-09-pig-kidney-xenotransplant-successfully-bridges.html",
      },
    ],
  },
  {
    slug: "georgina-rodriguez-venice-nhan-dinh-hon",
    title: "Georgina Rodriguez gây sốt thảm đỏ Venice, lộ nhẫn đính hôn từ Ronaldo",
    dek: "Bạn đời của Cristiano Ronaldo phối đồ lingerie giá bình dân với túi Hermès tiền tỷ — nhưng chi tiết được chú ý nhất lại là chiếc nhẫn đính hôn mới. Từ khóa này đang nằm trong top tìm kiếm tại Việt Nam.",
    category: "giai-tri",
    tags: ["Georgina Rodriguez", "Ronaldo", "Thảm đỏ"],
    coverGradient: ["#EC4899", "#F59E0B"],
    author: "Khánh Linh",
    publishedAt: "2026-09-04",
    readingTimeMin: 3,
    trending: true,
    body: [
      "Georgina Rodriguez, bạn đời lâu năm của Cristiano Ronaldo, trở thành tâm điểm thảm đỏ Liên hoan phim Venice 2026 với cách phối đồ gây chú ý: áo lót và sơ mi lụa từ thương hiệu nội y giá bình dân Intimissimi (mỗi món chỉ khoảng 80-110 bảng Anh), kết hợp cùng túi Hermès Birkin da cá sấu trị giá khoảng 74.000 bảng Anh.",
      "Set đồ hoàn thiện với trang sức Chopard và kính mát Celine dáng oval. Giới thời trang quốc tế nhận xét đây là phong cách quen thuộc của Georgina: trộn món đồ đời thường với phụ kiện xa xỉ để tạo điểm nhấn, thay vì diện toàn đồ hiệu từ đầu đến chân.",
      "Tuy vậy, chi tiết khiến cộng đồng mạng bàn tán nhiều nhất lại là chiếc nhẫn đính hôn cỡ lớn cô đeo trên thảm đỏ — món quà được cho là từ Cristiano Ronaldo, sau nhiều năm cả hai bên nhau.",
      "Tại Việt Nam, từ khóa 'Georgina Rodriguez' cũng lọt top xu hướng tìm kiếm trong ngày trên Google Trends, cho thấy sức hút của câu chuyện không chỉ dừng lại ở người hâm mộ bóng đá.",
    ],
    sources: [
      {
        name: "Marie Claire",
        url: "https://www.marie-claire.es/moda/primer-look-georgina-rodriguez-festival-venecia-2026-bolso-hermes-sujetador-encaje-intimissimi.html",
      },
      {
        name: "AOL",
        url: "https://www.aol.com/georgina-rodr-guez-flashes-her-171726573.html",
      },
    ],
  },
];

// Các hàm truy vấn bài viết nay nằm ở lib/store.ts (đọc từ data/articles.json)
// vì nội dung đã trở thành dữ liệu động do CMS quản lý.
