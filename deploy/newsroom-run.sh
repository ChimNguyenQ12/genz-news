#!/usr/bin/env bash
# Một lượt làm báo: lấy đề tài trong hàng đợi → giao cho Claude Code viết →
# bài dừng ở "chờ duyệt". Người vẫn là người bấm đăng.
#
#   genz-news-newsroom.sh              # viết tối đa MAX_ARTICLES bài
#   genz-news-newsroom.sh <id-đề-tài>  # viết đúng một đề tài (nút trong /admin)
#
#   crontab -e   (flock để lượt cron và lượt bấm nút không chồng lên nhau)
#   # 6h sáng Việt Nam (GMT+7) = 23h UTC:
#   0 23 * * * flock -n /var/lock/genz-news-newsroom.lock /usr/local/bin/genz-news-newsroom.sh
#
# Cần: đã cài claude (npm i -g @anthropic-ai/claude-code) và đã đăng nhập MỘT
# LẦN bằng tài khoản Claude (chạy "claude" rồi /login). Không dùng API trả tiền.
set -uo pipefail

REPO="${REPO:-/srv/genz-news/repo}"
ENV_FILE="${ENV_FILE:-/etc/genz-news/newsroom.env}"
APP_URL="${APP_URL:-http://127.0.0.1:5006}"
export DATABASE_PATH="${DATABASE_PATH:-/srv/genz-news/data/app.db}"
export APP_URL

# Thứ tự ưu tiên: biến môi trường > tệp cấu hình > mặc định. Để trống ở đây,
# điền mặc định sau khi đã đọc tệp.
MAX_ARTICLES="${MAX_ARTICLES:-}"
MAX_MINUTES="${MAX_MINUTES:-}"

log() { echo "$(date -Iseconds) $*"; }

db() {
  sqlite3 -cmd ".timeout 5000" "$DATABASE_PATH" "$1" 2>/dev/null
}

# Nháy đơn trong SQL phải nhân đôi, nếu không một dấu nháy trong tên đề tài
# hay trong câu báo lỗi là gãy cả câu lệnh.
sql_escape() { printf '%s' "$1" | sed "s/'/''/g"; }

# ---------------------------------------------------------------------------
# Nhịp tim: cho /admin/research biết máy có đang viết hay không.
#
# App nằm trong container nên không nhìn thấy tiến trình `claude` trên host.
# Trạng thái "in_progress" trong cơ sở dữ liệu chỉ nói "đã giao việc" — nếu
# lượt viết bị giết giữa chừng thì mục đó kẹt lại và trông y như đang chạy.
# Nên ở đây cứ 20 giây đập một nhịp xuống tệp trong thư mục dữ liệu dùng chung.
# ---------------------------------------------------------------------------
status() {
  node "$REPO/scripts/newsroom-status.mjs" "$@" 2>/dev/null || true
}

HEARTBEAT_PID=""
heartbeat_start() {
  ( while :; do sleep 20; status beat; done ) &
  HEARTBEAT_PID=$!
}
heartbeat_stop() {
  [ -n "$HEARTBEAT_PID" ] && kill "$HEARTBEAT_PID" 2>/dev/null
  HEARTBEAT_PID=""
}

[ -f "$ENV_FILE" ] || { log "THIẾU $ENV_FILE (tài khoản bot)"; exit 1; }

# Cấu hình do tổng biên tập đặt trong /admin/research, cất ở thư mục dữ liệu
# dùng chung giữa app (trong container) và script này (trên host).
SETTINGS="${SETTINGS:-$(dirname "$DATABASE_PATH")/newsroom-settings.json}"
if [ -r "$SETTINGS" ]; then
  SET_ENABLED="$(node -e 'try{const s=require(process.argv[1]);console.log(s.enabled===false?"0":"1")}catch(e){console.log("1")}' "$SETTINGS" 2>/dev/null)"
  [ -n "$MAX_ARTICLES" ] || MAX_ARTICLES="$(node -e 'try{const s=require(process.argv[1]);const n=Math.floor(Number(s.maxArticlesPerRun));console.log(Number.isFinite(n)&&n>0?Math.min(n,5):"")}catch(e){console.log("")}' "$SETTINGS" 2>/dev/null)"
  PRESS_IMAGES="$(node -e 'try{const s=require(process.argv[1]);console.log(s.pressImages===false?"0":"1")}catch(e){console.log("1")}' "$SETTINGS" 2>/dev/null)"
