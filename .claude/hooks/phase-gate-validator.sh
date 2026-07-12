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
# HR1 P04: 판정 semantics(exit code)는 node가 소유. node는 메시지를 stderr에만 쓴다 —
# 성공(exit 0) 시 advisory(legacy 유예 안내)는 stderr라 비가시였음(Sol 리뷰 [P2]) →
# 캡처해 systemMessage + notify로 승격. 실패(exit 2) 시 stderr를 모델에 재전달 + block 기록.
rc=0
GATE_MSG="$(node "$_HOOK_LIB/done-report-policy.mjs" check "$PROJ" "$FP_N" 2>&1)" || rc=$?
if [ "$rc" -eq 0 ]; then
  if [ -n "$GATE_MSG" ]; then
    emit_system_message "$GATE_MSG"
    log_guard_event "phase-gate-validator" "notify" "advisory: $(basename "$FP_N")"
  fi
  exit 0
fi
printf '%s\n' "$GATE_MSG" >&2
log_guard_event "phase-gate-validator" "block" "DONE 게이트 FAIL: $(basename "$FP_N") (exit $rc)"
exit "$rc"
