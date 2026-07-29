#!/usr/bin/env bash
# .claude/hooks/convention-size-guard.sh
# PostToolUse(Edit|Write) — 파일 줄 수 임계 경고 (God class 조기 경고). ClaudeDev 패턴 적응.
#
# God class 비대화 *조기 경고*. 차단 X (exit 0) — 거친 신호일 뿐. 정확한 판정은 reviewer + 사람.
#
# 임계 = 800줄 (TS/React 현실 반영 — ClaudeDev C# 600에서 상향).
# AgentDeck은 이미 초과한 큰 파일 다수(ClaudeCodeBackend·ipcContract·appStore 등) →
# 리팩토링 전까지 경고 뜸 (의도된 신호 — refactor-sweep 추적 대상).

set -e
. "$(dirname "$0")/hook-common.sh"
parse_hook_payload

FP="$TOOL_INPUT_FILE_PATH"
[ -z "$FP" ] && exit 0
FP_N="$(printf '%s' "$FP" | tr '\\' '/')"

PROJ="${CLAUDE_PROJECT_DIR:-.}"
PROJ_N="$(printf '%s' "$PROJ" | tr '\\' '/')"

# ─────────────────────────────────────────────────────────────────────────────
# 명명 가드 (NC P03, ADR-039) — advisory 티어. **차단하지 않는다**(exit 0).
#
# ⭐ 왜 advisory 인가: 안전 속성(봉인·파괴·비가역)은 fail-closed 차단이 맞지만, 명명은
# 품질 규범이라 사후 교정이 싸고 보안 결과가 없다. 차단형으로 만들면 **오탐 하나가
# 핫픽스를 막는** 나쁜 교환이 된다.
#
# ⭐ 왜 "신규 생성물 한정"을 **git 추적 여부**로 판정하는가: 예외 목록으로 동결 파일을
# 거르면 목록이 낡는 순간 상시 경고가 뜨고, 노이즈는 승인 피로를 거쳐 **우회 습관**이
# 된다. git 이 이미 추적 중인 파일은 정의상 기존 파일이므로, 이 판정은 소급 스캔을
# **구조적으로 불가능**하게 만든다 — 목록을 관리할 필요가 없다.
# ─────────────────────────────────────────────────────────────────────────────

