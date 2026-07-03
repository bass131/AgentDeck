#!/usr/bin/env bash
# .claude/hooks/dangerous-cmd-guard.sh
# PreToolUse(Bash) — 파괴 명령 차단 (exit 2 = block). ClaudeDev 패턴 정합.
#
# 본질: Python shlex.split 토큰화 매칭 → 따옴표 안 literal은 데이터 토큰으로 분리(false positive 회피),
#       실행 명령 토큰만 차단. 정말 필요하면 외부 셸(Git Bash 직접)에서 실행.
# 정책: 00.Documents/ADR.md ADR-011 (비가역 사람 게이트) + CLAUDE.md.

set -e
. "$(dirname "$0")/hook-common.sh"
parse_hook_payload

COMMAND="$TOOL_INPUT_COMMAND"
[ -z "$COMMAND" ] && exit 0

# 2026-07-04 python(MS Store 스텁 — 무력화 실측) → node 공용 토크나이저 전환(hook-common).
mapfile -t TOKENS < <(shell_tokens "$COMMAND")

[ ${#TOKENS[@]} -eq 0 ] && exit 0

has_token() { local target="$1"; shift; local t; for t in "$@"; do [ "$t" = "$target" ] && return 0; done; return 1; }
joined=" ${TOKENS[*]} "

block() { echo "🛑 dangerous-cmd-guard 차단: $1" >&2; echo "   정말 필요하면 외부 Git Bash에서 직접 실행하세요." >&2; exit 2; }

CMD="${TOKENS[0]}"

# rm -rf / rm -fr (재귀 강제 삭제)
if [ "$CMD" = "rm" ]; then
  if has_token "-rf" "${TOKENS[@]}" || has_token "-fr" "${TOKENS[@]}" \
     || { has_token "-r" "${TOKENS[@]}" && has_token "-f" "${TOKENS[@]}"; } \
     || has_token "-Rf" "${TOKENS[@]}"; then
    block "rm 재귀 강제 삭제 (rm -rf)"
  fi
fi

# git 위험 작업
if [ "$CMD" = "git" ]; then
  case " ${TOKENS[1]:-} ${TOKENS[2]:-} " in
    *" reset "*) has_token "--hard" "${TOKENS[@]}" && block "git reset --hard (작업 손실)";;
  esac
  if has_token "push" "${TOKENS[@]}"; then
    { has_token "--force" "${TOKENS[@]}" || has_token "-f" "${TOKENS[@]}"; } && block "git push --force (이력 덮어쓰기)"
  fi
  has_token "clean" "${TOKENS[@]}" && { has_token "-fd" "${TOKENS[@]}" || has_token "-fdx" "${TOKENS[@]}"; } && block "git clean -fd (미추적 파일 삭제)"
fi

# 디스크 파괴/포맷류
case "$CMD" in
  mkfs|mkfs.*|format) block "디스크 포맷 명령";;
esac
case "$joined" in
  *" :(){ "*|*":(){ :|:& };:"*) block "fork bomb";;
esac

exit 0
