#!/usr/bin/env bash
# .claude/hooks/reviewer-auto-trigger.sh
# PostToolUse(Edit|Write) — 경계/계약 파일 변경 후 reviewer(Tier 2-A) 호출 권장 알림(advisory, exit 0).
# _routing.md reviewer 자동 트리거 조건의 환기 — 차단/자동호출 아님(메인 세션이 판단·호출).
# ClaudeDev reviewer-auto-trigger 참고, AgentDeck 경계로 적응.

set -e
. "$(dirname "$0")/hook-common.sh"
parse_hook_payload

FP="$TOOL_INPUT_FILE_PATH"
[ -z "$FP" ] && exit 0
FP_N="$(printf '%s' "$FP" | tr '\\' '/')"

# 테스트 변경은 트리거 아님
case "$FP_N" in
  */tests/*|*.test.ts|*.test.tsx|*.spec.ts|*.spec.tsx) exit 0 ;;
esac

REASON=""
case "$FP_N" in
  *02.Source/shared/*)         REASON="02.Source/shared 공유계약";;
  *02.Source/preload/*)        REASON="preload 노출(신뢰경계)";;
  *02.Source/main/01_agents/*) REASON="backend-contract(Claude/Codex 어댑터)";;
esac
[ -z "$REASON" ] && exit 0

echo "🔍 reviewer-auto-trigger: '$(basename "$FP_N")' ($REASON) 변경 — _routing.md상 reviewer(Tier 2-A) 자동 트리거 대상. 변경 마무리 후 reviewer 점검 권장." >&2
exit 0