else
  SET_ENABLED=1
  PRESS_IMAGES=1
fi

# Tắt công tắc thì cron ngừng viết. Nút "Create Post" ở từng đề tài (có đối số
# id) vẫn chạy — đó là tổng biên tập chủ động yêu cầu, không phải máy tự làm.
if [ "$SET_ENABLED" = "0" ] && [ -z "${1:-}" ]; then
  log "Automatically Generate đang TẮT trong /admin/research — bỏ lượt này"
  exit 0
fi

# Dự phòng: nếu chưa có tệp cài đặt thì đọc tệp môi trường.
[ -n "$MAX_ARTICLES" ] || MAX_ARTICLES="$(sed -n 's/^MAX_ARTICLES=//p' "$ENV_FILE" | tail -1)"
[ -n "$MAX_MINUTES" ]  || MAX_MINUTES="$(sed -n 's/^MAX_MINUTES=//p'  "$ENV_FILE" | tail -1)"

# Số bài tối đa mỗi lượt cron. Mặc định 1, tức 2 bài/ngày với hai lượt. Mỗi bài
# mất 8–10 phút nên đây cũng là cách chặn tải cho máy chủ dùng chung.
[ -n "$MAX_ARTICLES" ] || MAX_ARTICLES=1
# Trần thời gian cả lượt, phòng khi một bài sa lầy.
[ -n "$MAX_MINUTES" ]  || MAX_MINUTES=50
# Trần thời gian cho MỘT bài. Khác MAX_MINUTES ở chỗ cái này ép được ngay giữa
# lúc claude đang chạy, còn MAX_MINUTES chỉ kiểm khi một bài đã xong. Mỗi bài
# bình thường mất 8–10 phút nên 25 phút là rộng rãi.
ARTICLE_TIMEOUT="${ARTICLE_TIMEOUT:-$(sed -n 's/^ARTICLE_TIMEOUT=//p' "$ENV_FILE" | tail -1)}"
[ -n "$ARTICLE_TIMEOUT" ] || ARTICLE_TIMEOUT=25m

case "$MAX_ARTICLES" in ''|*[!0-9]*) log "MAX_ARTICLES không phải số, dùng 1"; MAX_ARTICLES=1 ;; esac
case "$MAX_MINUTES"  in ''|*[!0-9]*) log "MAX_MINUTES không phải số, dùng 50"; MAX_MINUTES=50 ;; esac
command -v claude  >/dev/null || { log "chưa cài claude";  exit 1; }
command -v sqlite3 >/dev/null || { log "chưa cài sqlite3"; exit 1; }

# Giữ hiến chương (CLAUDE.md) và script luôn khớp bản đã deploy.
git -C "$REPO" fetch -q origin && git -C "$REPO" reset -q --hard origin/main || {
  log "không cập nhật được $REPO"; exit 1; }

# claude -p tìm .claude/skills/ theo THƯ MỤC ĐANG ĐỨNG, không phải theo REPO
# hay theo đường dẫn của chính script này. Lượt cron 06:00 vô tình đúng vì
# dòng crontab có "cd /srv/genz-news/repo &&" trước khi gọi script — nhưng
# lượt 18:00 (gọi thẳng, không cd) và mọi lượt bấm "Create Post" qua
# newsroom-watch.sh thì không. Thiếu dòng này, "Dùng skill viet-bai-toa-soan"
# trong prompt chỉ là lời nói vào khoảng không — không có skill nào để gọi.
cd "$REPO" || { log "không cd được vào $REPO"; exit 1; }

cleanup() {
  heartbeat_stop
  sed -i '/^NEWSROOM_REQUEST_ID=/d' "$ENV_FILE" 2>/dev/null
}
trap cleanup EXIT

