#!/usr/bin/env bash
# .claude/hooks/hook-common.sh — 공통 유틸. 다른 hook이 source 한다.
# 환경 의존: Git Bash + Node (Windows). ClaudeDev 하네스 패턴 정합.
# ⚠️ 2026-07-04 python → node 전환: 이 머신의 python/py는 MS Store 스텁(실체 없음)이라
# 전 payload 파싱 hook이 조용히 무력화돼 있었음(실측 — eval ''로 전부 통과). node는
# Electron 프로젝트 필수 의존이라 항상 실재. 파서 본문 = _lib/*.js.
#
# parse_hook_payload: stdin JSON(Claude Code hook payload)을 파싱해 다음 env 세팅:
#   TOOL_NAME            — tool_name
#   HOOK_EVENT           — hook_event_name
#   TOOL_INPUT_COMMAND   — tool_input.command (Bash)
#   TOOL_INPUT_FILE_PATH — tool_input.file_path (Edit/Write)
#   AGENT_TYPE           — agent_type (서브에이전트 호출에만 존재 — 메인 세션 구분 키.
#                          2026-07-04 프로브 실측: 서브 호출 stdin에 agent_id/agent_type 포함)

_HOOK_LIB="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/_lib"

# HOOK_PAYLOAD_PARSED — 1이면 파싱 성공. 파서가 죽거나 payload가 JSON이 아니면 0.
# ⚠️ HR2 P05(2026-07-25) 이전에는 실패 시 `eval ''`로 전 변수가 미설정된 채 훅이 계속
# 진행됐고, TOOL_NAME이 비어 봉인 검사를 통째로 건너뛰었다 — 전 훅 공유 파서 하나가
# 9종 전면 fail-open의 단일 실패점이었다. 이제 실패를 신호로 남기고, 차단 성격 훅은
# require_parsed_payload로 fail-closed 한다(advisory 훅은 종전대로 통과 — 사용자
# 입력·알림 경로를 파서 사고로 죽이지 않기 위해).
HOOK_PAYLOAD_PARSED=1

parse_hook_payload() {
  local payload assignments
  payload="$(cat)"
  [ -z "$payload" ] && return 0
  # node로 안전 파싱 (jq·python 비의존). 키가 없어도 파서는 5줄을 항상 출력하므로
  # **빈 출력 = 실패**다. ⚠️ 파서는 JSON 파싱 실패 시 exit 0 + 빈 출력이라 종료코드로는
  # 감지되지 않는다 — 출력 유무로 판정해야 한다(node 크래시도 같은 경로로 잡힌다).
  assignments="$(printf '%s' "$payload" | node "$_HOOK_LIB/parse-payload.js" 2>/dev/null)" || assignments=''
  if [ -z "$assignments" ]; then
    HOOK_PAYLOAD_PARSED=0
    return 0
  fi
  eval "$assignments"
}

# require_parsed_payload "<훅명>" — 파싱 실패 시 exit 2로 차단(차단 성격 훅 전용).
# 판정 근거가 없는 상태에서 통과시키면 봉인이 없는 것과 같다(fail-closed 원칙, BL1 P06 연장).
require_parsed_payload() {
  [ "$HOOK_PAYLOAD_PARSED" = "1" ] && return 0
  log_guard_event "$1" "block" "hook payload 파싱 실패 — fail-closed"
  echo "🛑 $1 차단: hook payload 파싱 실패 — fail-closed" >&2
  echo "   → 훅 점검 필요: node .claude/hooks/_lib/parse-payload.js 실행 오류를 확인하세요." >&2
  exit 2
}

# shell_tokens "<command>" — 셸 명령을 토큰으로 분해해 한 줄에 하나씩 출력(shlex.split 동등).
# 따옴표 불균형 등 판정 불가면 출력 0줄 — 호출측은 토큰 0개면 exit 0(기존 semantics).
shell_tokens() {
  printf '%s' "$1" | node "$_HOOK_LIB/shell-tokens.js" 2>/dev/null | tr -d '\r'
}

# emit_system_message "<msg>" — 사용자 가시 알림(stdout JSON systemMessage, exit 0 훅 전용). HR1 P04.
# 공식 근거(2026-07-12): PreToolUse/PostToolUse stderr(exit 0)는 debug 로그 전용 — 사용자 UI 미표시.
# ⚠️ 호출 훅은 stdout에 JSON 외 텍스트를 섞으면 안 된다(파싱 실패).
# 알림 실패가 set -e 훅 자체·후속 원장 기록을 죽이면 안 되므로 항상 성공 취급(|| true) — BL1 P06.
emit_system_message() {
  printf '%s' "$1" | node "$_HOOK_LIB/system-message.mjs" 2>/dev/null || true
}

# log_guard_event "<hook>" "<notify|block>" "<요지>" — .claude/state/guard-blocks.log 원장 append. HR1 P04.
# 요지만 넘긴다(원시 payload·명령 인자 전체 금지) — redaction·개행 제거·상한·로테이션은 _lib/guard-log.mjs가 처리.
# 로그 실패가 훅 semantics를 바꾸면 안 되므로 항상 성공 취급(|| true).
log_guard_event() {
  node "$_HOOK_LIB/guard-log.mjs" "$1" "$2" "$3" 2>/dev/null || true
}
