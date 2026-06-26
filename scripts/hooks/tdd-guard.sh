#!/usr/bin/env bash
# scripts/hooks/tdd-guard.sh
# PreToolUse(Edit|Write) — 구현 파일에 대응 테스트가 없으면 경고/차단.
# 하네스 프레임워크 Layer 4 "TDD Guard".
#
# 모드 (점진적 강제):
#   .claude/state/tdd-enforce 존재 → 차단(exit 2)
#   없으면(기본)               → 경고만(exit 0). 프로젝트 초기 스캐폴드 중 과차단 방지.
#   ▶ Phase 1(프로젝트 초기화 + Vitest 셋업) 완료 후 `touch .claude/state/tdd-enforce`로 차단 전환.
#
# 대상: src/ 아래 구현 .ts/.tsx (테스트·타입·설정·인덱스 배럴 제외).
# 정책: CLAUDE.md "새 기능 구현 시 테스트 먼저(TDD)".

set -e
. "$(dirname "$0")/hook-common.sh"
parse_hook_payload

FP="$TOOL_INPUT_FILE_PATH"
[ -z "$FP" ] && exit 0

# 정규화: 백슬래시 → 슬래시
FP_N="$(printf '%s' "$FP" | tr '\\' '/')"

# 구현 파일만 대상. 아래는 제외.
case "$FP_N" in
  */tests/*|*.test.ts|*.test.tsx|*.spec.ts|*.spec.tsx) exit 0 ;;   # 테스트 자체
  *src/shared/*) exit 0 ;;                                          # 순수 타입/계약
  *.d.ts|*.config.ts|*.config.js|*/index.ts|*/preload/index.ts) exit 0 ;;
  *SampleData.ts|*sampleData.ts) exit 0 ;;                          # 목업/샘플 데이터(로직 없는 상수) — TDD 면제
  *src/*.ts|*src/*.tsx) : ;;                                        # 대상
  *) exit 0 ;;                                                      # src 밖은 통과
esac

# 대응 테스트 추정: 파일명 기반으로 tests/ 아래 *.test.* 존재 여부.
BASE="$(basename "$FP_N")"
STEM="${BASE%.*}"
PROJ="${CLAUDE_PROJECT_DIR:-.}"

if ls "$PROJ"/tests/**/"$STEM".test.* "$PROJ"/tests/"$STEM".test.* 2>/dev/null | grep -q . \
   || grep -rqs --include="*.test.*" "$STEM" "$PROJ/tests" 2>/dev/null; then
  exit 0   # 대응 테스트 있음
fi

MSG="⚠️ TDD-guard: '$BASE' 구현에 대응 테스트(tests/**/$STEM.test.*)가 안 보입니다. 헌법 CRITICAL: 테스트 먼저(TDD)."
if [ -f "$PROJ/.claude/state/tdd-enforce" ]; then
  echo "$MSG (차단 모드) — 먼저 실패 테스트를 작성하세요." >&2
  exit 2
else
  echo "$MSG (경고 모드 — 스캐폴드 중. Phase1 후 차단 전환)" >&2
  exit 0
fi
