# M06 G5 — 가드 줄 이음 · `\`+개행으로 이어 쓴 명령을 한 명령으로 읽는다

- 마일스톤: M06 자가 개발 · 작성: 2026-11-16 · 상태: 실행 중 · 검증 강도: 강(판정 장치 변경)
- 작업 브랜치: `fix/m06-g5-guard-line-continuation` — G4 종결 기록 브랜치(`178d5ae3`, master `0834c9e1` 위)에서 갈랐다.

## 목표

위험 명령 가드가 `\`+개행 줄 이음으로 나눠 쓴 명령을 셸처럼 한 명령으로 읽게 한다. 지금은 개행에서 세그먼트가 끊겨 `git -c a=b \⏎ -c c=d push origin HEAD:master`가 「차단 규칙 미발동」으로 통과하고, 앱 `자동`·`Bypass`에서는 승인 카드 없이 실행될 수 있다(M06 Backlog 8).

## 범위

- **만들 것**
  - 가드의 세그먼트 분할에서 따옴표 밖과 큰따옴표 안의 `\`+LF, `\`+CRLF를 줄 이음으로 지운다. 작은따옴표 안에서는 셸처럼 글자 그대로 둔다.
  - 줄 이음 꼴의 판정 테스트 — 이어 쓰지 않은 같은 명령과 판정이 같아야 한다. 지금 「감수」로 묶인 줄 이음 행은 실제 판정으로 고친다.
- **건드릴 곳**: `.claude/hooks/dangerous-cmd-guard.mjs`의 `splitSegments`와 머리 주석, `.claude/hooks/dangerous-cmd-guard.test.mjs`, 필요하면 `cmd-guard-equivalence.test.mjs`와 그 사람용 기준표.
- **하지 않을 것**: M05 H1이 감수로 남긴 다른 꼴(`2>&1`의 `&`, 주석, `\X` 해제, `$'…'`, 제어 구문 머리, 변수·명령 치환) — H1에서 셸 전처리를 넓힐수록 회귀가 난 기록이 있다(H1 검증 기록 FAIL 23:08·23:43). 앱 소스, `.claude/settings.json`, 다른 훅.
- **완료조건**
  - Backlog 8 원형 `git -c a=b \⏎ -c c=d push origin HEAD:master`가 ask다. 줄 이음으로 쓴 master push·강제 push·원격 삭제·`--mirror`가 이어 쓰지 않은 꼴과 같은 판정을 받는다(LF·CRLF 둘 다).
  - 작은따옴표 안의 `\`+개행은 잇지 않는다. heredoc 커밋·PR 본문의 기존 오탐 방지 행과 `reset --hard` 판정에 회귀가 없다 — `npm run test:hooks` 전부 통과.
  - 구현 문맥 없는 검수자 PASS, 하드 게이트 다섯 종 exit 0, `npm test` 실패 0.

## Phase 1 — 가드 줄 이음 · 태그: `harness` · 의존: 없음

진척 단계 (완료 `[x]`, 진행 `[>]`, 남음 `[ ]` — 위치 표시일 뿐이고 통과 판정은 검증 기록 줄만 한다)

- [x] 1. goal 문서 준비 — 이 goal 문서, 포인터(`98_Management/01_GateState/gate-config.json`의 `planPath`) 전환, pin 갱신
- [ ] 2. 실패하는 테스트 먼저 쓰기 — 줄 이음 꼴의 기대 판정을 `dangerous-cmd-guard.test.mjs`에 넣고 Red 확인
- [ ] 3. 가드 고치기 — `.claude/hooks/dangerous-cmd-guard.mjs`의 `splitSegments`에서 줄 이음을 지우고 머리 주석의 한계 문구를 고친다
- [ ] 4. 회귀 확인 — `npm run test:hooks` 전부, 하드 게이트, `npm test`
- [ ] 5. 독립 검수와 최종 검증
- [ ] 6. PR 올리고 병합 승인 요청

실행 단계 일괄 승인 대상 (사용자 「Backlog 8 가드 구멍 goal 진행해줘」)

- 위 판정 장치 파일 편집, 하드 게이트 다섯 종, `npm test`, 하위 에이전트·검수자 기동, 커밋, 작업 브랜치 push, `gh pr create`

DoD

- 마크다운 문서 250줄 이하.

검증 기록

## 결정 대장

- [USER] Backlog 8(가드가 `\` 줄 이음 여러 줄 명령을 놓치는 구멍)을 다음 goal로 진행한다 — 「Backlog 8 가드 구멍 goal 진행해줘」 (2026-11-16)
- [AI] 범위를 줄 이음 하나로 좁힌다 — M05 H1이 줄 이음·주석·리다이렉트·이스케이프 해제를 한꺼번에 넣었다가 두 번 불통과하고 되돌렸다. 줄 이음은 셸 규칙이 단순하고(따옴표 밖·큰따옴표 안에서만 지운다) Backlog 8의 원형이 이 꼴이다. 나머지는 H1의 감수 판정([USER] 2026-11-13)을 그대로 둔다 (2026-11-16)

출처 태그는 네 가지다 — `[USER]`·`[USER·위임]`·`[AI]`·`[AI·비가역]`.
