#!/usr/bin/env bash
# .claude/hooks/hook-common.sh — 공통 유틸. 다른 hook이 source 한다.
# 환경 의존: Git Bash + Python 3 (Windows). ClaudeDev 하네스 패턴 정합.
#
# parse_hook_payload: stdin JSON(Claude Code hook payload)을 파싱해 다음 env 세팅:
#   TOOL_NAME            — tool_name
#   HOOK_EVENT           — hook_event_name
#   TOOL_INPUT_COMMAND   — tool_input.command (Bash)
#   TOOL_INPUT_FILE_PATH — tool_input.file_path (Edit/Write)

parse_hook_payload() {
  local payload
  payload="$(cat)"
  [ -z "$payload" ] && return 0

  # Python으로 안전 파싱 (jq 비의존). 키 없으면 빈 문자열.
  # ※ f-string/백슬래시 이스케이프 금지 — bash 단일따옴표 안에서 깨진다. 문자열 결합으로 작성.
  eval "$(printf '%s' "$payload" | python -c '
import sys, json, shlex
try:
    d = json.load(sys.stdin)
except Exception:
    sys.exit(0)
ti = d.get("tool_input") or {}
def q(v):
    return shlex.quote("" if v is None else str(v))
print("TOOL_NAME=" + q(d.get("tool_name")))
print("HOOK_EVENT=" + q(d.get("hook_event_name")))
print("TOOL_INPUT_COMMAND=" + q(ti.get("command")))
print("TOOL_INPUT_FILE_PATH=" + q(ti.get("file_path")))
' 2>/dev/null)"
}
