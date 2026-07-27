---
summary: NC 개명 후 Codex 하네스 B 세션에서 doctor 판정기와 문서 하네스 봉인을 수리했다.
phase: 22-nc-naming-placement
status: done
grade: 대규모
owner: Codex
gate_version: 1
---

# NC Codex 세션 ② B 완료

## TL;DR

백로그 19의 판정기 결함과 백로그 22의 문서 하네스 봉인 공백을 `.codex/**` 안에서 수리했다. `harness-doctor`는 이제 sandbox 자식 결과를 `PROFILE_INIT_ERROR`·`POLICY_DENIED`·`COMMAND_ERROR`·`COMMAND_SUCCEEDED`로 먼저 분류하며, 초기화 오류를 쓰기 차단 성공으로 세지 않는다. 관측하지 않은 live 상태는 `LIVE: N/A`, 현재 세션의 신뢰 UI는 `SESSION-TRUST: N/A`로 정직하게 표시한다.

`00_Documents/(?:\d{2}_)?Harness/**`를 Codex 훅 봉인 집합에 추가했다. 영호가 선택한 A안에 따라 평시 permission profile과 훅의 이중 잠금 비용을 감수하고, full-access 유지보수 세션에서 문서 하네스 방어가 0층이 되는 공백을 닫았다.

## 5단계 보고

- 🎯 **무엇을 만들었나** — doctor의 네 상태 분류와 `INDETERMINATE` 전파, 정직한 live 표기, 신·구·재번호 문서 하네스 봉인, 번호 독립 규율 문서화, 회귀 테스트를 만들었다.
- 🤔 **왜 필요한가** — 초기화 실패와 정책 차단이 같은 nonzero 신호로 합쳐져 유령 안건을 만들었고, `00_Documents/00_Harness`는 full-access 유지보수 세션에서 훅 방어가 없었기 때문이다.
- 🛠️ **어떻게 만들었나** — 실패 테스트를 먼저 추가한 뒤 순수 분류·판정 헬퍼를 doctor의 읽기·쓰기·프로필 축에 적용했다. 훅은 `(?:\d{2}_)?Harness` 의미 스템으로 구·신·재번호 경로를 병행 수용한다.
- 🧪 **테스트 결과** — Codex 계약·훅 테스트 41/41 PASS, doctor static/live exit 0, 양성 실행기 프로브 exit 2, 음성 실행기 프로브 exit 0, digest 8/8 일치다.
- ➡️ **다음 스텝** — trusted 새 세션에서 영호가 `/hooks`로 새 digest를 재신뢰한 뒤 실제 호스트 PreToolUse 발화를 한 번 더 확인한다. 현재 CLI doctor는 그 UI 신뢰 상태를 읽을 수 없으므로 완료로 가장하지 않는다.

## Receipt — §5 B 열

### ① 기동 조건 게이트 6항목

```text
BRANCH
chore/nc-naming-code

DOCUMENT-DIRS
00_Harness
01_Adr
02_Reports
03_Reviews
04_Artifacts
05_Assets

SHARED-STEMS
agentEvents.ts
diffTypes.ts
ipcContract.ts
modelEffort.ts

LEGACY-SHARED-STEMS
<empty>

OPEN-GATE
ABSENT

P07-COMMIT
fe03430 refactor(naming): 02_Source kebab → camelCase 13건 + 파생 테스트 10건 (NC P07)

AGENTDECK_HARNESS_MAINTENANCE=1
permission_profile type="disabled"
file_system unrestricted
```

조건 5 재확인 시 P07 제품 변경은 깨끗했다. 다만 Claude 세션이 같은 시각에 갱신한 `00_Documents/BACKLOG.md`와 `01_Phases/22_NC-naming-placement/NC-codex-handoff-2.md`는 미커밋 상태다. 두 파일은 사용자 측 동시 변경으로 보존했고 Codex 커밋에서 제외한다.

