/**
 * Chấm điểm và phân loại đề tài trước khi đẩy vào hàng đợi toà soạn.
 *
 * Vì sao cần: vòng thu thập cũ lấy tin luân phiên đều tay giữa các nguồn RSS,
 * nên một tin nội bộ ngành ("Automattic confirms Mullenweg has returned as
 * CEO") hay một tin nghi lễ ở nước xa ("Burial of King Oyo in Uganda") vào
 * hàng đợi ngang hàng với chuyện đang nóng ở Việt Nam. Bạn đọc 18–27 tuổi ở
 * Việt Nam không đọc hai loại đó.
 *
 * Ba việc mà tệp này làm:
 *   1. ĐÁNH DẤU đề tài có liên quan Việt Nam — báo Việt viết hay báo nước
 *      ngoài viết đều tính, miễn trong tít/ghi chú có nhắc tới Việt Nam.
 *   2. ƯU TIÊN nhóm chủ quyền/lãnh thổ và nhóm Trung-Quốc-làm-gì-ảnh-hưởng-
 *      Việt-Nam. Đây là nhóm tổng biên tập muốn thấy trước tiên.
 *   3. CHẤM ĐIỂM độ nóng: đề tài đang được tìm kiếm/bàn tán nhiều thì cộng,
 *      tin kỹ thuật khô khan và tin địa phương nước xa thì trừ.
 *
 * Mọi danh sách từ khoá ở đây viết KHÔNG DẤU, vì hàm chấm điểm bỏ dấu tiếng
 * Việt trước khi so khớp ("chủ quyền" thành "chu quyen"). Nhờ vậy một danh
 * sách bắt được cả bản có dấu lẫn bản không dấu mà báo mạng hay viết lẫn lộn.
 */

