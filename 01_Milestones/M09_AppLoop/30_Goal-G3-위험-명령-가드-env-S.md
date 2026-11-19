# M09 G3 — 위험 명령 가드의 `env -S` 구멍 · 문자열을 명령으로 다시 읽는 꼴의 병합 차단

- 마일스톤: M09 (마일스톤 스펙 `01_Milestones/M09_AppLoop/00_마일스톤-스펙.md`) · 작성: 2026-11-19 · 상태: 종결(PR 95, 로컬 병합 `92c2d0e7` — 둘째 부모 = CI 머리 `568863f1`, 2026-11-19) · 검증 강도: 강(판정 장치 변경)
- 작업 브랜치: `feat/m09-g3-gates` · 기준 브랜치: `milestone/m09-app-loop`(`b198b47a`, G2 병합 뒤). G2 종결 기록을 함께 싣는다.

## 목표

`env -S "<문자열>"`(`--split-string`)은 문자열을 나눠 명령으로 실행한다. 저장소 하네스의 위험 명령 가드와 앱의 병합 거부 노드가 이 문자열을 명령으로 다시 읽어, `env -S "gh pr merge …"` 같은 꼴도 다른 병합 호출과 똑같이 질문 없이 거부한다.

## 범위

- **만들 것**
  - 두 판정기의 `env` 래퍼 처리에 `-S`·`--split-string`(묶은 짧은 옵션 `-vS`, 붙여 쓴 `-S"…"`, `--split-string=…`, 줄인 긴 옵션 포함)의 값을 그 뒤 낱말과 함께 명령으로 다시 판독하는 길. 다시 읽은 명령은 원래 명령과 같은 규칙(병합 거부, 그 밖의 가드 규칙)을 받는다.
  - 판정이 같아야 하는 두 표(`mergeDeny.ts`의 `WRAPPERS`, 가드의 `WRAPPER_SPECS` — 가드 주석상 같은 표)를 함께 고치고, 같음을 지키는 시험에 `env -S` 사례를 더한다.
- **건드릴 곳**
  - 판정 장치(헌법 3·11조 — 마일스톤 스펙 「건드릴 곳」, 사용자 결정 4A): `.claude/hooks/dangerous-cmd-guard.mjs`, `.claude/hooks/dangerous-cmd-guard.test.mjs`, `.claude/hooks/cmd-guard-equivalence.test.mjs`, `98_Management/01_GateState/gate-config.json`의 `planPath`(1단계).
  - 판정 장치 밖: `02_Project/00_Source/main/04_Claude/permission/mergeDeny.ts`, `02_Project/01_TestCode/main/04_Claude/mergeDeny.test.ts`, `01_Milestones/M09_AppLoop/`.
- **하지 않을 것**: 가드의 다른 규칙 변경, 새 거부 범주, `env -S` 밖의 새 래퍼 우회 꼴(발견하면 Backlog), 루프 잠금(`loopLock.ts` — 이미 `-S`를 다시 판독한다), 실제 셸에서 `env -S "gh pr merge …"`를 돌려 보는 실측(헌법 10조 — 거부를 피하는 꼴 바꾸기가 된다; 판정기에 글자를 넣는 시험으로만 본다).
- **완료조건**
  - 시험이 두 판정기에 `env -S "gh pr merge 1"`, `env -S"gh pr merge 1"`, `env -vS "gh pr merge 1"`, `env --split-string="gh pr merge 1"`, `env -S "gh api -X PUT repos/o/r/pulls/1/merge"`를 넣으면 다른 병합 호출과 같은 사유로 거부되는 것을 본다. 고치기 전에는 이 시험이 실패한다(빨강 먼저).
  - 시험이 `env -S "npm test"`, `env FOO=1 npm test`, `env -u X ls` 같은 정상 꼴은 막지 않는 것을 본다.
  - 같음 시험이 두 표의 `env` 처리가 같다는 것을 계속 지킨다.
  - 하드 게이트 다섯 종 exit 0(`test:hooks` 포함), `npm test` 실패 0, 독립 검수 반영, goal PR의 `hard-gates` 통과, 정형 절차로 병합.

