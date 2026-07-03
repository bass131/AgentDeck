#!/usr/bin/env bash
# .claude/hooks/supervisor-guard.sh
# PreToolUse(Bash|Edit|Write) — 2중 강제 (exit 2 = block):
#
# ① 하네스 봉인(전 에이전트 — 영호 2026-07-04 "명시적으로 풀기 전까지"):
#    .claude 하네스 구성(hooks/agents/policies/skills/commands/settings.json)·CLAUDE.md의
#    Edit/Write와 Bash 우회 쓰기(sed -i/tee/mv/cp/rm/touch/리다이렉트)를 메인·서브 불문 차단.
#    해제 = 영호가 본인 에디터에서 settings.json deny + 본 파일을 직접 수정.
#    예외(봉인 밖): .claude/state/**(work-pin)·.claude/CHANGELOG.md — secretary 운영 잡무 영역.
#
# ② Supervisor 전임(메인 세션만 — 영호 2026-07-04):
#    메인은 방향·위임·판단만. 코드(02.Source)·테스트(99.Others/tests) 편집 → 도메인 Worker/qa,
#    게이트 실행(npm run typecheck|test|lint|build, npx vitest|playwright|tsc)·git add/commit
#    → secretary로 위임 강제. 구분 키 = 서브에이전트 호출 payload에만 agent_type 존재
#    (2026-07-04 프로브 실측).

set -e
. "$(dirname "$0")/hook-common.sh"
parse_hook_payload

block() {
  echo "🛑 supervisor-guard 차단: $1" >&2
  echo "   → $2" >&2
  exit 2
}

# 하네스 구성 경로인가 (state/CHANGELOG 제외).
is_harness_path() {
  case "$1" in
    */.claude/hooks/*|*/.claude/agents/*|*/.claude/policies/*|*/.claude/skills/*|*/.claude/commands/*|*/.claude/settings.json|*/CLAUDE.md) return 0;;
  esac
  return 1
}

# ── ① 하네스 봉인 — 메인·서브 공통 (agent_type 무관, bypass보다 먼저) ────────
if [ "$TOOL_NAME" = "Edit" ] || [ "$TOOL_NAME" = "Write" ]; then
  P="$(printf '%s' "$TOOL_INPUT_FILE_PATH" | tr '\\' '/')"
  if is_harness_path "$P"; then
    block "하네스 편집($P) — 봉인 중" "영호가 명시적으로 해제(settings.json deny + supervisor-guard.sh 직접 수정)하기 전까지 하네스 변경 불가."
  fi
fi

if [ "$TOOL_NAME" = "Bash" ] && [ -n "$TOOL_INPUT_COMMAND" ]; then
  mapfile -t _T < <(shell_tokens "$TOOL_INPUT_COMMAND")
  if [ ${#_T[@]} -gt 0 ]; then
    _harness_ref=0; _write_verb=0
    for t in "${_T[@]}"; do
      tp="$(printf '%s' "$t" | tr '\\' '/')"
      is_harness_path "$tp" && _harness_ref=1
      case "$t" in sed|tee|mv|cp|rm|touch|truncate|'>'|'>>') _write_verb=1;; esac
    done
    if [ $_harness_ref -eq 1 ] && [ $_write_verb -eq 1 ]; then
      block "하네스에 대한 셸 쓰기 시도 — 봉인 중" "영호 명시 해제 전까지 하네스 변경 불가(읽기·git add/commit은 허용)."
    fi
  fi
fi

# ── 서브에이전트(Worker·secretary·판정) = 이하 Supervisor 규칙 면제 ─────────
[ -n "$AGENT_TYPE" ] && exit 0

# ── ② Supervisor 전임 — 메인 세션만 ────────────────────────────────────────
if [ "$TOOL_NAME" = "Edit" ] || [ "$TOOL_NAME" = "Write" ]; then
  P="$(printf '%s' "$TOOL_INPUT_FILE_PATH" | tr '\\' '/')"
  case "$P" in
    */02.Source/*) block "앱 코드 편집($P)" "도메인 Worker(main-process/agent-backend/renderer/shared-ipc)에 위임하세요.";;
    */99.Others/tests/*) block "테스트 편집($P)" "qa Worker에 위임하세요.";;
  esac
  exit 0
fi

if [ "$TOOL_NAME" = "Bash" ]; then
  [ -z "$TOOL_INPUT_COMMAND" ] && exit 0
  mapfile -t TOKENS < <(shell_tokens "$TOOL_INPUT_COMMAND")
  [ ${#TOKENS[@]} -eq 0 ] && exit 0

  # 인접 토큰 검사(부분문자열 오탐 방지 — dangerous-cmd-guard 토큰화 관례).
  i=0
  n=${#TOKENS[@]}
  while [ $i -lt $n ]; do
    t="${TOKENS[$i]}"
    next="${TOKENS[$((i+1))]:-}"
    next2="${TOKENS[$((i+2))]:-}"
    case "$t" in
      git)
        case "$next" in
          add|commit) block "git $next" "커밋·스테이징은 secretary에 위임하세요.";;
        esac;;
      npm)
        if [ "$next" = "run" ]; then
          case "$next2" in
            typecheck*|test*|lint*|build*) block "npm run $next2" "회귀 게이트 실행은 secretary에 위임하세요.";;
          esac
        fi;;
      npx)
        case "$next" in
          vitest|playwright|tsc) block "npx $next" "테스트·타입검사 실행은 secretary에 위임하세요.";;
        esac;;
    esac
    i=$((i+1))
  done
fi

exit 0
