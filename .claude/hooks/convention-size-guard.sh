#!/usr/bin/env bash
# .claude/hooks/convention-size-guard.sh
# PostToolUse(Edit|Write) — 파일 줄 수 임계 경고 (God class 조기 경고). ClaudeDev 패턴 적응.
#
# God class 비대화 *조기 경고*. 차단 X (exit 0) — 거친 신호일 뿐. 정확한 판정은 reviewer + 사람.
#
# 임계 = 800줄 (TS/React 현실 반영 — ClaudeDev C# 600에서 상향).
# AgentDeck은 이미 초과한 큰 파일 다수(ClaudeCodeBackend·ipc-contract·appStore 등) →
# 리팩토링 전까지 경고 뜸 (의도된 신호 — refactor-sweep 추적 대상).

set -e
. "$(dirname "$0")/hook-common.sh"
parse_hook_payload

FP="$TOOL_INPUT_FILE_PATH"
[ -z "$FP" ] && exit 0
FP_N="$(printf '%s' "$FP" | tr '\\' '/')"

# 02.Source/ 내 .ts/.tsx 만 대상 (테스트·설정·문서 제외)
case "$FP_N" in
  */02.Source/*.ts|*/02.Source/*.tsx|02.Source/*.ts|02.Source/*.tsx) : ;;
  *) exit 0 ;;
esac
case "$FP_N" in
  *.test.ts|*.test.tsx|*.spec.ts|*.spec.tsx|*.d.ts) exit 0 ;;
esac

PROJ="${CLAUDE_PROJECT_DIR:-.}"
TARGET="$FP_N"
[ -f "$TARGET" ] || TARGET="$PROJ/$FP_N"
[ -f "$TARGET" ] || exit 0

THRESHOLD=800
LINES=$(wc -l < "$TARGET" 2>/dev/null | tr -d ' ')
[ -z "$LINES" ] && exit 0

if [ "$LINES" -gt "$THRESHOLD" ]; then
  # HR1 P04: stderr → stdout JSON systemMessage (사용자 가시화) + 원장 기록.
  emit_system_message "⚠️ convention-size: $(basename "$TARGET") = ${LINES}줄 (임계 ${THRESHOLD}). God class 의심 — 2+ 책임이면 모듈 분리 점검 권장. (차단 아님 — 조기 경고. 정확한 판정은 reviewer / refactor-sweep)"
  log_guard_event "convention-size-guard" "notify" "$(basename "$TARGET") ${LINES}줄 (임계 ${THRESHOLD})"
fi

exit 0
