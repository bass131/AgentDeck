#!/usr/bin/env bash
# .claude/hooks/supervisor-guard.sh
# PreToolUse(Bash|Edit|Write) — 2중 강제 (exit 2 = block):
#
# ① 하네스 봉인(전 에이전트 — 영호 2026-07-04 "명시적으로 풀기 전까지"):
#    .claude 하네스 구성(hooks/agents/policies/skills/commands/settings.json)·CLAUDE.md +
#    의미 정본 층(00_Documents/harness/**·adr/**·ADR.md — ADR-037, 2026-07-17 확장)의
#    Edit/Write와 Bash 우회 쓰기(sed/tee/mv/cp/rm/리다이렉트·node/PowerShell/perl/bash -c 내장 파일 API)를 메인·서브 불문 차단.
#    해제 = 영호가 본인 에디터에서 settings.json deny + 본 파일을 직접 수정.
#    예외(봉인 밖): .claude/state/**(work-pin)·.claude/CHANGELOG.md — secretary 운영 잡무 영역.
#
# ② 실행 경계(메인 세션만 — 잡무 기준 v1, 영호 2026-07-24, 구 Supervisor 전임 대체):
#    코드(02_Source)·테스트(99_Others/tests) 편집 → 도메인 Worker/qa 전임(규율 축),
#    게이트 실행(npm run typecheck|test|lint|build, npx vitest|playwright|tsc)·git add/commit
#    실행 → secretary 위임(과속방지턱 — 우회 가능해도 의도 노출·원장 기록이 가치).
#    01_Phases·pin·CHANGELOG 등 판단이 살아 있는 문서는 메인 직접(차단 제거) —
#    판정 정본 = .claude/policies/execution-owner.md. 구분 키 = 서브에이전트 호출
#    payload에만 agent_type 존재(2026-07-04 프로브 실측).
#
# ③ OpenGate(ADR-038, 영호 2026-07-24): 98_Management/Harness_OpenGate/의
#    OPEN/CLOSE 배치파일(영호 단독 실행)이 gate-open.flag(epoch초)로 창을 개폐.
#    flag 신선(TTL 7h, 하한 0) = 본 훅 전체 통과 + 원장 open-gate 기록. 만료·미래시각 = 봉인 복귀.
#    에이전트의 OpenGate **실행**(bat·실행기 경유)은 차단, **쓰기**는 아래 shell-policy가 sealed로
#    차단한다. 언급·읽기는 통과 — Read/Glob이 열려 있어 Bash만 막는 건 달성되지 않는 방어였다
#    (ADR-038 개정 1, 2026-07-25).

set -e
. "$(dirname "$0")/hook-common.sh"
parse_hook_payload
require_parsed_payload "supervisor-guard" # P05: 파서 사망 = 판정 불가 → fail-closed

# ── ③ OpenGate flag (ADR-038) — 영호가 배치파일로 연 창이면 전체 통과(원장 기록) ──
# ⚠️ **일원화 금지 지점**(HR2 P07, 2026-07-25 — 부트스트랩 자물쇠). 폴더 개명
# (98.Management → 98_Management, ADR-028 개정 1)은 봉인 대상 파일을 고치는 작업이라
# 창이 열려 있어야 수행된다. 여기를 새 경로로만 바꾸면 개명 **전**에는 flag를 못 찾아
# 즉시 봉인 복귀 → 남은 봉인 파일을 그 자리에서 못 고친다. 다른 경로 매칭은 틀려도
# "차단이 늦게 걸릴 뿐" 회복 가능하지만, GATE_FLAG는 **회복 경로 자체를 끊는다**.
# 그래서 신·구 두 경로를 OR로 검사한다 — 단 "둘 중 하나라도 있으면 무조건 개방"이
# 아니라 각각 TTL·하한·자릿수 검사를 그대로 통과해야 한다.
GATE_TTL_SEC=25200 # 7h — 닫기 망각 시 자동 재봉인 (2026-07-25 영호: 4h→7h 확장)
for GATE_FLAG in \
  "${CLAUDE_PROJECT_DIR:-.}/98.Management/Harness_OpenGate/gate-open.flag" \
  "${CLAUDE_PROJECT_DIR:-.}/98_Management/Harness_OpenGate/gate-open.flag"