조건 6은 유지보수 B 세션 관측과 일치한다. 이 출력만으로는 “요청대로 전면 개방”과 “프로필 시스템 비활성”을 구분할 수 없으므로 B 세션 단독 판정은 N/A다. 백로그 18은 A 세션의 대조 관측으로 이미 오탐 종결됐다.

### ② harness-doctor 출력 원문

비-live:

```text
$ node .codex/harness-doctor.mjs
AgentDeck Codex Harness Doctor (전담 보조 계약)
STATIC: PASS — agents 2/2, skills 2/2, hook acfbacbac8a1
LIVE: N/A — --live를 실행하지 않아 동적 경계를 측정하지 않았습니다.
MANUAL-CHECKS: trusted new session에서 아래 항목을 확인하세요.
- /permissions에서 root 기본이 agentdeck-assistant인지 확인
- /hooks에서 변경된 SHA-256 정의를 검토하고 재신뢰한 뒤 4개 이벤트를 다시 활성화
- /skills에서 repo bridge 2개(agentdeck-review, harness-review) 표시 확인
- custom agents 2개(reviewer, plan-auditor)와 실제 model label(gpt-5.6-sol) 확인
- 시크릿 차단 라이브 프로브: type .env 요청이 훅에 거부되는지 확인
- 현재 호출 표면이 custom profile을 우회하면 적용 완료로 표시하지 말고 degraded mode로 기록
STATIC_EXIT=0
```

live:

```text
$ node .codex/harness-doctor.mjs --live
AgentDeck Codex Harness Doctor (전담 보조 계약)
STATIC: PASS — agents 2/2, skills 2/2, hook acfbacbac8a1
HOOK-GUARD: PASS (canaries 3/3)
OS-READ-BOUNDARY: UNENFORCED_EXPECTED — codex-cli 0.145.0 baseline 일치 (읽기 deny 비강제, 훅이 보상 통제)
WRITE-BOUNDARY: PASS (5/5)
LIVE-CONFORMANCE: ACCEPTED_WITH_LIMITATION — profiles 3/3, hooks 4/4, models 1/1 (시크릿 읽기 보증은 부분 보장 가드레일)
SESSION-TRUST: N/A — CLI doctor는 현재 세션의 /hooks 재신뢰 여부와 /permissions UI 상태를 읽을 수 없습니다.
MANUAL-CHECKS: trusted new session에서 아래 항목을 확인하세요.
- /permissions에서 root 기본이 agentdeck-assistant인지 확인
- /hooks에서 변경된 SHA-256 정의를 검토하고 재신뢰한 뒤 4개 이벤트를 다시 활성화
- /skills에서 repo bridge 2개(agentdeck-review, harness-review) 표시 확인
- custom agents 2개(reviewer, plan-auditor)와 실제 model label(gpt-5.6-sol) 확인
- 시크릿 차단 라이브 프로브: type .env 요청이 훅에 거부되는지 확인
- 현재 호출 표면이 custom profile을 우회하면 적용 완료로 표시하지 말고 degraded mode로 기록
LIVE_EXIT=0
```

### ③ Codex 계약·훅 테스트

B 열의 필수 항목은 아니지만 수리 변경의 회귀 게이트로 실행했다.

```text
$ node --test .codex/hooks/agentdeck-hook.test.mjs .codex/harness-contract.test.mjs
tests 41
suites 0
pass 41
fail 0
cancelled 0
skipped 0
todo 0
TEST_EXIT=0
```

초기 RED:

```text
SyntaxError: The requested module './harness-doctor.mjs' does not provide an export named 'classifySandboxResult'
AssertionError [ERR_ASSERTION]: 00_Documents/harness/CORE.md
false !== true
```

초기화 오류와 정책 차단을 다른 fixture로 고정한 통합 테스트도 포함한다. 합성 `codex.cmd`가 모든 named profile 초기화를 실패시키면 다음을 요구한다.

```text
OS-READ-BOUNDARY: INDETERMINATE — PROFILE_INIT_ERROR
WRITE-BOUNDARY: INDETERMINATE (0/5)
LIVE-CONFORMANCE: INDETERMINATE
```

