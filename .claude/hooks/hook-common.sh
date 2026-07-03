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

parse_hook_payload() {
  local payload
  payload="$(cat)"
  [ -z "$payload" ] && return 0
  # node로 안전 파싱 (jq·python 비의존). 키 없으면 빈 문자열, 파싱 실패면 eval '' (전부 미설정).
  eval "$(printf '%s' "$payload" | node "$_HOOK_LIB/parse-payload.js" 2>/dev/null)"
}

# shell_tokens "<command>" — 셸 명령을 토큰으로 분해해 한 줄에 하나씩 출력(shlex.split 동등).
# 따옴표 불균형 등 판정 불가면 출력 0줄 — 호출측은 토큰 0개면 exit 0(기존 semantics).
shell_tokens() {
  printf '%s' "$1" | node "$_HOOK_LIB/shell-tokens.js" 2>/dev/null | tr -d '\r'
}