/** Bỏ dấu tiếng Việt để so khớp. Nguồn trả về cả có dấu lẫn không dấu. */
export function stripDiacritics(str) {
  return String(str ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D");
}

/** Khoá so trùng: bỏ dấu, bỏ ký tự lạ, gộp khoảng trắng. */
export function normalize(s) {
  return stripDiacritics(s)
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Khoá so trùng chặt hơn: bỏ luôn khoảng trắng. Cùng một bản tin đi qua hai
 * nguồn thường chỉ lệch nhau chỗ viết tên nước — "Việt Nam, China, ASEAN" so
 * với "Vietnam, China, ASEAN" — normalize() vẫn coi là hai đề tài khác nhau vì
 * một bên thừa dấu cách. Bỏ hết dấu cách thì hai bản đó trùng khít.
 */
export function dedupeKey(s) {
  return normalize(s).replace(/\s+/g, "");
}

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Dựng regex so khớp cụm từ. Ranh giới dùng lookaround thay cho \b vì vài cụm
 * bắt đầu bằng ký tự không phải chữ ("raises $"), chỗ đó \b im lặng không khớp.
 * Cụm dài xếp trước để "south china sea" thắng "china" khi cả hai cùng khớp.
 */
function matcher(phrases) {
  const src = [...phrases]
    .sort((a, b) => b.length - a.length)
    .map(esc)
    .join("|");
  return new RegExp(`(?<![a-z0-9])(?:${src})(?![a-z0-9])`, "gi");
}

function hits(re, text) {
  re.lastIndex = 0;
  const found = new Set();
  for (const m of text.matchAll(re)) found.add(m[0].toLowerCase());
  return [...found];
}

// ------------------------------------------------------------------ Việt Nam
/**
 * Dấu hiệu "bài này dính tới Việt Nam". Cố ý gồm cả tên tiếng Anh lẫn tiếng
 * Việt không dấu, vì một nửa số đề tài nhóm này đến từ báo nước ngoài.
 *
 * KHÔNG đưa vào đây những từ quá chung mà ngôn ngữ khác cũng dùng: "dong"
 * (tiền đồng) trùng họ người Trung Quốc, "hue" trùng "hues/Hughes" trong tiếng
 * Anh — thêm vào là hàng đợi đầy tin không liên quan.
 */
const VN_MARKERS = [
  "viet nam", "vietnam", "vietnamese", "hanoian",
  "ha noi", "hanoi", "sai gon", "saigon", "ho chi minh", "tp hcm", "tphcm",
  "da nang", "danang", "hai phong", "haiphong", "can tho", "nha trang",
  "phu quoc", "da lat", "dalat", "vung tau", "ha long", "halong",
  "quang ninh", "binh duong", "dong nai", "bac ninh", "thanh hoa", "nghe an",
  "mekong delta", "dong bang song cuu long",
  "vinfast", "viettel", "vingroup", "vietjet", "vietcombank", "vietnam airlines",
  "vnexpress", "vn index", "vn-index", "vnindex", "ho chi minh stock",
  "v league", "v-league", "vleague", "u23 viet nam", "doi tuyen viet nam",
];

/**
 * Chủ quyền, lãnh thổ, biên giới. Nhóm này luôn được ưu tiên, kể cả khi tít
 * không nhắc chữ "Việt Nam" — vì một tin về Trường Sa hay đường lưỡi bò thì
 * mặc nhiên là chuyện của Việt Nam dù báo nước ngoài viết kiểu gì.
 */
const SOVEREIGNTY_MARKERS = [
  "bien dong", "south china sea", "east sea", "west philippine sea",
  "truong sa", "spratly", "spratlys", "hoang sa", "paracel", "paracels",
  "scarborough shoal", "second thomas shoal", "vanguard bank", "bai tu chinh",
  "duong luoi bo", "nine dash line", "nine-dash line", "ten dash line",
  "chu quyen", "sovereignty", "lanh hai", "lanh tho", "territorial waters",
  "territorial dispute", "disputed waters", "disputed islands",
  "vung dac quyen kinh te", "exclusive economic zone",
  "dao nhan tao", "artificial island", "artificial islands",
  "hai canh", "china coast guard", "maritime militia", "dan quan bien",
  "quan su hoa", "militarisation", "militarization",
  "unclos", "cong uoc luat bien", "code of conduct",
  "bien gioi viet trung", "vietnam china border",
];

/**
 * Trung Quốc. Bản thân nó không đủ để ưu tiên — phải đi kèm dấu hiệu Việt Nam
 * thì mới thành "Trung Quốc làm gì đó ảnh hưởng tới Việt Nam".
 */
const CHINA_MARKERS = [
  "trung quoc", "china", "chinese", "beijing", "bac kinh", "shanghai",
  "xi jinping", "tap can binh", "pla navy", "quan giai phong",
  "huawei", "bytedance", "tencent", "alibaba", "temu", "shein", "byd",
  "xiaomi", "cnooc", "sinopec", "cosco", "bilibili", "xiaohongshu", "deepseek",
  "belt and road", "vanh dai va con duong", "lancang",
];

/**
 * Chuyện Trung Quốc xây/làm gì đó mà Việt Nam chịu ảnh hưởng trực tiếp. Gặp
 * cụm này cùng lúc với dấu hiệu Trung Quốc thì cũng coi là nhóm ưu tiên, kể cả
 * khi tít chưa kịp nhắc tên Việt Nam — báo nước ngoài hay để tên nước ở thân bài.
 */
const CHINA_IMPACT_MARKERS = [
  "song mekong", "mekong river", "mekong dam", "dap thuy dien", "hydropower dam",
  "cap quang bien", "submarine cable", "duong sat cao toc", "high speed rail",
  "high-speed rail", "chuoi cung ung", "supply chain", "dat hiem",
  "rare earth", "thue quan", "tariff", "tariffs", "nhap sieu", "trade deficit",
  "khu cong nghiep", "industrial park", "dich chuyen san xuat",
  "manufacturing shift", "factory relocation", "asean",
];

// ------------------------------------------------------------------ độ nóng
/**
 * Dấu hiệu "chuyện này dính gì tới tôi" theo đúng nghĩa hiến chương: việc học,
 * việc làm, tiền bạc, thứ họ dùng hằng ngày, thứ họ đang bàn tán.
 */
const INTEREST_MARKERS = [
  // học hành, việc làm, tiền
  "hoc phi", "tuyen sinh", "diem chuan", "thi tot nghiep", "ky thi", "dai hoc",
  "du hoc", "hoc bong", "scholarship", "sinh vien ra truong",
  "viec lam", "tuyen dung", "that nghiep", "sa thai", "layoff", "layoffs",
  "luong toi thieu", "muc luong", "thu nhap", "gen z", "genz",
  "gia nha", "chung cu", "bat dong san", "lai suat", "thue thu nhap",
  "bao hiem xa hoi", "visa", "xuat khau lao dong", "nghi le", "nghi tet",
  "gia dien", "gia xang", "hoc sinh", "tan sinh vien",
  // thứ dùng hằng ngày
  "iphone", "samsung", "galaxy", "android", "app store", "google play",
  "chatgpt", "openai", "gemini", "copilot", "tri tue nhan tao",
  "artificial intelligence", "deepfake", "grab", "shopee", "tiktok shop",
  "momo", "vnpay", "ngan hang so", "chuyen khoan", "lua dao truc tuyen",
  "ro ri du lieu", "data breach", "5g",
  // giải trí, thể thao, văn hoá mạng
  "concert", "live show", "liveshow", "album", "netflix", "phim",
  "rap viet", "anh trai", "chi dep", "kpop", "k-pop", "blackpink", "bts",
  "idol", "ca si", "dien vien", "hoa hau", "streamer", "youtuber", "tiktoker",
  "viral", "gay bao", "gay tranh cai", "tranh cai", "drama", "scandal",
  "trend", "xu huong", "meme", "esports", "lien quan", "lien minh huyen thoai",
  "valorant", "genshin", "world cup", "sea games", "asiad", "olympic",
  "bong da", "doi tuyen", "chuyen nhuong",
  // đời sống Gen Z
  "suc khoe tam than", "burnout", "song thu", "ket hon", "sinh con",
  "du lich", "chi phi sinh hoat",
];

/**
 * Tin có thật nhưng không ai ngoài ngành đọc: gọi vốn, thay ghế lãnh đạo, báo
 * cáo quý, ghi chú phát hành phần mềm. Đây chính là nhóm sinh ra hai ví dụ mà
 * tổng biên tập chỉ ra. Trừ điểm chứ không loại thẳng — "Apple thay CEO" vẫn
 * đáng viết, và nó sẽ tự kiếm lại điểm ở các hạng mục khác.
 */
const DRY_MARKERS = [
  // vốn và quản trị doanh nghiệp
  "series a", "series b", "series c", "series d", "seed round", "seed funding",
  "funding round", "raises $", "raised $", "valuation", "venture capital",
  "vc firm", "term sheet", "cap table", "acqui-hire", "ipo filing",
  "earnings call", "quarterly results", "quarterly earnings", "full-year results",
  "q1 results", "q2 results", "q3 results", "q4 results", "profit warning",
  "board of directors", "boardroom", "shareholder meeting", "proxy fight",
  "to its board", "joins the board", "board seat", "ipo", "go public",
  "steps down as", "stepping down as", "returns as ceo", "returned as ceo",
  "named ceo", "appointed ceo", "interim ceo", "new cto", "new cfo",
  "ouster", "ousted as", "resigns as", "executive chairman",
  // kỹ thuật nội bộ ngành
  "sdk", "api endpoint", "kubernetes", "docker", "changelog", "release notes",
  "developer preview", "beta release", "open source project", "pull request",
  "middleware", "runtime", "compiler", "benchmark results",
  "enterprise software", "saas platform", "b2b platform", "devops",
  "cve-", "patch tuesday", "npm package", "git repository", "codebase",
  // nghi lễ / tin địa phương nước xa
  "burial", "funeral of", "coronation", "enthronement", "obituary", "throne",
  "by-election", "local council", "county council", "borough", "parish",
  "state legislature", "city council", "mayoral race", "school board meeting",
  "ribbon cutting", "groundbreaking ceremony", "annual gala",
];

/**
 * Nước/tổ chức/hãng mà tin tức của họ tự nó đã có người Việt theo dõi. Một đề
 * tài quốc tế KHÔNG dính Việt Nam mà cũng không chạm tới nhóm này thì gần như
 * chắc chắn là tin địa phương của một nơi rất xa — trừ điểm.
 */
const GLOBAL_REACH_MARKERS = [
  "hoa ky", "united states", "usa", "american", "washington",
  "white house", "trump", "biden", "pentagon", "wall street", "nasdaq",
  "china", "trung quoc", "chinese", "beijing", "japan", "nhat ban", "tokyo",
  "korea", "han quoc", "seoul", "north korea", "trieu tien",
  "russia", "moscow", "putin", "ukraine", "kyiv",
  "israel", "gaza", "palestine", "iran", "saudi",
  "india", "an do", "modi", "indonesia", "thailand", "thai lan",
  "singapore", "philippines", "malaysia", "campuchia", "cambodia",
  "taiwan", "dai loan", "hong kong",
  "europe", "chau au", "european union", "britain", "london",
  "france", "germany", "nato", "united nations", "lien hop quoc",
  "imf", "world bank", "opec",
  "apple", "google", "microsoft", "amazon", "meta", "facebook", "instagram",
  "tiktok", "youtube", "netflix", "spotify", "openai", "nvidia", "tesla",
  "spacex", "samsung", "sony", "disney", "twitter", "reddit",
  "bitcoin", "crypto", "ethereum", "stablecoin",
  "world cup", "olympic", "premier league", "champions league", "nba",
  "messi", "ronaldo", "oscar", "grammy", "cannes",
];

const RE_VN = matcher(VN_MARKERS);
const RE_SOVEREIGNTY = matcher(SOVEREIGNTY_MARKERS);
const RE_CHINA = matcher(CHINA_MARKERS);
const RE_CHINA_IMPACT = matcher(CHINA_IMPACT_MARKERS);
const RE_INTEREST = matcher(INTEREST_MARKERS);
const RE_DRY = matcher(DRY_MARKERS);
const RE_GLOBAL = matcher(GLOBAL_REACH_MARKERS);

// ------------------------------------------------------------------- rác
/**
 * Từ khoá rác của Google Trends VN — tra cứu tiện ích hằng ngày, không phải
 * đề tài báo chí. Sửa danh sách này nếu thấy lọt/lọc nhầm.
 */
const NOISE_PATTERNS = [
  /xổ số|xsmb|xsmn|xsmt|kết quả xs|kqxs/i,
  /giá vàng|giá xăng|giá heo|giá lợn|giá bạc|giá cà phê|giá tiêu/i,
  /tỷ giá|đô la mỹ|usd hôm nay|euro hôm nay/i,
  /lịch âm|ngày tốt|tử vi|xem bói/i,
  /dự báo thời tiết|thời tiết hôm nay/i,
  /lich thi dau|ket qua bong da hom nay/i,
  // Tra lịch/bảng xếp hạng giải đấu — tiện ích, không phải tin.
  /lich (ngoai hang anh|la liga|serie a|c1|cup)|bang xep hang|bxh/i,
  // Tìm chỗ xem trận đấu. Đây là nhóm chiếm sóng Google Trends VN mỗi tối có
  // bóng đá: người ta gõ để bấm vào xem ngay, không ai gõ để đọc bài.
  /trực tiếp|truc tiep|link xem|livestream|full trận|full tran/i,
  // "napoli đấu với bologna", "mu vs liverpool" — tra cặp đấu, không phải tin.
  /\bđấu với\b|\bdau voi\b|\bvs\.?\b|\bgặp\b.*\bvòng\b/i,
  // "90 phút", "45 phút" — tên khung giờ/chương trình, không thành đề tài.
  /^\d{1,3}\s*(phút|phut)$/i,
  // Tra cứu tiện ích — người ta gõ để dùng, không phải để đọc tin.
  /lịch cúp điện|cắt điện|tra cứu|số điện thoại|mã vùng|bảng giá|tra điểm/i,
  // Từ khoá là tên miền: "edu.vn", "abc.com" — không thành đề tài được.
  /^[\w-]+\.(vn|com|net|org|edu|gov)$/i,
];

/**
 * Danh từ chung trần trụi. Google Trends VN hay đẩy lên những từ như "phường",
 * "bệnh viện", "máy móc" — đúng là đang hot nhưng không nói lên chuyện gì.
 */
const GENERIC_WORDS = new Set(
  [
    "phường", "xã", "huyện", "tỉnh", "quận", "thành phố",
    "bệnh viện", "trường học", "công ty", "ngân hàng", "máy móc",
    "học sinh", "sinh viên", "giáo viên", "bác sĩ", "công an",
    "thời tiết", "bóng đá", "điện thoại", "xe máy", "ô tô",
  ].map((w) => stripDiacritics(w)),
);

/** Bỏ từ khoá quá ngắn/mơ hồ như "đất", "đâm" — không đủ thành đề tài. */
function isTooVague(keyword) {
  // So khớp trên bản không dấu: Google Trends trả về cả "phường" lẫn "phuong".
  const k = stripDiacritics(keyword.trim().toLowerCase());
  if (GENERIC_WORDS.has(k)) return true;
  const words = k.split(/\s+/);
  // Một chữ thì phải đủ dài mới mong là tên riêng; ngưỡng cũ (6) lọt cả
  // "phường", "edu.vn".
  if (words.length < 2 && k.length < 10) return true;
  // Hai chữ mà cả hai đều là danh từ chung thì cũng chẳng thành đề tài.
  if (words.length === 2 && words.every((w) => GENERIC_WORDS.has(w))) return true;
  return false;
}

export function isNoise(keyword) {
  const bare = stripDiacritics(keyword);
  const hit = (re) => re.test(keyword) || re.test(bare);
  return NOISE_PATTERNS.some(hit) || isTooVague(keyword);
}

// ------------------------------------------------------------- chấm điểm
/**
 * Điểm khởi đầu theo nguồn — đo "bao nhiêu người đang thật sự quan tâm".
 * Google Trends VN đứng đầu vì nó đo lượt tìm kiếm thật của người Việt hôm nay;
 * feed RSS quốc tế đứng cuối vì nó chỉ nói "toà soạn này vừa đăng", không nói
 * được có ai đọc hay không.
 */
export const SOURCE_HEAT = {
  "google-trends-vn": 32,
  "google-trends-global": 16,
  "youtube-vn": 30,
  "google-news-vn": 26,
  reddit: 14,
  "rss-vn": 18,
  "rss-intl": 10,
};

const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));

