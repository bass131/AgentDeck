#!/usr/bin/env bash
# scripts/hooks/risk-detector.sh
# PreToolUse(Edit|Write) — 변경 파일 경로로 위험 깃발 자동 검출 → advisory 경고(exit 0, 차단 아님).
# 하네스 Layer "Risk Detector" (ClaudeDev 참고, 솔로+AI 적응). 인지 환기용 — 메인이 판단.
# 깃발: trust-boundary / backend-contract / shared-contract / harness.
#   (shared-contract = 옛 ClaudeDev shared-discipline-guard 역할 흡수 — IPC 계약 단일정의·양쪽 typecheck)
# 정책: CLAUDE.md CRITICAL(신뢰경계 불가침·엔진추상화 ADR-003·IPC 단일정의·하네스 사용자 통제).

set -e
. "$(dirname "$0")/hook-common.sh"
parse_hook_payload

FP="$TOOL_INPUT_FILE_PATH"
[ -z "$FP" ] && exit 0
FP_N="$(printf '%s' "$FP" | tr '\\' '/')"

FLAGS=""
add() { FLAGS="$FLAGS$1 "; }

# 신뢰경계: preload 노출 / main IPC 핸들러 / 엔진 어댑터(canUseTool·권한경계)
case "$FP_N" in
  *src/preload/*|*src/main/*ipc/*|*ClaudeCodeBackend*) add "trust-boundary";;
esac
# 백엔드 계약: AgentEvent 공통 타입 / AgentBackend 인터페이스 (전 어댑터 영향)
case "$FP_N" in
  *src/shared/agent-events*|*agents/AgentBackend*) add "backend-contract";;
esac
# 공유 계약: IPC 채널명/타입 단일정의 (main·renderer 양쪽 영향)
case "$FP_N" in
  *src/shared/ipc-contract*) add "shared-contract";;
esac
# 하네스: .claude/** (사용자 단독 통제)
case "$FP_N" in
  */.claude/*|.claude/*) add "harness(사용자-통제)";;
esac

[ -z "$FLAGS" ] && exit 0

echo "🚩 risk-detector: '$(basename "$FP_N")' 변경 → 깃발 [ ${FLAGS}]. CRITICAL 준수(신뢰경계/ADR-003/IPC 계약 단일정의) + shared-contract면 변경 후 양쪽 npm run typecheck + reviewer 권장." >&2
exit 0