### ④ 신 경로 live canary 양성·음성

새 digest를 가리키는 실제 `commandWindows` 실행기에 합성 PreToolUse payload를 넣었다. 유지보수 변수를 자식에서 제거했으며 파일 편집 명령 자체는 실행하지 않았다.

양성:

```text
PROBE=POSITIVE_NEW_HARNESS
TARGET=00_Documents/00_Harness/CORE.md
EXIT=2
STDOUT-BEGIN

STDOUT-END
STDERR-BEGIN
AgentDeck guard 차단: 하네스 파일 '00_Documents/00_Harness/CORE.md'은 사용자 단독 통제 영역입니다.
STDERR-END
```

음성:

```text
PROBE=NEGATIVE_UNSEALED_DOCUMENT
TARGET=00_Documents/BACKLOG.md
EXIT=0
STDOUT-BEGIN

STDOUT-END
STDERR-BEGIN

STDERR-END
```

### ⑤ agentdeck-review finding

B 열 대상이 아니다. A 세션에서 완료됐다.

### ⑥ 백로그 18 판정

B 세션 단독으로는 원리적으로 판정할 수 없다. A 세션 대조 결과로 오탐 종결된 상태를 그대로 유지했다.

### ⑦ 백로그 19·22 수리

- `PROFILE_INIT_ERROR`와 `COMMAND_ERROR`는 쓰기 deny 성공으로 세지 않고 `INDETERMINATE`로 전파한다.
- deny 성공은 프로필 초기화가 끝난 뒤 식별 가능한 `POLICY_DENIED`가 나오고 canary가 남지 않았을 때만 인정한다.
- 비-live는 `LIVE: N/A`, live의 현재 세션 신뢰 UI는 `SESSION-TRUST: N/A`로 표시한다.
- 낡은 계약 단언 2건과 README의 “현재 구 경로” 서술을 신 경로로 바꿨다.
- 구 경로 문자열은 migration 병행 수용을 검증하는 훅 테스트 2건에만 의도적으로 남겼다.
- 영호 결정 A안에 따라 `00_Documents/(?:\d{2}_)?Harness/**`를 훅 봉인 집합에 추가했다.

판정 문자열은 현재 CLI의 식별 가능한 오류 문구에 의존한다. CLI 메시지가 바뀌어 분류하지 못하면 안전하게 `COMMAND_ERROR → INDETERMINATE`로 내려가므로 거짓 PASS는 내지 않지만, 재실측이 필요하다는 운영 비용은 남는다.

### Digest 동기화

```text
SCRIPT_SHA256=acfbacbac8a1842a7ad5e86aaa3294962aaddda1948f0d244d6a226a591cd7ce
DECLARED_COUNT=8
DECLARED_UNIQUE=acfbacbac8a1842a7ad5e86aaa3294962aaddda1948f0d244d6a226a591cd7ce
ALL_MATCH=True
```

`command`와 `commandWindows` 8개 선언이 모두 훅 본문 digest와 일치한다. `/hooks` 재신뢰는 영호가 trusted 새 세션에서 수행한다.

## AC 검증 결과

```text
$ node --test .codex/hooks/agentdeck-hook.test.mjs .codex/harness-contract.test.mjs
PASS: 41/41, fail 0, exit 0

$ node .codex/harness-doctor.mjs
PASS: STATIC PASS, LIVE N/A, exit 0

$ node .codex/harness-doctor.mjs --live
PASS: HOOK-GUARD 3/3, WRITE-BOUNDARY 5/5, LIVE-CONFORMANCE ACCEPTED_WITH_LIMITATION, exit 0

$ git diff --check -- .codex
PASS: exit 0
```

## 학습 일지 후보 키워드

- 판정 전 결과 분류
- 초기화 실패와 정책 차단 분리
- 판정 불가를 N/A로 표현
- 개명 중 봉인 경로 병행 수용
- full-access 유지보수 세션의 방어 공백
- hook digest cachebuster