do
  [ -f "$GATE_FLAG" ] || continue
  _gate_now=$(date +%s)
  _gate_ts=$(head -1 "$GATE_FLAG" 2>/dev/null | tr -cd '0-9')
  # ⚠️ 자릿수 상한(P05 reviewer 미검증 #6 실측): 초장문 숫자는 bash 산술에서 오버플로우로
  # wrap한다. 지금은 음수로 떨어져 아래 하한 0에 걸리지만, wrap 결과가 **양수 신선 구간**에
  # 떨어지는 값도 원리상 존재한다. epoch 초는 10자리면 2286년까지 표현되므로 11자리 초과는
  # 무효로 본다 — 하한 검사 하나에 안전을 의존하지 않는다.
  [ ${#_gate_ts} -gt 11 ] && _gate_ts=""
  if [ -n "$_gate_ts" ]; then
    _gate_age=$((_gate_now - _gate_ts))
    # ⚠️ 하한 0 필수(P05 우선순위 3): 미래 epoch가 들어가면 age가 음수라 `-lt TTL`이
    # 언제나 참이 되어 창이 **무기한** 열린다. 시계 왜곡·수기 편집 모두 이 경로다.
    if [ "$_gate_age" -ge 0 ] && [ "$_gate_age" -lt "$GATE_TTL_SEC" ]; then
      log_guard_event "supervisor-guard" "open-gate" "$TOOL_NAME 통과 (flag age $((_gate_age / 60))m)"
      exit 0
    fi
    if [ "$_gate_age" -lt 0 ]; then
      emit_system_message "⚠️ OpenGate flag가 미래 시각($((-_gate_age))s 후) — 무효 처리하고 봉인 유지. 영호: CLOSE-GATE.bat으로 정리하세요."
    else
      emit_system_message "⚠️ OpenGate flag 만료(TTL 7h) — 봉인 상태로 동작 중. 영호: CLOSE-GATE.bat 정리 후 필요 시 재오픈."
    fi
  else
    emit_system_message "⚠️ OpenGate flag를 읽을 수 없음(빈 값·비수치) — 봉인 유지."
  fi
done

block() {
  # HR1 P04: 차단 semantics(exit 2 + stderr=모델 피드백) 유지 + guard-blocks.log 원장 기록 추가.
  log_guard_event "supervisor-guard" "block" "$1"
  echo "🛑 supervisor-guard 차단: $1" >&2
  echo "   → $2" >&2
  exit 2
}

# 하네스 구성 경로인가 (state/CHANGELOG 제외).
# BL1 P06: 판정기 사망 시 fail-closed — 크래시로 봉인이 열리면 안 됨(빈 문자열 ≠ sealed 함정).
is_harness_path() {
  local _verdict
  if ! _verdict="$(printf '%s' "$1" | node "$_HOOK_LIB/shell-policy.mjs" path 2>/dev/null)"; then
    block "shell-policy 판정기 오류(경로 판정 불가) — fail-closed" "훅 점검 필요: node .claude/hooks/_lib/shell-policy.mjs 실행 오류를 확인하세요."
  fi
  [ "$_verdict" = "sealed" ]
}

# ── ① 하네스 봉인 — 메인·서브 공통 (agent_type 무관, bypass보다 먼저) ────────
if [ "$TOOL_NAME" = "Edit" ] || [ "$TOOL_NAME" = "Write" ]; then
  P="$(printf '%s' "$TOOL_INPUT_FILE_PATH" | tr '\\' '/')"
  if is_harness_path "$P"; then
    block "하네스 편집($P) — 봉인 중" "영호가 명시적으로 해제(settings.json deny + supervisor-guard.sh 직접 수정)하기 전까지 하네스 변경 불가."
  fi
fi

if [ "$TOOL_NAME" = "Bash" ] && [ -n "$TOOL_INPUT_COMMAND" ]; then
  # ADR-038 개정 1(2026-07-25): 방어 범위 = **실행 벡터**(자기 개방). 쓰기 벡터는 아래
  # shell-policy가 sealed로 처리하고, 언급·읽기는 차단하지 않는다 — Read/Glob이 열려 있어
  # Bash만 막는 건 미달성 방어였고 차단 메시지가 대체 경로를 안내하는 표지판이 됐다.
  if ! _gate_exec_reason="$(printf '%s' "$TOOL_INPUT_COMMAND" | node "$_HOOK_LIB/shell-policy.mjs" open-gate-exec 2>/dev/null)"; then
    block "shell-policy 판정기 오류(OpenGate 실행 판정 불가) — fail-closed" "훅 점검 필요: node .claude/hooks/_lib/shell-policy.mjs 실행 오류를 확인하세요."
  fi
  if [ -n "$_gate_exec_reason" ]; then
    block "$_gate_exec_reason" "OpenGate는 영호 단독 실행(ADR-038) — 에이전트는 Read/Glob 도구로 상태 확인만."
  fi
  # BL1 P06: 판정기 사망 시 fail-closed (set -e의 exit 1은 차단이 아니라 non-blocking error였음).
  if ! _harness_reason="$(printf '%s' "$TOOL_INPUT_COMMAND" | node "$_HOOK_LIB/shell-policy.mjs" shell-write 2>/dev/null)"; then
    block "shell-policy 판정기 오류(shell-write 판정 불가) — fail-closed" "훅 점검 필요: node .claude/hooks/_lib/shell-policy.mjs 실행 오류를 확인하세요."
  fi
  if [ -n "$_harness_reason" ]; then
    block "$_harness_reason — 봉인 중" "영호 명시 해제 전까지 하네스 변경 불가(읽기·git add/commit은 허용)."
  fi
fi

# ── 서브에이전트(Worker·secretary·판정) = 이하 Supervisor 규칙 면제 ─────────
[ -n "$AGENT_TYPE" ] && exit 0

# ── ② 실행 경계(잡무 기준 v1) — 메인 세션만 ─────────────────────────────────
if [ "$TOOL_NAME" = "Edit" ] || [ "$TOOL_NAME" = "Write" ]; then
  P="$(printf '%s' "$TOOL_INPUT_FILE_PATH" | tr '\\' '/')"
  case "$P" in
    # `[._]` = 폴더 개명(ADR-028 개정 1) 신·구 병행 수용 — HR2 P07.
    */02[._]Source/*) block "앱 코드 편집($P)" "도메인 Worker(main-process/agent-backend/renderer/shared-ipc)에 위임하세요.";;
    */99[._]Others/tests/*) block "테스트 편집($P)" "qa Worker에 위임하세요.";;
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
