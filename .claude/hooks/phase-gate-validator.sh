#!/usr/bin/env bash
# .claude/hooks/phase-gate-validator.sh
# PostToolUse(Edit|Write) — 완료 보고(*-DONE.md / _milestone-DONE.md) 작성 시 5단계 구조 점검 → advisory(exit 0).
# ClaudeDev phase-gate-validator 적응(솔로: 복잡↑ Phase만 권장, advisory 선행 — 안정 후 exit2 승격 검토).
# 차단 아님 — 완료보고 일관성 환기. 5단계: 이슈→분석→구현→검증(회귀)→총평(다음).

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
TARGET="$FP_N"
[ -f "$TARGET" ] || TARGET="$PROJ/$FP_N"
[ -f "$TARGET" ] || exit 0   # 아직 디스크에 없으면(드문 타이밍) 통과

# 5단계 보고 마커 점검 — 느슨(키워드 또는 이모지 중 하나라도)
MISSING=""
grep -qiE "이슈|issue|🎯"        "$TARGET" 2>/dev/null || MISSING="$MISSING 이슈"
grep -qiE "분석|analysis|🤔"     "$TARGET" 2>/dev/null || MISSING="$MISSING 분석"
grep -qiE "구현|implement|🛠"     "$TARGET" 2>/dev/null || MISSING="$MISSING 구현"
grep -qiE "검증|회귀|test|🧪"     "$TARGET" 2>/dev/null || MISSING="$MISSING 검증"
grep -qiE "총평|다음|next|➡"      "$TARGET" 2>/dev/null || MISSING="$MISSING 총평/다음"

[ -z "$MISSING" ] && exit 0
echo "📋 phase-gate: '$(basename "$TARGET")' 완료보고에 5단계 섹션 누락 의심 →$MISSING. (이슈→분석→구현→검증→총평·다음. advisory — 복잡↑ Phase 권장)" >&2
exit 0