/**
 * Quy "50.000+" hay "2M+" của Google Trends, hay số lượt xem YouTube, hay số
 * upvote Reddit, thành điểm cộng theo thang log — chênh nhau 10 lần mới đáng
 * một bậc, vì giữa 20.000 và 50.000 lượt tìm kiếm gần như không khác gì nhau.
 */
export function volumeBonus(raw, { cap = 25, floor = 1000 } = {}) {
  const text = String(raw ?? "").replace(/[.,\s]/g, "").toLowerCase();
  const m = text.match(/(\d+(?:\.\d+)?)([km])?/);
  if (!m) return 0;
  let n = Number(m[1]);
  if (m[2] === "k") n *= 1e3;
  if (m[2] === "m") n *= 1e6;
  if (!Number.isFinite(n) || n < floor) return 0;
  return clamp(Math.round((Math.log10(n / floor) / 3) * cap), 0, cap);
}

/**
 * Chấm một đề tài ứng viên.
 *
 * CHỈ chấm trên `topic` và `extra`. Tuyệt đối không chấm trên phần ghi chú
 * dựng sẵn của nguồn: ghi chú có chứa tên truy vấn ("Việt Nam – Trung Quốc"),
 * tên feed, nhãn nội bộ — chấm luôn cả đó thì mọi kết quả của truy vấn ấy đều
 * tự khớp từ khoá của chính nó, và "India and China aim for stable relations"
 * bị gắn nhãn đề tài Việt Nam.
 *
 * @param {object} c
 * @param {string} c.topic    tít hoặc từ khoá
 * @param {string} [c.extra]  văn bản thật sự thuộc về đề tài (tít bài liên quan)
 * @param {string} c.origin   khoá trong SOURCE_HEAT
 * @param {number} [c.bonus]  điểm cộng riêng của nguồn (lượt tìm/xem/upvote)
 * @returns {{score:number, vietnam:boolean, priority:boolean, reasons:string[]}}
 */
