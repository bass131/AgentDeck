# M01 Phase 3 — cmd-guard 대조 보강

## Phase 3 — cmd-guard 대조 보강 · 태그: `guard` · 의존: Phase 2

**목표**: AgentDeck의 위험 명령 가드가 Moodie의 가드와 대조했을 때 빠진 규칙 없이 같은 표면을 덮는다. 인용문 안의 단어를 명령으로 오인해 막는 오탐도 사라진다.

Steps

1. AgentDeck의 `.claude/hooks/dangerous-cmd-guard.mjs`와 Moodie의 같은 층 규칙을 나란히 대조해 결손 규칙 다섯 건을 확정한다.
2. 결손 다섯 건에 대한 테스트를 먼저 쓴다. 테스트가 실패하는 것을 확인한 뒤에 구현을 넣는다 — 이것이 TDD의 Red 단계다.
3. git 명령 판정을 머리 토큰 기준으로 바꾼다. 명령 문자열 어디에나 `push`가 있으면 잡는 방식은 커밋 메시지나 인용문에 그 단어가 들어갔을 때 오탐을 낸다.
4. 사람 승인을 요구하는 축(push·publish)은 그대로 둔다. Moodie는 이를 차단으로 구현했지만 AgentDeck은 승인 다이얼로그로 구현했고, 사람 게이트를 거친다는 점에서 강제력이 같다고 [USER] 판정됐다.
5. 기존 가드 테스트 전량을 다시 돌려 무회귀를 확인한다.

DoD

- 결손 다섯 건 각각에 대해 차단을 기대하는 테스트가 있고, 구현 전에는 실패했고 구현 후에는 통과한다.
- 머리 토큰 판정에 대해 오탐 회귀 테스트가 있다. 커밋 메시지 안에 `push`라는 단어가 들어간 명령이 차단되지 않는다.
- `npm run test:hooks`가 green이다.
- 기존 가드 테스트가 하나도 깨지지 않는다.

검증 기록

- PASS 2026-08-10T10:51+09:00 — 결손 다섯 건(git restore·del /s·rmdir /s·Remove-Item -Recurse 단독·git config --global, 근거 Moodie 32_cmd-guard.cjs L50·L53·L54·L55·L63)의 테스트가 구현 전 Red 실행에서 전부 실패함을 워커 터미널 기록으로 확인했다.
- PASS 2026-08-10T10:51+09:00 — git 판정을 머리 토큰 기준(gitSubcommand, 전역 옵션 스킵)으로 바꿔 커밋 메시지·인용문 속 push가 차단되지 않는 오탐 회귀 테스트가 통과하고, Red에서 드러난 실오탐(echo git reset --hard 차단)과 누락(git -C repo reset --hard 미검출)도 수리됐다.
- PASS 2026-08-10T10:51+09:00 — 코디네이터 직접 실행으로 npm run test:hooks 전량 green, 기존 가드 테스트 무회귀를 확인했다.
- PASS 2026-08-10T10:51+09:00 — 하드 게이트 5종 전부 exit 0, npm test 410 통과·0 실패(기준선 동일)에서 커밋 cb0d92a로 등재했다. 워커 모델 영수증은 트랜스크립트 24턴 전량 claude-opus-5·effort high로 라우팅 정책과 일치한다.