# ---------------------------------------------------------------------------
# Viết MỘT bài. Đối số 1 (tuỳ chọn) là id đề tài cụ thể.
# Mã trả về: 0 = đã lưu bài, 1 = hỏng, 2 = hàng đợi rỗng, 3 = bỏ qua (nhạy cảm).
# ---------------------------------------------------------------------------
# Toàn bộ quy trình viết (tìm nguồn, kiểm chứng, dựng bài, ảnh, lưu) từng nằm
# NGUYÊN VĂN ở đây dưới dạng một heredoc ~230 dòng, lặp lại y hệt trong MỖI
# lượt gọi claude -p — tốn token cho đúng phần không đổi giữa các lần chạy.
# Giờ phần đó sống ở .claude/skills/viet-bai-toa-soan/SKILL.md (và
# lay-anh-bai-viet/SKILL.md cho riêng phần ảnh), chỉ tải vào khi Claude thực sự
# gọi skill — prompt ở đây chỉ còn phần THAY ĐỔI theo từng đề tài.
#
# "Ảnh báo chí" (đổi được ở /admin/research) truyền vào dưới dạng một chữ
# BẬT/TẮT, không phải cả đoạn hướng dẫn — chi tiết hai nhánh nằm trong skill
# lay-anh-bai-viet.
PRESS_LABEL="TẮT"
[ "${PRESS_IMAGES:-1}" = "1" ] && PRESS_LABEL="BẬT"

