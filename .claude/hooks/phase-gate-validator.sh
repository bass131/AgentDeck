#!/usr/bin/env bash
# .claude/hooks/phase-gate-validator.sh
# PostToolUse(Edit|Write) — gate_version: 1 완료 보고를 엄격 검증(exit 2).
# 기존 추적 문서 중 gate_version이 없는 파일은 마이그레이션 전까지 advisory로 유예한다.

set -e
. "$(dirname "$0")/hook-common.sh"
parse_hook_payload

FP="$TOOL_INPUT_FILE_PATH"
[ -z "$FP" ] && exit 0
FP_N="$(printf '%s' "$FP" | tr '\\' '/')"

# 완료 보고 문서만 대상
case "$FP_N" in
  *-DONE.md|*_milestone-DONE.md) : ;;
  *) exit 0 ;;
esac

PROJ="${CLAUDE_PROJECT_DIR:-.}"
node "$_HOOK_LIB/done-report-policy.mjs" check "$PROJ" "$FP_N"
