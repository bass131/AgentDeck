#!/usr/bin/env bash
# scripts/hooks/circuit-breaker.sh
# PostToolUse — 같은 *변이* 도구(Edit|Write) N회 반복 시 사용자에게 알림(차단 X).
# 하네스 프레임워크 Layer 4 "Circuit Breaker". ClaudeDev 패턴 정합.
#
# 함정 회피: 비파괴 도구(Bash/Read/Grep/Glob)는 정당한 대량 반복(테스트/탐색)이라 제외.
#            런어웨이 감시는 변이 도구에 집중. 윈도우 5분.

set -e
. "$(dirname "$0")/hook-common.sh"
parse_hook_payload

[ -z "$TOOL_NAME" ] && exit 0
case "$TOOL_NAME" in
  Bash|Read|Grep|Glob|Task) exit 0 ;;
esac

PROJ="${CLAUDE_PROJECT_DIR:-.}"
LOG_FILE="$PROJ/.claude/state/circuit-breaker.log"
mkdir -p "$(dirname "$LOG_FILE")" 2>/dev/null || true

NOW=$(date +%s)
WINDOW_SEC=300
echo "$NOW $TOOL_NAME" >> "$LOG_FILE"

# 임계: pin 파일 등급 추출(없으면 보통=10)
PIN_FILE="$PROJ/.claude/state/current-pin.txt"
GRADE=""
[ -f "$PIN_FILE" ] && GRADE=$(grep -E '^(등급|grade):' "$PIN_FILE" 2>/dev/null | head -1 | awk -F': ' '{print $2}' | awk '{print $1}' || true)
case "$GRADE" in
  단순) THRESHOLD=5 ;; 보통) THRESHOLD=10 ;; 복잡) THRESHOLD=15 ;; 대규모) THRESHOLD=20 ;; *) THRESHOLD=10 ;;
esac

SINCE=$((NOW - WINDOW_SEC))
COUNT=$(awk -v s="$SINCE" -v t="$TOOL_NAME" '$1 >= s && $2 == t' "$LOG_FILE" 2>/dev/null | wc -l | tr -d ' ')

# 로그 가지치기
LINES=$(wc -l < "$LOG_FILE" 2>/dev/null | tr -d ' ' || echo 0)
if [ "${LINES:-0}" -gt 500 ]; then
  awk -v s="$SINCE" '$1 >= s' "$LOG_FILE" > "$LOG_FILE.tmp" 2>/dev/null && mv "$LOG_FILE.tmp" "$LOG_FILE" || true
fi

if [ "${COUNT:-0}" -ge "$THRESHOLD" ]; then
  echo "🔄 circuit-breaker: 최근 5분 '$TOOL_NAME' ${COUNT}회(임계 ${THRESHOLD}). 같은 접근 반복 중일 수 있습니다 — 전략 재검토를 권합니다." >&2
fi
exit 0