write_one() {
  local want="${1:-}" task_json req_id topic sensitive sensitive_note prompt still now reason rc

  # Kiểm lại mỗi vòng: một lượt deploy giữa chừng có thể vừa khởi động lại app,
  # mà bước lưu bài lại gọi HTTP vào chính app đó.
  curl -fsS "$APP_URL/api/health" >/dev/null || {
    log "app không trả lời, dừng lượt này"
    status finish --result=failed --error="App không trả lời, không lưu bài được."
    return 1; }

  if [ -n "$want" ]; then
    task_json="$(node "$REPO/scripts/newsroom-next.mjs" "--id=$want")"
  else
    task_json="$(node "$REPO/scripts/newsroom-next.mjs")"
  fi
  [ -n "$task_json" ] || {
    log "lấy đề tài hỏng"
    status finish --result=failed --error="Không lấy được đề tài từ hàng đợi."
    return 1; }

  case "$task_json" in
    *'"empty":true'*)
      status finish --result=empty
      return 2 ;;
    *'"skipped"'*)
      log "đề tài thuộc nhóm nhạy cảm, máy không viết: $task_json"
      status finish --result=skipped --error="Đề tài nhạy cảm, máy để lại cho người."
      return 3 ;;
  esac

  req_id="$(printf '%s' "$task_json" | sed -n 's/.*"id":"\([^"]*\)".*/\1/p')"
  topic="$(printf '%s' "$task_json" | sed -n 's/.*"topic":"\([^"]*\)".*/\1/p')"
  [ -n "$req_id" ] || {
    log "không đọc được id đề tài"
    status finish --result=failed --error="Không đọc được id đề tài."
    return 1; }

  log "nhận đề tài [$req_id] $topic"
  status start --id="$req_id" --topic="$topic" --step=writing
  heartbeat_start

  # Đề tài nhạy cảm được tổng biên tập bấm nút giao tận tay (--id=) thì vẫn
  # viết, nhưng phải nhắc lại luật trong prompt. newsroom-next.mjs trả về
  # "sensitive":"<từ khoá>" khi khớp, "sensitive":null khi không.
  #
  # Biến này TỪNG bị quên gán: prompt có nhắc tới $sensitive_note trong khi
  # `set -u` bật, nên mọi lượt viết đều chết ngay ở dòng dựng prompt và Claude
  # nhận prompt rỗng ("Input must be provided..."). Luôn gán, kể cả gán rỗng.
  sensitive="$(printf '%s' "$task_json" | sed -n 's/.*"sensitive":"\([^"]*\)".*/\1/p')"
  sensitive_note=""
  if [ -n "$sensitive" ]; then
    sensitive_note=" [CHỦ ĐỀ NHẠY CẢM — khớp từ khoá \"$sensitive\". Chỉ dùng phát ngôn chính thức có nguồn rõ ràng, theo mục \"Chủ đề nhạy cảm\" trong CLAUDE.md.]"
  fi

  # Trả đề tài về hàng đợi để lượt sau còn làm lại, kèm lý do để màn hình
  # /admin/research nói được là lượt trước hỏng vì cái gì. Không có dòng lý do
  # này thì mục quay về "chờ xử lý" trông y hệt đề tài chưa ai đụng tới.
  release() {
    reason="$(sql_escape "$1")"
    now="$(date -u +%Y-%m-%dT%H:%M:%S.000+00:00)"
    db "UPDATE research_requests SET status='pending', assignedAt=NULL, \
        lastError='$reason', reporterNote='$reason', updatedAt='$now' WHERE id='$req_id';"
  }

  # Lệnh lưu bài cần biết đóng mục nào trong hàng đợi. Ghi vào tệp môi trường
  # thay vì truyền qua prompt — Claude không cần thấy, và không sửa được.
  sed -i '/^NEWSROOM_REQUEST_ID=/d' "$ENV_FILE"
  echo "NEWSROOM_REQUEST_ID=$req_id" >> "$ENV_FILE"

  # Dùng heredoc thay vì gán chuỗi trong nháy kép: nội dung prompt có cả dấu
  # nháy kép lẫn nháy đơn, nhét thẳng vào "..." là shell đóng chuỗi giữa chừng
  # và báo "unbound variable". Heredoc không trích dấu vẫn thay được biến.
  #
  # Chỉ còn phần THAY ĐỔI theo từng đề tài — quy trình cố định (tìm nguồn,
  # kiểm chứng, dựng bài, ảnh, lưu) nằm ở skill viet-bai-toa-soan, Claude tự
  # tải vào khi gọi tới. Trước đây prompt này dài hơn 200 dòng và lặp lại
  # NGUYÊN VĂN ở mọi lượt gọi claude -p, kể cả khi chỉ đổi có mỗi đề tài.
  prompt="$(cat <<PROMPTEOF
Dùng skill "viet-bai-toa-soan" để xử lý đề tài sau trong hàng đợi toà soạn.$sensitive_note

$task_json

requestId: $req_id
Tệp lưu: /tmp/bai-$req_id.json
Ảnh báo chí (nguồn của chính bài báo gốc): $PRESS_LABEL
Bắt buộc: title, dek, body viết bằng tiếng Việt; JSON field "language" = "vi".
Nguồn quốc tế chỉ là tài liệu tham khảo, không phải ngôn ngữ đầu ra.
PROMPTEOF
)"

  # Danh sách công cụ mở đúng hai lệnh của toà soạn. Thiếu genz-news-fetch-image
  # ở đây thì bước 5 trong prompt là lời nói suông — Claude xin chạy lệnh, bị
  # từ chối, và mọi bài ra đời không có lấy một tấm ảnh.
  #
  # Edit phải có bên cạnh Write. Claude ghi JSON bài bằng Write rồi gần như lúc
  # nào cũng sửa lại một chữ bằng Edit; thiếu Edit thì nó dừng lại xin phép —
  # mà chạy dưới cron thì không có ai để trả lời. Ngày 13/09/2026 đúng chuyện
  # đó làm hỏng hai lượt liền rồi treo lượt thứ ba suốt 15 tiếng.
  #
  # timeout là chốt chặn cuối. MAX_MINUTES chỉ được kiểm GIỮA các bài, nên một
  # bài treo thì vòng lặp không bao giờ quay lại để kiểm. Mà lượt viết lại giữ
  # flock dùng chung với cron 06:00/18:00 — một tiến trình treo là mọi lượt sau
  # đó chết lặng, không một dòng log. TERM trước, 60 giây sau chưa chết thì KILL.
  # "Skill" phải có trong danh sách: thiếu nó thì lời mời "Dùng skill ..." ở
  # đầu prompt là lời nói suông — Claude xin gọi, bị chặn quyền, và tự bịa lại
  # quy trình từ trí nhớ thay vì đọc đúng skill (mà trí nhớ thì không có phần
  # ngưỡng nguồn/ảnh đã tinh chỉnh riêng cho toà soạn này).
  if timeout --signal=TERM --kill-after=60 "${ARTICLE_TIMEOUT}" \
     claude -p "$prompt" \
       --allowed-tools "Skill" "WebSearch" "WebFetch" "Read" "Grep" "Glob" "Write" "Edit" \
                       "Bash(genz-news-fetch-image:*)" \
                       "Bash(genz-news-save-article:*)" ; then
    log "Claude chạy xong lượt [$req_id]"
  else
    rc=$?
    if [ "$rc" -eq 124 ] || [ "$rc" -eq 137 ]; then
      log "lượt [$req_id] quá $ARTICLE_TIMEOUT, đã giết để nhả khoá"
      heartbeat_stop
      release "Lượt viết lúc $(date -Iseconds) bị giết vì chạy quá $ARTICLE_TIMEOUT. Thường là Claude dừng hỏi quyền một công cụ không nằm trong --allowed-tools."
      status finish --result=failed --error="quá giờ ($ARTICLE_TIMEOUT): $topic"
      return 1
    fi
    log "lượt [$req_id] hỏng, trả đề tài về hàng đợi"
    heartbeat_stop
    release "Lượt viết lúc $(date -Iseconds) hỏng giữa chừng (claude thoát với mã lỗi). Xem /var/log/genz-news-newsroom.log."
    status finish --result=failed --error="claude thoát với mã lỗi khi viết: $topic"
    return 1
  fi

  heartbeat_stop

  # Claude có thể kết thúc mà không lưu gì (không đủ nguồn). Khi đó mục vẫn
  # "in_progress" — trả về hàng đợi thay vì để nó kẹt mãi.
  still="$(db "SELECT status FROM research_requests WHERE id='$req_id';" | tr -d '\r\n')"
  if [ "$still" = "in_progress" ]; then
    log "Claude không lưu bài nào — trả đề tài về hàng đợi. Xem các dòng ngay"
    log "trên để biết vì sao (thiếu nguồn, bị bộ kiểm từ chối, hay lỗi hệ thống)."
    release "Chạy xong nhưng không lưu được bài, hoặc bị bộ kiểm của lệnh lưu từ chối. Thử giao lại hoặc tự viết."
    status finish --result=failed --error="Chạy xong nhưng không lưu bài nào: $topic"
    return 1
  fi

  status finish --result=saved
  return 0
}

# ---------------------------------------------------------------------------

# Có id cụ thể (nút trong /admin/research) thì làm đúng bài đó rồi thôi.
if [ -n "${1:-}" ]; then
  write_one "$1"
  exit $?
fi

# Không có id: viết liên tiếp cho tới khi hết đề tài, hết quota bài, hoặc hết giờ.
DEADLINE=$(( $(date +%s) + MAX_MINUTES * 60 ))
WROTE=0
FAILS=0

for i in $(seq 1 "$MAX_ARTICLES"); do
  if [ "$(date +%s)" -ge "$DEADLINE" ]; then
    log "hết trần $MAX_MINUTES phút cho lượt này, dừng"
    break
  fi

  log "--- bài $i/$MAX_ARTICLES ---"
  write_one ""
  case $? in
    0) WROTE=$((WROTE + 1)); FAILS=0 ;;
    2) log "hàng đợi rỗng, không còn gì để viết"; break ;;
    3) FAILS=0 ;;   # bỏ qua đề tài nhạy cảm, không tính là hỏng
    *)
      FAILS=$((FAILS + 1))
      # Hai lần hỏng liên tiếp thường là hỏng hệ thống chứ không phải xui một
      # đề tài. Dừng lại, đừng đốt thêm thời gian và quota.
      if [ "$FAILS" -ge 2 ]; then
        log "hai lượt hỏng liên tiếp, dừng để khỏi hỏng tiếp"
        break
      fi
      ;;
  esac
done

log "kết thúc: viết được $WROTE bài, đang chờ duyệt ở /admin"