# repo 상대경로 산출
NAME_REL="$FP_N"
case "$NAME_REL" in
  "$PROJ_N"/*) NAME_REL="${NAME_REL#"$PROJ_N"/}" ;;
esac

naming_guard() {
  case "$NAME_REL" in
    /*|[A-Za-z]:/*) return 0 ;;                       # 저장소 밖 — 규범 대상 아님
    .git/*|node_modules/*|*/node_modules/*) return 0 ;;
    .claude/*|.codex/*|.agents/*|.env/*|.env|.env.*) return 0 ;;   # 외부 도구가 이름으로 탐색
    artifacts/*|out/*|test-results/*) return 0 ;;     # 도구 생성물 (ROOT_LAYOUT §2-3)
  esac

  # 기존 파일이면 침묵 — 소급 스캔 금지 (git 추적 = 기존)
  git -C "$PROJ" ls-files --error-unmatch "$NAME_REL" >/dev/null 2>&1 && return 0

  _base="${NAME_REL##*/}"
  _msgs=""
  _add() { _msgs="$_msgs
  · $1"; }

  # ① 새 최상위 폴더 = NN_PascalCase
  # ⚠️ 초안은 `[A-Za-z]`(소문자 허용)였다 — ADR-039 §1이 "분류 폴더 전역 = NN_PascalCase"인데
  # §4 불변식이 "NN_Name"이라 **ADR 내부 표기가 갈라져** 있었고 훅이 느슨한 쪽을 따랐다.
  # 강제가 정본보다 느슨하면 규칙이 사실상 두 개가 된다 → §1 기준으로 조이고 §4 표기도 통일했다.
  # (현 최상위 5개 `00_Documents`·`01_Phases`·`02_Source`·`98_Management`·`99_Others` 전부 부합.)
  case "$NAME_REL" in
    */*)
      _top="${NAME_REL%%/*}"
      case "$_top" in
        [0-9][0-9]_[A-Z]*) : ;;
        *) _add "새 최상위 폴더 '$_top' — 규칙은 'NN_PascalCase'(예: 03_Tools)." ;;
      esac
      ;;
  esac

  # ② 00_Documents 직속 하위 폴더 = NN_PascalCase
  case "$NAME_REL" in
    00_Documents/*/*)
      _sub="${NAME_REL#00_Documents/}"
      _sub="${_sub%%/*}"
      case "$_sub" in
        [0-9][0-9]_[A-Z]*) : ;;
        *) _add "00_Documents 하위 폴더 '$_sub' — 규칙은 'NN_PascalCase'(예: 06_Specs)." ;;
      esac
      ;;
  esac

  # ③ 새 02_Source/*.ts = camelCase
  #    ⚠️ .tsx 는 기계 강제하지 않는다 — 케이스 판정이 "주 export 가 컴포넌트인가"라는
  #    **내용 기반**이라 파일명만으로 결정 불가다. 단순 규칙으로 강제하면 합법적인 신규
  #    훅·모음·진입점(zoom.tsx·icons.tsx·main.tsx)에 상시 오경고가 뜬다. → ADR-039 문장이 소유.
  case "$NAME_REL" in
    *02[._]Source/*.ts)
      case "$_base" in
        *.d.ts|*.test.ts|*.spec.ts|*.config.ts) : ;;
        [a-z]*[-_]*) _add "새 .ts '$_base' — 규칙은 camelCase(예: agentEvents.ts). 하이픈·언더바 X." ;;
        [A-Z]*) _add "새 .ts '$_base' — 대문자 시작은 타입/클래스 신호다. 값 모듈은 camelCase." ;;
      esac
      ;;
  esac

  # ④ 파일명 공백 금지
  case "$_base" in
    *" "*) _add "파일명에 공백 '$_base' — 셸·글롭·경로 리터럴이 조용히 깨진다." ;;
  esac

  [ -z "$_msgs" ] && return 0
  NOTICE="⚠️ naming: $NAME_REL 이(가) 명명 규범(ADR-039)에서 벗어납니다.$_msgs

(차단 아님 — 신규 생성물에만 뜨는 조기 경고. 의도한 예외면 그대로 두고 ADR-039 「동결 경계」에 근거를 남기세요.)"
  log_guard_event "convention-size-guard" "notify" "naming: $NAME_REL"
}

# ⚠️ 크기 임계 검사 — 원래 본문에 인라인이었으나 명명 가드가 붙으면서 함수로 분리했다.
# **한 훅의 stdout 에 JSON 이 두 번 나오면 유효한 JSON 이 아니라 두 메시지가 다 유실된다**
# (`hook-common.sh` 자신이 "stdout 에 JSON 외 텍스트를 섞지 말라"고 경고한다).
# 그래서 두 가드 모두 **메시지를 변수에 담기만** 하고, 방출은 스크립트 끝에서 **1회**다.
size_guard() {
  # 02_Source/ 내 .ts/.tsx 만 대상 (테스트·설정·문서 제외)
  case "$FP_N" in
    */02[._]Source/*.ts|*/02[._]Source/*.tsx|02[._]Source/*.ts|02[._]Source/*.tsx) : ;;
    *) return 0 ;;
  esac
  case "$FP_N" in
    *.test.ts|*.test.tsx|*.spec.ts|*.spec.tsx|*.d.ts) return 0 ;;
  esac

  _target="$FP_N"
  [ -f "$_target" ] || _target="$PROJ/$FP_N"
  [ -f "$_target" ] || return 0

  _threshold=800
  _lines=$(wc -l < "$_target" 2>/dev/null | tr -d ' ')
  [ -z "$_lines" ] && return 0
  [ "$_lines" -gt "$_threshold" ] || return 0

  # HR1 P04: stderr → stdout JSON systemMessage (사용자 가시화) + 원장 기록.
  _size_msg="⚠️ convention-size: $(basename "$_target") = ${_lines}줄 (임계 ${_threshold}). God class 의심 — 2+ 책임이면 모듈 분리 점검 권장. (차단 아님 — 조기 경고. 정확한 판정은 reviewer / refactor-sweep)"
  if [ -n "$NOTICE" ]; then NOTICE="$NOTICE

$_size_msg"; else NOTICE="$_size_msg"; fi
  log_guard_event "convention-size-guard" "notify" "$(basename "$_target") ${_lines}줄 (임계 ${_threshold})"
}

NOTICE=""
naming_guard || true
size_guard || true
[ -n "$NOTICE" ] && emit_system_message "$NOTICE"

exit 0
