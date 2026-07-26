#!/usr/bin/env bash
# .claude/hooks/dangerous-cmd-guard.sh
# PreToolUse(Bash) — 2축 차단 (exit 2 = block). ClaudeDev 패턴 정합.
#
#   ① 파괴(CORE-07) — rm -rf·reset --hard·clean -fd·force push 류. 되돌릴 수 없는 *손실*.
#   ② 비가역(CORE-06) — push·PR 생성/머지·release·publish·package. 되돌릴 수 없는 *공개*.
#
# 본질: Claude 전용 Node shell-policy가 따옴표·명령 segment·Git 전역 옵션을 구조화해
#       실행 명령 토큰만 차단. 정말 필요하면 외부 셸(Git Bash 직접)에서 실행.
# 정책: 00_Documents/harness/CORE.md CORE-07(파괴 명령 금지)·CORE-06(비가역 사람 게이트) + CLAUDE.md.
#
# ⚠️ ②가 여기 붙은 이유(A 스프린트 백로그 6, 2026-07-26): CORE-06은 permission `ask` 1층뿐이라
#    세션 권한 모드가 권한 계층을 건너뛰면 통째로 죽었다(같은 날 push 2회 연속 무프롬프트 — 실측).
#    CORE-11(봉인)이 deny + supervisor-guard 2층이라 같은 모드에서 멀쩡했던 것과의 **비대칭**이
#    결함의 정체였고, 훅 exit 2가 그 모드에서 살아 있다는 것도 같은 날 실측해 이 층을 채웠다.
#    두 축의 차단 semantics는 같지만 **안내가 다르다** — ①은 "정말 필요하면 외부 셸",
#    ②는 "영호가 `!`로 직접". ②는 금지가 아니라 *주체 이전*이기 때문이다.

set -e
. "$(dirname "$0")/hook-common.sh"
parse_hook_payload
require_parsed_payload "dangerous-cmd-guard" # P05: 파서 사망 = 판정 불가 → fail-closed

COMMAND="$TOOL_INPUT_COMMAND"
[ -z "$COMMAND" ] && exit 0
# HR1 P04 실측 박제(2026-07-12): exit-0 JSON permissionDecision:"deny" 경로가 PreToolUse에서 유효
# (프로브로 차단·사유 전달·systemMessage 병행 확인). 채택 여부는 AC "차단 여전히 exit 2"와의
# 충돌 때문에 영호 결정 대기 — 현행 exit 2 + guard-blocks.log 유지.

# HR1 P04: 차단 semantics(exit 2 + stderr=모델 피드백) 유지 + guard-blocks.log 원장 기록 추가.
block() { log_guard_event "dangerous-cmd-guard" "block" "$1"; echo "🛑 dangerous-cmd-guard 차단: $1" >&2; echo "   정말 필요하면 외부 Git Bash에서 직접 실행하세요." >&2; exit 2; }

# ② 전용 안내 — 대체 경로가 "외부 셸"이 아니라 **사람**이다. 훅은 사람에게 물을 수 없고
#    payload로는 승인 여부를 알 수도 없으므로(승인 flag를 두면 에이전트가 그 flag를 쓴다),
#    에이전트에게는 항상 닫고 실행 주체를 영호에게 넘긴다. `!` 프리픽스는 도구 호출이 아니라
#    로컬 셸 실행이라 PreToolUse를 타지 않는다(2026-07-26 실측) — 사람 경로는 항상 열려 있다.
block_irreversible() {
  log_guard_event "dangerous-cmd-guard" "block" "비가역 사람 게이트(CORE-06) — $1"
  echo "🛑 dangerous-cmd-guard 차단: $1" >&2
  echo "   → 비가역 작업은 사람 게이트(CORE-06)입니다. 에이전트는 실행할 수 없습니다." >&2
  echo "   → 영호에게 프롬프트에 \`! <명령>\` 으로 직접 실행해 달라고 요청하세요." >&2
  exit 2
}

# 판정 불가 전용 안내 — 축①의 "외부 Git Bash에서 직접 실행하세요"를 붙이면 안 된다.
# 비가역 축에서 그 문장은 *사람 게이트를 우회하라*로 읽힌다(reviewer 2026-07-26 🟡-8).
block_unjudgeable() {
  log_guard_event "dangerous-cmd-guard" "block" "판정 불가(fail-closed) — $1"
  echo "🛑 dangerous-cmd-guard 차단: $1 — 판정 불가(fail-closed)" >&2
  echo "   → 판정할 수 없는 상태에서 통과시키면 게이트가 없는 것과 같습니다." >&2
  echo "   → 훅 점검 필요: node .claude/hooks/_lib/shell-policy.mjs 실행 오류를 확인하세요." >&2
  exit 2
}

# BL1 P06: 판정기(node shell-policy) 사망 시 fail-closed — 보안 게이트는 열림이 아니라 닫힘이 기본.
# 두 축을 **한 번의 node 스폰**으로 묻는다(🟡-10). 인자 순서가 곧 우선순위다 — ①을 먼저 두는 이유는
# force push처럼 두 축에 다 걸리는 명령에서 *더 강한 쪽*(아예 하지 말 것)이 안내를 소유해야 하기
# 때문이다. ②의 안내("영호가 `!`로")를 붙이면 파괴 명령의 대행을 권하는 꼴이 된다.
if ! VERDICT="$(printf '%s' "$COMMAND" | node "$_HOOK_LIB/shell-policy.mjs" dangerous irreversible 2>/dev/null)"; then
  block_unjudgeable "shell-policy 판정기 오류"
fi

if [ -n "$VERDICT" ]; then
  AXIS="${VERDICT%%:*}"   # 첫 `:`까지가 축 이름
  WHY="${VERDICT#*:}"     # 나머지가 이유(이유 안의 `:`는 보존된다)
  case "$AXIS" in
    dangerous) block "$WHY" ;;
    irreversible) block_irreversible "$WHY" ;;
    *) block_unjudgeable "shell-policy 출력 형식 미인식($AXIS)" ;;
  esac
fi

exit 0
