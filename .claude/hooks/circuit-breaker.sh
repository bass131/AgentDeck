#!/usr/bin/env bash
# .claude/hooks/circuit-breaker.sh
# PostToolUse — 폭주(runaway) 감지 알림. **차단하지 않는다**(exit 0 고정).
# 하네스 프레임워크 Layer 4 "Circuit Breaker". ClaudeDev 패턴 정합.
#
# 판정은 세 축이고 서로 다른 것을 본다. 발화 우선순위는 아래 순서다(구체적인 신호 우선) —
# stdout JSON이 둘이면 파서가 깨지므로 **한 번에 하나만** 낸다:
#   [B] 대상 축 — 같은 (주체, 도구, 대상) 조합 10회/5분. 등급 무관 고정 임계.
#       "진전이 있나". 2026-07-26 신설.
#   [A] 총량 축 — 같은 *변이* 도구(Edit|Write 등) N회/5분. 등급별 임계(단순 5 / 보통 10 /
#       복잡 15 / 대규모 20). "이 세션이 얼마나 많이 고치고 있나".
#   [C] 누적 체크포인트 — 같은 주체의 도구 호출 총계 100회 단위/60분. **판정이 아니라 알림**.
#       "얼마나 오래 돌고 있나". 2026-07-26 신설(CTO 검토 R1 봉합) — [A]·[B]가 함께 놓치는
#       "매번 조금씩 다른 Bash 명령을 시도하는 루프"를 덮는 유일한 축이다.
#
# ⭐ 왜 대상 축을 넣었나 (2026-07-26, 영호 결정 — `maxTurns` 폐기의 짝):
#   같은 날 정상 작업이 5분 안에 Edit 15회를 찍었다(에이전트 정의 10개 일괄 수정).
#   폭주가 아니라 정당한 작업인데 총량 축으로는 폭주와 구분되지 않는다 — 대규모 임계 20에
#   아슬아슬하게 못 미쳐 발화를 면했을 뿐이다. 같은 15회를 대상별로 쪼개면 파일당 1~2회다.
#   ⇒ 폭주의 신호는 "얼마나 많이 했나"가 아니라 **"진전이 있나"** 이고,
#      진전 없음은 *같은 대상을 반복하는 것*으로 나타난다.
#
# ⭐ 읽기 도구 면제를 대상 축에서는 풀었다:
#   면제의 근거는 "비파괴 도구는 정당한 대량 반복(테스트·탐색)이라 제외"였는데, 그건
#   **정당한 반복과 폭주를 구분할 수 없어서**지 폭주가 없어서가 아니다. 대상을 보면 구분된다 —
#   같은 파일을 10번 읽는 것은 정당한 반복이 아니다. 이 면제 때문에 읽기 전용 역할
#   (chief-tech-operator·reviewer·plan-auditor·coordinator)은 도구 목록이 정확히 면제 목록과
#   같아서 **지금까지 폭주 감지가 0이었다**. 총량 축의 면제는 그대로 둔다(읽기 총량은 정상적으로 많다).

set -e
. "$(dirname "$0")/hook-common.sh"
parse_hook_payload

[ -z "$TOOL_NAME" ] && exit 0

PROJ="${CLAUDE_PROJECT_DIR:-.}"
LOG_FILE="$PROJ/.claude/state/circuit-breaker.log"
mkdir -p "$(dirname "$LOG_FILE")" 2>/dev/null || true

NOW=$(date +%s)
WINDOW_SEC=300
SINCE=$((NOW - WINDOW_SEC))
# 누적 체크포인트 축([C])은 훨씬 긴 창을 본다 — 폭주가 아니라 "얼마나 오래 돌고 있나"라서.
BUDGET_WINDOW_SEC=3600
BUDGET_SINCE=$((NOW - BUDGET_WINDOW_SEC))

# ── 주체·대상 추출 ───────────────────────────────────────────────────────────
# 주체를 키에 넣지 않으면 메인과 모든 서브에이전트가 카운터를 공유한다 — 병렬 서브 3개가
# 각각 5회씩만 해도 15회로 합산돼 정상 작업이 폭주로 잡히고, 반대로 특정 서브의 폭주는
# 다른 활동에 묻힌다.
AGENT="${AGENT_TYPE:-main}"

case "$TOOL_NAME" in
  Edit|Write|NotebookEdit|Read) TARGET="$TOOL_INPUT_FILE_PATH" ;;
  Bash)                         TARGET="$TOOL_INPUT_COMMAND" ;;
  *)                            TARGET="" ;;