export function scoreTopic(c) {
  const text = stripDiacritics(`${c.topic ?? ""}\n${c.extra ?? ""}`).toLowerCase();
  const reasons = [];
  const words = String(c.topic ?? "").trim().split(/\s+/).length;

  // Lịch/kết quả thi đấu lọt vào qua đường Google News: "Chinese Taipei vs
  // Vietnam - Football Women's" khớp đủ cả "Việt Nam" lẫn "Trung Quốc" nên
  // được tận 96 điểm, trong khi nó chỉ là một dòng lịch thi đấu.
  //
  // Phải CẮT NGANG chứ không trừ điểm: trừ bao nhiêu cũng không đủ khi nó vẫn
  // ôm trọn +35 ưu tiên Trung Quốc ↔ Việt Nam và +20 nhắc Việt Nam. Đây không
  // phải câu chuyện viết được, nên đừng chấm nó như một câu chuyện.
  //
  // Nhận dạng theo hình dạng "A vs B" trong một tít ngắn. Tin thật có chữ "vs"
  // — một vụ kiện, một cuộc so kè — bao giờ cũng dài hơn vì còn phải kể đã xảy
  // ra chuyện gì ("Apple vs Epic ruling could reshape the App Store...").
  if (/(?<![a-z0-9])vs\.?(?![a-z0-9])/i.test(stripDiacritics(c.topic ?? "")) && words <= 8) {
    return {
      score: -50,
      vietnam: false,
      priority: false,
      reasons: ["−50 chỉ là một dòng lịch/kết quả thi đấu, không phải câu chuyện"],
    };
  }

  let score = (SOURCE_HEAT[c.origin] ?? 0) + (c.bonus ?? 0);

  const vnHits = hits(RE_VN, text);
  const sovHits = hits(RE_SOVEREIGNTY, text);
  const chinaHits = hits(RE_CHINA, text);
  const impactHits = hits(RE_CHINA_IMPACT, text);

  // Chủ quyền thì luôn ưu tiên. Trung Quốc chỉ thành ưu tiên khi đứng cạnh
  // Việt Nam, hoặc cạnh một thứ mà Việt Nam chịu tác động trực tiếp (đập trên
  // sông Mekong, cáp biển, thuế quan, dịch chuyển nhà máy).
  const chinaAngle =
    chinaHits.length > 0 && (vnHits.length > 0 || impactHits.length > 0);
  const priority = sovHits.length > 0 || chinaAngle;

  // Nguồn Việt thì mặc nhiên là đề tài Việt Nam, khỏi cần tít nhắc tên nước.
  const vnBySource =
    c.origin === "google-trends-vn" || c.origin === "youtube-vn" ||
    c.origin === "rss-vn" || c.origin === "google-news-vn";
  // Nhóm ưu tiên cũng tính là đề tài Việt Nam kể cả khi tít không có chữ
  // "Vietnam": một cái đập mới trên sông Mekong hay một tàu hải cảnh ở Trường
  // Sa là chuyện của Việt Nam, dù báo nước ngoài viết theo góc nào.
  const vietnam = vnBySource || vnHits.length > 0 || priority;

  if (sovHits.length) {
    score += 45;
    reasons.push(`chủ quyền/lãnh thổ (${sovHits.slice(0, 3).join(", ")})`);
  } else if (chinaAngle) {
    score += 35;
    reasons.push(
      `Trung Quốc ↔ Việt Nam (${[...chinaHits, ...impactHits].slice(0, 3).join(", ")})`,
    );
  }

  if (vnHits.length && !sovHits.length) {
    score += 20;
    reasons.push(`nhắc Việt Nam (${vnHits.slice(0, 3).join(", ")})`);
  }

  const interest = hits(RE_INTEREST, text);
  if (interest.length) {
    const add = clamp(interest.length * 8, 0, 24);
    score += add;
    reasons.push(`đang được bàn (${interest.slice(0, 3).join(", ")})`);
  }

  // Đã khớp được dấu hiệu nội dung nào chưa? Riêng "tầm ảnh hưởng" bên dưới
  // KHÔNG tính, vì nó khớp cả tên giải đấu, tên hãng — quá dễ, không chứng
  // minh được đây là một câu chuyện.
  const hasContentSignal =
    sovHits.length || chinaHits.length || vnHits.length || interest.length;

  const dry = hits(RE_DRY, text);
  if (dry.length) {
    const sub = clamp(dry.length * 15, 0, 45);
    score -= sub;
    reasons.push(`−${sub} tin nội bộ ngành/nghi lễ (${dry.slice(0, 3).join(", ")})`);
  }

  // Tầm ảnh hưởng. Cộng khi có, trừ khi không — phần 30% quốc tế chỉ có vài
  // suất, nên một tin thế giới phải tự chứng minh nó lớn thì mới được chiếm
  // chỗ. Không chạm tới nước/hãng nào người Việt theo dõi thì gần như chắc là
  // tin địa phương của một nơi rất xa.
  const globalHits = hits(RE_GLOBAL, text);
  if (globalHits.length) {
    score += 15;
    reasons.push(`tầm ảnh hưởng (${globalHits.slice(0, 3).join(", ")})`);
  } else if (!vietnam) {
    score -= 25;
    reasons.push("−25 không có tầm ảnh hưởng tới bạn đọc Việt");
  }

  // Từ khoá Google Trends mà không khớp được dấu hiệu nội dung nào, lại chỉ vài
  // chữ, thì đó là câu người ta gõ vào ô tìm kiếm chứ chưa phải một câu chuyện
  // — "phil foden", "iphone 18 gia bao nhieu". Bảng từ khoá rác không đuổi kịp
  // nhóm này vì mỗi ngày lại là một cái tên mới, nên chặn theo hình dạng.
  const bareQuery =
    String(c.origin ?? "").startsWith("google-trends") &&
    !hasContentSignal &&
    words <= 3;
  if (bareQuery) {
    score -= 30;
    reasons.push("−30 mới là từ khoá tra cứu, chưa thành câu chuyện");
  }

  return { score: Math.round(score), vietnam, priority, reasons };
}

