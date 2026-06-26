#!/usr/bin/env bash
# scripts/hooks/pin-injector.sh
# UserPromptSubmit 훅 — 작업 좌표 자동 주입 (입구 안전망). ClaudeDev 패턴 적응.
#
# 매 사용자 입력 직전 .claude/state/current-pin.txt 내용을 stdout으로 출력 →
# Claude Code가 이 출력을 사용자 prompt에 추가 컨텍스트로 주입.
# 학습 질문이나 옆길 대화 끼어들어도 다음 턴에 작업 좌표 자동 복원.
#
# 정책 참조: .claude/policies/pin-and-done.md (work-pin 압축 양식 ~30~40줄 목표).
#
# 확장: commit 안 된 -DONE.md 박제 검출 시 경고 주입 ("Phase 끝나면 commit 깜빡 위험" 안전망).

set -e

PROJ="${CLAUDE_PROJECT_DIR:-.}"
PIN_FILE="$PROJ/.claude/state/current-pin.txt"

# ─────────────────────────────────────────────
# 섹션 1 — 작업 좌표 핀 주입
# ─────────────────────────────────────────────
if [ -f "$PIN_FILE" ] && [ -s "$PIN_FILE" ]; then
  cat <<EOF
<work-pin source=".claude/state/current-pin.txt">
[자동 주입 — 학습 질문 끼어들어도 작업 좌표 잃지 않게 매 턴 컨텍스트 상단에 박힘. 갱신 정책 = .claude/policies/pin-and-done.md]

$(cat "$PIN_FILE")
</work-pin>
EOF
fi

# ─────────────────────────────────────────────
# 섹션 2 — commit 안 된 -DONE.md 박제 검출 (Phase 완료 깜빡 안전망)
# ─────────────────────────────────────────────
# -DONE.md는 *복잡/대규모* 등급만 박음. 박혀있는데 commit 안 된 건 깜빡 위험.
if command -v git >/dev/null 2>&1; then
  UNCOMMITTED_DONE=$(git status --porcelain 2>/dev/null | grep -E '\-DONE\.md$' || true)
  if [ -n "$UNCOMMITTED_DONE" ]; then
    cat <<EOF
<phase-completion-pending>
⚠️ commit 안 된 -DONE.md 박제가 있어요:

$UNCOMMITTED_DONE

Phase 완료 = -DONE.md 박제(복잡/대규모만) + commit + (선택)PR + 다음 액션.
지금 /session:end 호출하면 차근차근 안내합니다. 깜빡 안전망입니다.
(작업 막지 않음 — 경고만. 다른 작업 먼저 할 거면 그냥 진행.)
</phase-completion-pending>
EOF
  fi
fi

exit 0
