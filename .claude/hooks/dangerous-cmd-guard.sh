#!/usr/bin/env bash
# .claude/hooks/dangerous-cmd-guard.sh
# PreToolUse(Bash) — 파괴 명령 차단 (exit 2 = block). ClaudeDev 패턴 정합.
#
# 본질: Claude 전용 Node shell-policy가 따옴표·명령 segment·Git 전역 옵션을 구조화해
#       실행 명령 토큰만 차단. 정말 필요하면 외부 셸(Git Bash 직접)에서 실행.
# 정책: 00.Documents/ADR.md ADR-011 (비가역 사람 게이트) + CLAUDE.md.

set -e
. "$(dirname "$0")/hook-common.sh"
parse_hook_payload

COMMAND="$TOOL_INPUT_COMMAND"
[ -z "$COMMAND" ] && exit 0
# HR1 P04 실측 박제(2026-07-12): exit-0 JSON permissionDecision:"deny" 경로가 PreToolUse에서 유효
# (프로브로 차단·사유 전달·systemMessage 병행 확인). 채택 여부는 AC "차단 여전히 exit 2"와의
# 충돌 때문에 영호 결정 대기 — 현행 exit 2 + guard-blocks.log 유지.

# HR1 P04: 차단 semantics(exit 2 + stderr=모델 피드백) 유지 + guard-blocks.log 원장 기록 추가.
block() { log_guard_event "dangerous-cmd-guard" "block" "$1"; echo "🛑 dangerous-cmd-guard 차단: $1" >&2; echo "   정말 필요하면 외부 Git Bash에서 직접 실행하세요." >&2; exit 2; }

REASON="$(printf '%s' "$COMMAND" | node "$_HOOK_LIB/shell-policy.mjs" dangerous 2>/dev/null)"
[ -n "$REASON" ] && block "$REASON"

exit 0