/**
 * Lấy `limit` đề tài điểm cao nhất, nhưng đặt trần số suất cho mỗi nguồn.
 *
 * Vì sao cần trần: điểm số hay hoà hàng loạt — mọi kết quả của cùng một truy
 * vấn Google News đều cùng một công thức cộng trừ nên cùng điểm — và sắp xếp
 * thuần theo điểm thì cả hạn ngạch rơi vào đúng một nguồn.
 *
 * Vì sao là TRẦN chứ không phải chia lượt đều: chia đều thì tới lượt thứ tư
 * của một nguồn mỏng, nó nhét vào một đề tài 2 điểm trong khi nguồn khác còn
 * cả trăm đề tài 40 điểm chưa được gọi. Trần giữ được thứ tự tốt-trước, chỉ
 * chặn đúng cái cần chặn là một nguồn nuốt hết.
 */
function takeSpread(list, limit, share) {
  const cap = Math.max(2, Math.ceil(limit * share));
  const used = new Map();
  const taken = new Set();
  for (const c of list) {
    if (taken.size >= limit) break;
    const n = used.get(c.origin) ?? 0;
    if (n >= cap) continue;
    used.set(c.origin, n + 1);
    taken.add(c);
  }
  // Trần là để ưu tiên đa dạng, không phải để bỏ trống hạn ngạch. Hôm nào chỉ
  // một nguồn có hàng đạt ngưỡng — hay xảy ra với phần quốc tế — thì lượt hai
  // lấy tiếp của chính nguồn đó cho đủ suất, vẫn theo thứ tự điểm.
  if (taken.size < limit) {
    for (const c of list) {
      if (taken.size >= limit) break;
      taken.add(c);
    }
  }
  return [...taken];
}