esac

# 대상은 공백·특수문자를 담으므로 그대로 넣으면 로그 필드가 깨진다 → 체크섬으로 고정폭 키화.
# 대상을 못 뽑는 도구(Grep·Glob·Task 등)는 '-'로 두고 대상 축 판정에서 제외한다.
if [ -n "$TARGET" ]; then
  TKEY=$(printf '%s' "$TARGET" | cksum 2>/dev/null | cut -d' ' -f1 || echo '-')
  [ -z "$TKEY" ] && TKEY='-'
else
  TKEY='-'
fi

# 로그 포맷: <epoch> <주체> <도구> <대상키>
echo "$NOW $AGENT $TOOL_NAME $TKEY" >> "$LOG_FILE"

# 로그 가지치기 — ⚠️ 보존 기준은 **가장 긴 판정 창**이어야 한다. 5분으로 자르면 누적 축이
# 볼 60분치가 사라져 그 축이 조용히 무력화된다(판정기를 죽이는 가장 흔한 경로가 이것이다).
LINES=$(wc -l < "$LOG_FILE" 2>/dev/null | tr -d ' ' || echo 0)
if [ "${LINES:-0}" -gt 2000 ]; then
  awk -v s="$BUDGET_SINCE" '$1 >= s' "$LOG_FILE" > "$LOG_FILE.tmp" 2>/dev/null && mv "$LOG_FILE.tmp" "$LOG_FILE" || true
fi

# ── [B] 대상 축 — 같은 (주체, 도구, 대상) 반복 ───────────────────────────────
# 임계 10의 근거(2026-07-26 실측): 그날 정상 작업의 *같은 파일* 최대 반복이 6회였다
# (`reporting-format.md`를 절별로 나눠 6번 편집). 임계를 그 근처에 두면 정상 작업이 계속
# 걸려 경보 피로가 생기고, 경보 피로는 진짜 신호를 무시하게 만든다 — 그래서 실측 최대의
# 약 1.6배에 둔다. 값을 바꾸려면 새 실측을 근거로 하고 이 주석을 함께 갱신할 것.
TARGET_THRESHOLD=10
FIRED=0

if [ "$TKEY" != '-' ]; then
  COUNT_T=$(awk -v s="$SINCE" -v a="$AGENT" -v t="$TOOL_NAME" -v k="$TKEY" \
    '$1 >= s && $2 == a && $3 == t && $4 == k' "$LOG_FILE" 2>/dev/null | wc -l | tr -d ' ' || echo 0)
  if [ "${COUNT_T:-0}" -ge "$TARGET_THRESHOLD" ]; then
    emit_system_message "🔁 circuit-breaker: 최근 5분 같은 대상에 '$TOOL_NAME' ${COUNT_T}회(임계 ${TARGET_THRESHOLD}) — 진전 없는 반복일 수 있습니다. 접근을 바꾸거나 막힌 지점을 보고하세요."
    log_guard_event "circuit-breaker" "notify" "같은 대상 $AGENT/$TOOL_NAME ${COUNT_T}회/5분 (임계 ${TARGET_THRESHOLD})"
    FIRED=1
  fi
fi

