# LR4 — REPL/goal 세션 안정성 + 세션별 토글

> 영호 실사용 3버그 진단(2026-07-05, Explore 실측 2회 + work-pin 백로그 상세). 브랜치 `feature/repl-session-stability`.

## 배경

영호 실사용에서 발견한 3버그. 진단 3회(Explore 실측, work-pin 백로그 상세).

**공유 뿌리 = idle-close**(`claudeAgentRun.ts:755`, LR3 P02 도입)가 매 턴 done 직후 `_inputGen`을 닫는데, `hasLoopActivity()`가 크론+웨이크업만 집계해 goal(stop-hook 자기지속)·일반 지속세션을 "무활동"으로 오판한다. LR3 P02의 원계약("닫힌 뒤 후속 턴 = `persistentRuns` miss→resume 복원", `agent-runs.ts` 0줄 전략)과, 실제 "닫히는 중 688ms teardown 창(아직 done=false)"의 갭이 무한대기의 근본이다.

3개 증상:
- **(A) goal 자멸** — 다음 send 없는 자율반복이라 세션 사망·목표 미도달.
- **(B) goal 배너 미해제·조기발동** — 배너가 `pendingCommand` 낙관 플래그에만 의존(백엔드 생존신호 0).
- **(C) 무한대기 (가장 심각·일반 대화 매 턴)** — idle-close teardown 창(~688ms)에 send가 done=false stale 세션에 라우팅 → `_inputGen` 이미 return이라 입력 고아 → done 영영 미도달 → isRunning stuck → 재시작만 복구.

## Phase 목록

| Phase | 제목 | 도메인 | 등급 | 깃발 | 이슈 |
|---|---|---|---|---|---|
| 01 | 무한대기·idle-close 재현 테스트 하네스 | qa | 보통 | — | 결정적 재현 red 기준선 |
| 02 | 688ms 창 소거 — `_inputGen` 닫힘 시 `persistentRuns` 원자 제거 | cross | 복잡 | backend-contract | 무한대기(C) 근본 봉합 |
| 03 | idle-close 유예 후 판정 + 무한루프 상한 + goal 생존신호 방출 | agent-backend | 복잡 | backend-contract | goal 자멸(A) 봉합 + P05 신호 소스 |
| 04 | 렌더러 stuck 탈출 — interrupt 죽은 run 감지 정리 | renderer | 보통 | — | 비가역 stuck 2차 안전망 |
| 05 | goal 배너 백엔드 생존신호(소비만) | renderer | 복잡 | — | goal 배너(B) 봉합 |
| 06 | Ultracode 토글 오복원 — 리마운트 유지 | renderer | 보통 | ui-visual | 토글 스코프 과소 |
| 07 | REPL 토글 세션별 분리 | cross | 복잡 | shared-contract | 토글 스코프 과대 |

## 축 구성 · 의존성 · 웨이브

**A축(P01~P05 세션 수명)** → **B축(P06~P07 토글)**.

- **의존성**: P01→P02→P03→(P05·P07) / P04는 P01 후 renderer 독립(P02·P03과 병렬) / P05 사전조건 = P03(신호 방출 소스) / P06 renderer 독립 / P07은 A 전체(held-open 파급) 후.
- **병렬 웨이브**: (P01) → (P02·P04 병렬) → (P03) → (**P05→P06 순차** — 둘 다 renderer, PanelView·Shell 파일 겹침 회피) → (P07).

```
P01(재현 하네스)
 ├─→ P02(688ms 창 소거) ─→ P03(idle-close 유예 + goal 신호 방출) ─┬─→ P05(goal 배너 소비) ─→ P06(Ultracode 토글)  [P05·P06 둘 다 renderer, 순차로 파일 겹침 회피]
 │                                                                 └─→ P07(REPL 토글 세션별) ← A 전체 후
 └─→ P04(렌더러 stuck 탈출)  [P02·P03과 병렬]
```

## 설계 노트

1. **ADR-024 REPL 지속펌프 = 최대위험 구역.** LR3 P02의 "agent-runs.ts 0줄"은 "닫힌 **뒤** 제거"라 가능했던 것 — "닫히는 **중**" 봉합인 P02는 계승 못 한다. `persistentRuns`가 `agent-runs.ts:134` createRunManager 클로저 소유(펌프 밖)라 라우팅(`:162-174`)/consumer(`:211-223`) 수정이 설계상 확실히 촉발됨. P02는 cross(agent-backend+main-process)·**최소 diff** 목표로, 이미 있는 reviewer 무조건+영호 GO 게이트로 커버.
2. **백엔드 계약 변경(idle-close·라우팅·goal 신호 방출) = backend-contract·human-gate·reviewer 무조건·영호 GO.** goal 생존신호 *방출*은 P03(유예 로직과 같은 소스), *소비*는 P05(renderer-only).
3. **REPL 세션별 영속 = shared-contract + JSON 스키마 마이그(사람 게이트).** 신규 신뢰경계 횡단 없음(기존 IPC 경유) — trust-boundary 아닌 shared-contract.
4. **무한대기 688ms는 setTimeout이 아니라 SDK 스트림 teardown async 경합 — 가짜 타이머로 재현 불가.** P01은 mock 백엔드 이벤트 순서 제어(idle-close 결정과 cleanup finally 사이 send 주입)로 결정적 재현 + 라이브 확인 병행. (가짜 타이머는 P03 유예 타이머 테스트에만 유효.)

## 마일스톤 완료 판정

- 7 Phase 전부 done + 전체 게이트 green + backend-contract(P02·P03)/shared-contract(P07) Phase 영호 GO + 육안(P06) GO.
- push·PR·merge = LR4 완료 후 영호 결정.