/**
 * Chọn đề tài theo hạn ngạch Việt Nam / quốc tế.
 *
 * Tỷ lệ được giữ theo ĐÚNG số thật sự chọn được, không phải theo `max`. Nếu
 * hôm nay chỉ gom được 5 đề tài Việt Nam thì quốc tế cũng chỉ được lấy 2 —
 * chứ không lấp đầy chỗ trống còn lại bằng tin quốc tế. 70/30 là chủ trương
 * nội dung, không phải cách lấp chỗ trống.
 *
 * `minScoreIntl` cao hơn `minScore` là cố ý. Một đề tài Việt Nam tầm thường
 * vẫn đáng viết cho bạn đọc Việt Nam; một đề tài quốc tế thì phải thật sự lớn
 * mới bõ chiếm một trong vài suất ít ỏi của phần 30% — không thì hàng đợi đầy
 * từ khoá tìm kiếm kiểu "russell wilson" của Google Trends Mỹ.
 */
export function pickWithQuota(
  candidates,
  { max, vnShare = 0.7, minScore = 0, minScoreIntl = minScore, maxPerOriginShare = 0.4 },
) {
  const sorted = [...candidates].sort((a, b) => b.score - a.score);
  const vn = sorted.filter((c) => c.vietnam && c.score >= minScore);
  const intl = sorted.filter((c) => !c.vietnam && c.score >= minScoreIntl);

  const vnTake = Math.min(vn.length, Math.round(max * vnShare));
  // Quốc tế bám theo số đề tài Việt Nam thật sự lấy được, và không bao giờ
  // vượt hạn ngạch danh nghĩa của nó. Không có đề tài Việt nào thì hôm đó
  // quốc tế được lấy đủ `max` — thà có tin còn hơn hàng đợi rỗng.
  const intlCap = vn.length
    ? Math.min(max - vnTake, Math.round((vnTake * (1 - vnShare)) / vnShare))
    : max;
  const intlTake = Math.min(intl.length, Math.max(0, intlCap));

  const picked = [
    ...takeSpread(vn, vnTake, maxPerOriginShare),
    ...takeSpread(intl, intlTake, maxPerOriginShare),
  ].sort((a, b) => b.score - a.score);

  return {
    picked,
    stats: {
      pool: candidates.length,
      belowMinScore: candidates.length - vn.length - intl.length,
      vnAvailable: vn.length,
      intlAvailable: intl.length,
      vnTake: picked.filter((c) => c.vietnam).length,
      intlTake: picked.filter((c) => !c.vietnam).length,
      perOriginShare: maxPerOriginShare,
    },
  };
}