## Phase 1 — 가드 `env -S` · 태그: `harness` · 의존: G2

진척 단계 (완료 `[x]`, 진행 `[>]`, 남음 `[ ]` — 위치 표시일 뿐이고 통과 판정은 검증 기록 줄만 한다)

- [x] 1. goal 준비 — 이 문서, G2 종결 기록, `gate-config.json` 전환(판정 장치)
- [x] 2. 두 판정기의 `env -S` 시험을 먼저 써서 실패를 본다(가드 시험·`mergeDeny.test.ts`)
- [x] 3. 가드 `dangerous-cmd-guard.mjs`와 `mergeDeny.ts`에 `-S` 다시 판독을 넣고 같음 시험을 더한다(판정 장치)
- [x] 4. 하드 게이트 다섯 종, `npm test`, push 뒤 독립 검수와 반영, PR, CI, 정형 절차로 병합

실행 단계 일괄 승인 대상

- 마일스톤 스펙의 목록 중: `node --test`(훅 시험), vitest, 하드 게이트, `npm test`, 독립 검수 하위 에이전트, 작업 하위 에이전트, 브랜치, 커밋, push, `gh pr create`, 로컬 `git merge --no-ff`

DoD

- 위 완료조건.

검증 기록

- PASS 2026-11-19T06:28:03+09:00 — 구현(작업 하위 에이전트, 메인이 다시 돌림): 가드 `dangerous-cmd-guard.mjs`와 앱 `mergeDeny.ts`가 `env -S`·`-S"…"`·묶은 `-vS`·`--split-string[=]`·줄인 긴 옵션의 값을 `env <값> <뒤 낱말>`로 다시 판독해 같은 규칙을 적용. 빨강 먼저 확인(vitest 26 실패, 가드 시험 30 실패, 같음 시험 21 실패 → 전부 초록). 두 표의 env 행 글 대조와 두 판정기 같은 판정 16행을 같음 시험에 더함. 하드 게이트 다섯 종 exit 0(가드 시험 1018 통과), `npm test` 473 파일 중 467 통과·6 건너뜀, 시험 8914 통과 실패 0. 남은 래퍼 꼴은 Backlog 7.
- PASS 2026-11-19T07:01:58+09:00 — 독립 검수(구현 문맥 없는 검수자, 차단 0·중요 2·사소 2) 반영: `-S` 값의 따옴표 밖 낱말 머리 `#` 주석을 값 끝까지만 잘라 뒤 낱말을 살림(두 판정기 같은 로직, 빨강 먼저 — vitest 5·가드 6·같음 7 실패 → 초록), 값 짧은 옵션에 `a`(`--argv0`), 같음 시험 ES-17~22, `mergeDeny.ts`가 Node 타입 지우기로 바로 읽히는지(`import type`만, enum·namespace 없음) 앱 시험이 먼저 지키고 머리 주석에 이유. 메인이 diff 실사. 하드 게이트 다섯 종 exit 0(가드 시험 1029·같음 146 통과), `npm test` 473 파일 중 467 통과·6 건너뜀, 시험 8927 통과 실패 0. 독립 검수 반영 완료.

## 결정 대장

- [USER] 아침 대기열 답 4A 「M09에서 고친다」 (2026-11-19, 현황판 결정 응답) — 스펙 「건드릴 곳」에 위험 명령 가드를 더했다.
- [AI] 후보 3을 이 goal과 사람·모델 게이트(G4)로 나눈다 — 판정 장치 변경을 앱 기능과 섞지 않아 검수 범위를 좁히고, 이 가드는 메인 세션의 명령도 판정하므로 작게 먼저 끝낸다 (2026-11-19, 성향 29 — 손상의 가역성에 맞춘 게이트 강도).

출처 태그는 네 가지다 — `[USER]`·`[USER·위임]`·`[AI]`·`[AI·비가역]`.
