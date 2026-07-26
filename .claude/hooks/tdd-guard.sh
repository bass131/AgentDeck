#!/usr/bin/env bash
# .claude/hooks/tdd-guard.sh
# PreToolUse(Edit|Write) — 구현 파일에 대응 테스트가 없으면 경고/차단.
# 하네스 프레임워크 Layer 4 "TDD Guard".
#
# 모드 (점진적 강제):
#   .claude/state/tdd-enforce 존재 → 차단(exit 2)
#   없으면(기본)               → 경고만(exit 0). 프로젝트 초기 스캐폴드 중 과차단 방지.
#   ▶ Phase 1(프로젝트 초기화 + Vitest 셋업) 완료 후 `touch .claude/state/tdd-enforce`로 차단 전환.
#
# 대상: 02_Source/ 아래 구현 .ts/.tsx (테스트·타입·설정·인덱스 배럴 제외).
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
  *02[._]Source/shared/*) exit 0 ;;                                 # 순수 타입/계약
  *.d.ts|*.config.ts|*.config.js|*/index.ts|*/preload/index.ts) exit 0 ;;
  *SampleData.ts|*sampleData.ts) exit 0 ;;                          # 목업/샘플 데이터(로직 없는 상수) — TDD 면제
  *02[._]Source/*.ts|*02[._]Source/*.tsx) : ;;                      # 대상
  *) exit 0 ;;                                                      # src 밖은 통과
esac

# 대응 테스트 추정: 파일명 기반으로 테스트 루트 아래 *.test.* 존재 여부.
# ⚠️ **위 대상 판정과 반드시 짝으로 갱신한다**(HR2 P07 — ADR-028 `:20`이 남긴 경고의 2회차).
# 대상 판정만 새 이름을 받으면 대응 테스트를 영영 못 찾아 전 파일 과차단(fail-closed)이고,
# 탐색만 고치면 여전히 fail-open이다. **부분 수정이 가장 나쁘다.**
# 테스트 루트는 신·구 **둘 다** 탐색한다(GATE_FLAG와 같은 OR 패턴). "실재하는 첫 폴더 하나만
# 고르는" 방식은 순서에 의존해서, 두 폴더가 공존하는 상황(부분 롤백·샌드박스 픽스처)에서
# 한쪽 테스트를 못 찾고 과차단한다 — 실제로 그 취약함을 P09에서 실측했다.
# 안내 메시지는 실재하는 첫 루트를 쓰므로 없는 경로를 안내하는 일이 없다.
BASE="$(basename "$FP_N")"
STEM="${BASE%.*}"
PROJ="${CLAUDE_PROJECT_DIR:-.}"
TESTS_RELS="99_Others/tests 99.Others/tests"
MSG_REL=""
for _rel in $TESTS_RELS; do
  [ -d "$PROJ/$_rel" ] || continue
  [ -n "$MSG_REL" ] || MSG_REL="$_rel"
  if ls "$PROJ/$_rel"/**/"$STEM".test.* "$PROJ/$_rel"/"$STEM".test.* 2>/dev/null | grep -q . \
     || grep -rqs --include="*.test.*" "$STEM" "$PROJ/$_rel" 2>/dev/null; then
    exit 0   # 대응 테스트 있음
  fi
done
[ -n "$MSG_REL" ] || MSG_REL="99_Others/tests"

MSG="⚠️ TDD-guard: '$BASE' 구현에 대응 테스트($MSG_REL/**/$STEM.test.*)가 안 보입니다. 헌법 CRITICAL: 테스트 먼저(TDD)."
if [ -f "$PROJ/.claude/state/tdd-enforce" ]; then
  # HR1 P04: 차단 semantics(exit 2 + stderr=모델 피드백) 유지 + 원장 기록 추가.
  log_guard_event "tdd-guard" "block" "$BASE 대응 테스트 부재 (차단 모드)"
  echo "$MSG (차단 모드) — 먼저 실패 테스트를 작성하세요." >&2
  exit 2
else
  # HR1 P04: 경고 모드는 사용자 가시 채널(systemMessage) + 원장 기록.
  emit_system_message "$MSG (경고 모드 — 스캐폴드 중. Phase1 후 차단 전환)"
  log_guard_event "tdd-guard" "notify" "$BASE 대응 테스트 부재 (경고 모드)"
  exit 0
fi