# ── [A] 총량 축 — 같은 변이 도구 반복(기존 판정, 회귀 없이 보존) ─────────────
# 비파괴 도구는 총량이 정상적으로 많으므로 이 축에서는 계속 제외한다.
# 두 축이 동시에 걸려도 알림은 하나만 낸다 — stdout JSON이 둘이면 파서가 깨지고,
# 대상 축이 더 구체적인 신호라 그쪽을 우선한다.
if [ "$FIRED" -eq 0 ]; then
  case "$TOOL_NAME" in
    Bash|Read|Grep|Glob|Task) ;;
    *)
      # 임계: pin 파일 등급 추출(없으면 보통=10)
      PIN_FILE="$PROJ/.claude/state/current-pin.txt"
      GRADE=""
      # 등급은 pin의 PHASE 줄 *중간*에 위치("/ 등급: 복잡…") — 줄머리 앵커는 조용히 죽는다
      # (2026-07-17 점검 🟡-12 실측: 임계 15여야 할 TG1에서 기본 10으로 발화). 값 매치로 추출.
      [ -f "$PIN_FILE" ] && GRADE=$(grep -oE '(등급|grade): ?(단순|보통|복잡|대규모)' "$PIN_FILE" 2>/dev/null | head -1 | grep -oE '(단순|보통|복잡|대규모)' || true)
      case "$GRADE" in
        단순) THRESHOLD=5 ;; 보통) THRESHOLD=10 ;; 복잡) THRESHOLD=15 ;; 대규모) THRESHOLD=20 ;; *) THRESHOLD=10 ;;
      esac

      COUNT=$(awk -v s="$SINCE" -v t="$TOOL_NAME" '$1 >= s && $3 == t' "$LOG_FILE" 2>/dev/null | wc -l | tr -d ' ' || echo 0)
      if [ "${COUNT:-0}" -ge "$THRESHOLD" ]; then
        # HR1 P04: stderr → stdout JSON systemMessage (사용자 가시화) + 원장 기록.
        emit_system_message "🔄 circuit-breaker: 최근 5분 '$TOOL_NAME' ${COUNT}회(임계 ${THRESHOLD}). 같은 접근 반복 중일 수 있습니다 — 전략 재검토를 권합니다."
        log_guard_event "circuit-breaker" "notify" "$TOOL_NAME ${COUNT}회/5분 (임계 ${THRESHOLD})"
        FIRED=1
      fi
      ;;
  esac
fi

# ── [C] 누적 체크포인트 — 같은 주체의 최근 60분 도구 호출 총계 ────────────────
# ⭐ 왜 필요한가 (2026-07-26 CTO 검토 R1 봉합): 앞의 두 축에는 **Bash 크기의 구멍**이 있다.
#   Bash의 대상 키는 명령 문자열 전체의 체크섬이라 명령이 한 글자만 달라도 카운터가 갈라지고
#   (대상 축 무력), 총량 축은 Bash를 아예 면제한다. 그래서 "매번 조금씩 다른 명령을 시도하는
#   진전 없는 루프"는 두 축 어디에도 걸리지 않는다. 위협 모델이 악의가 아니라 성실한
#   드리프트라 해도, 드리프트의 가장 흔한 형태가 정확히 이것이다.
#
# ⭐ 이 축은 **판정하지 않는다.** 총량으로 진전을 판정하려던 시도가 곧 `maxTurns`의 실패다.
#   대신 누적이 일정 단위에 닿을 때마다 상황을 알리고 **판단을 사람과 에이전트 자신에게
#   넘긴다.** 그래서 임계가 다소 틀려도 피해는 경보 피로뿐이고, 알림을 받은 에이전트가
#   "슬슬 정리해서 보고하자"고 스스로 조절할 여지가 생긴다.
#
# 임계 100의 근거(2026-07-26 실측, 이 로그 파일): 정상 장기 작업인 `chief-tech-operator`의
#   마일스톤 검토가 16분에 53회, 메인 세션이 60분에 49회였다. 100은 그 약 2배라 그런 작업이
#   한 번 받을까 말까 한 빈도다. 값을 바꾸려면 새 실측을 근거로 이 주석을 함께 갱신할 것.
#
# 배수에 **정확히 닿을 때만** 발화한다 — 창이 미끄러지며 임계 위에 머무르는 동안 매 호출마다
# 울리면 그 순간 경보 피로가 생긴다. 60분 창이라 같은 값에 두 번 닿을 수는 있으나, 그때의
# 피해는 알림 한 번 더가 전부다(상태 파일을 하나 더 두는 복잡도보다 싸다).
BUDGET_STEP=100
if [ "$FIRED" -eq 0 ]; then
  COUNT_B=$(awk -v s="$BUDGET_SINCE" -v a="$AGENT" '$1 >= s && $2 == a' "$LOG_FILE" 2>/dev/null | wc -l | tr -d ' ' || echo 0)
  if [ "${COUNT_B:-0}" -gt 0 ] && [ $((COUNT_B % BUDGET_STEP)) -eq 0 ]; then
    emit_system_message "📊 circuit-breaker: '$AGENT' 최근 60분 누적 도구 호출 ${COUNT_B}회. 폭주 판정이 아니라 체크포인트입니다 — 지금 하는 일이 목표에 다가가고 있는지, 중간 산출물을 보고할 시점은 아닌지 한 번 점검하세요."
    log_guard_event "circuit-breaker" "notify" "누적 체크포인트 $AGENT ${COUNT_B}회/60분 (단위 ${BUDGET_STEP})"
  fi
fi

exit 0
