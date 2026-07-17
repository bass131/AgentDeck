---
summary: LR4는 idle-close teardown 창을 공유 뿌리로 봉합해 REPL 무한대기·goal 자멸·배너 고착 3버그를 고치고 Ultracode·replMode 토글을 세션별로 정렬했다.
phase: LR4-session-stability
work-id: lr4-session-stability
status: done
grade: 복잡
owner: 영호
gate_version: 1
report_html: 00.Documents/reports/milestones/LR4-세션-안정성.html
completed_at: 2026-07-12
commit: 77e8d33
---

# LR4 — REPL/goal 세션 안정성 + 세션별 토글 완료

## TL;DR

영호 실사용에서 드러난 3버그 — (A) goal 자율 진행 자멸 · (B) goal 배너 미해제 · (C) REPL 세션 무한대기 — 를 하나의 공유 뿌리에서 봉합했다. 뿌리는 LR3 P02가 도입한 idle-close로, 매 턴 done 직후 `_inputGen`을 닫는데 `hasLoopActivity()`가 크론·웨이크업만 집계해 goal·일반 지속세션을 무활동으로 오판한다. P02에서 688ms teardown 창을 원자적으로 소거하고, P03에서 유예·자율 턴 상한·생존신호를 붙였으며, P05에서 goal 배너를 그 생존신호에 결속했다. 이어 Ultracode 토글(P06)과 replMode(P07)의 스코프를 세션별로 정렬했다. 최종 게이트는 typecheck 0 · vitest 4632 PASS · lint 0 · 하네스 38/38 · doctor STATIC PASS, reviewer는 P02·P03·P05·P06·P07 전부 CRITICAL 0이다.

## 5단계 보고

- 🎯 **무엇을 만들었나** — idle-close teardown의 688ms 무한대기 창을 원자적으로 소거하고, goal 자율 진행에 유예(3000ms)·턴 상한(100)·`autonomy_status` 생존신호를 붙였다. goal 배너를 그 신호에 결속하고, Ultracode 토글은 세션별 in-memory store로, replMode는 전역 단일에서 대화·패널별 additive 필드로 이관하며 JSON 영속을 graceful 마이그했다.
- 🤔 **왜 필요한가** — 세 버그의 공유 뿌리가 idle-close 오판(A/B/C)이라, 증상별 패치가 아니라 세션 수명 경계 자체를 고쳐야 재발을 막을 수 있었다. 특히 (C) 무한대기는 일반 대화 매 턴에서 재시작만이 복구 수단이던 최심각 결함이었다.
- 🛠️ **어떻게 만들었나** — (1) idle-close를 "닫히는 중" 봉합으로 전환: `onSessionClosing` 1회 동기 발화로 `persistentRuns`를 원자 제거해 stale-HIT 라우팅 창을 없앴다(LR3 P02의 "닫힌 뒤 제거" 계약은 계승 불가라 최소 diff cross 작업으로 처리). (2) 자율 진행 안전장치를 유예·상한으로 명시하고 생존신호를 additive 이벤트로 방출(계약 변경 0). (3) 토글 스코프는 과소(P06 리마운트 소실)와 과대(P07 전역 오염) 양쪽을 세션 경계로 수렴. replMode는 additive optional 2필드라 IPC 버전 bump 없이 graceful 폴백.
- 🧪 **테스트 결과** — typecheck 0 / vitest 4632 PASS · 0 FAIL · 8 skipped(323 files) / lint 0 / 하네스 38/38 / doctor STATIC PASS. reviewer P02·P03·P05·P06·P07 CRITICAL 0. 라이브 e2e 최종 사인오프 완료(2026-07-12, Playwright `_electron` — 신규 spec 4/4 PASS + `m3-multi-restore` 봉합 4 pass/1 skip · 아래 §라이브 e2e 사인오프).
- ➡️ **다음 스텝** — 영호 게이트(ADR-024 본문 개정[영호 직접] / PR 여부[버킷 c]) 후 하네스 H3 논의 재개.

## Phase별 커밋

| # | 내용 | 등급 | 커밋 |
|---|---|---|---|
| 01 | 무한대기·teardown 창 결정적 재현 하네스 (interrupt-stuck 재현·탈출) | 보통 | `ced4a2e` |
| 02 | 688ms 창 소거 — `onSessionClosing` 1회 동기 발화로 `persistentRuns` 원자 제거, stale-HIT 창 소거 | 복잡 | `667e10d` |
| 03 | idle-close 유예 3000ms + 자율 턴 상한 100 + `autonomy_status` additive 이벤트 방출 | 복잡 | `07b3dcc` |
| 04 | 렌더러 stuck 탈출 — 죽은 REPL run 감지 정리(2차 안전망) | 보통 | `4832155` |
| 05 | goal 배너를 `autonomy_status` 생존신호에 결속(낙관 플래그 이탈) | 복잡 | `7e28d43` |
| 06 | Ultracode 토글 세션별 in-memory store — 리마운트 유지 (RED `bcfdcb5`) | 보통 | `828faa1` |
| 07 | replMode 전역→세션별 — shared additive 2필드 + JSON 영속 graceful 마이그 | 복잡 | `77e8d33` |

## AC 검증 결과

```text
$ npm run typecheck
0 errors

$ npm run test
Test Files 323 files / Tests 4632 passed, 8 skipped, 0 failed

$ npm run lint
0 problems

$ 하네스 계약 / doctor
harness 38/38 PASS · doctor STATIC: PASS
```

- reviewer: P02·P03·P05·P06·P07 전부 CRITICAL 0.
- 영호 게이트 이력: 자율 턴 상한 100 확정 · P06 육안 "이상 무"(2026-07-12) · P07 JSON 스키마 마이그 승인 + 커밋 GO(2026-07-12, 🟡#1 대칭화 포함 선택).

## 라이브 e2e 사인오프

**사인오프 결과 (2026-07-12, Playwright `_electron` 자동화 — 영호 지시로 육안 대체)**

- 신규 spec `99.Others/tests/e2e/lr4-p07-repl-per-session-live.e2e.ts` **4/4 PASS**:
  - **S1** 단일챗 세션별 독립 — A OFF / B ON.
  - **S2** 재시작 복원 — 디스크 `chats/*.json`의 replMode를 A=false·B=true로 **직접 대조**.
  - **S3** replMode 필드 없는 옛 레코드 시드 → 크래시 0 + 기본 ON 폴백.
  - **S4** 멀티 패널 독립+복원 — 디스크 `multi-agent.json`의 snapshot.replMode를 p0=false·p1=true로 **대조**.
  - EchoBackend(`AGENTDECK_E2E=1`) 기반 — 검증 대상이 토글 상태 영속이지 대화 품질이 아니다. 실엔진 연속 턴 체감은 사용 중 자연 검증 잔여.
- 인접 회귀 실행에서 `m3-multi-restore` 기존 결함 발견 — P07 이전 커밋 `828faa1`에서 동일 재현으로 **P07 무관 실측 입증** → qa가 봉합(부트 헬퍼 조건부 클릭 + 복원-페이지 클릭 force 2곳), 최종 **4 pass / 1 skip**(SC-3은 LIVE_SDK 게이트 — 정상).

## 잔여 (정직하게)

1. **라이브 e2e 사인오프 완료 — 실엔진 연속 턴 체감만 잔여** — 신규 spec은 EchoBackend 기반 토글 영속 검증이라, 실엔진 다중 연속 턴 체감은 사용 중 자연 검증으로 남는다(위 §라이브 e2e 사인오프).
2. **ADR-024 본문 "전역 단일" framing → 세션별 개정** — 영호 직접(`00.Documents/ADR.md` L193~).
3. **P03 후속** — 유예 타이머 step-splitting 정리(qa 테스트 deferred-promise 재구성 + 타이머 단순 setTimeout화 — LR4 꼬리).
4. **P05 잔여 리스크** — ended 신호 유실 + error/abort 미발생 경계에서 goal 배너 고착 가능(🟡). heartbeat/watchdog 폴백은 REPL 4b auto-revive 재도입 시 협의(현재는 터미널 리셋 폴백).
5. **ultracodeToggle offKeys 정리 훅 부재** — 대화 삭제 시 OFF 키 잔존(저심각, in-memory·앱 재시작 시 소멸).
6. **복원 페이지 전역 Playwright 액셔너빌리티 데드락** — 복원된 페이지에서만 모든 일반 클릭이 'stable' 판정에 막힌다(신규 페이지는 정상). qa 계측상 애니메이션 0·box 정지·오버레이 없음인데도 타임아웃 → **JS 구동 지속 갱신 루프 추정**(유력 후보: REPL 활성 인디케이터 JS 구현/라이브 tick). e2e는 현재 force 클릭 + 디스크 단정으로 우회. renderer 조사 후속 — e2e 정직 클릭 회복 + **성능/배터리 함의**(사실이면 복원 화면이 상시 CPU 소모) 확인.

## 학습 일지 후보 키워드

- idle-close teardown 창과 stale-HIT 라우팅 원자 제거
- 자율 진행 유예·턴 상한·생존신호(autonomy_status) additive 이벤트
- goal 배너 낙관 플래그 대 백엔드 생존신호 결속
- 토글 스코프 과소/과대와 세션 경계 수렴
- replMode additive optional 필드와 JSON 영속 graceful 마이그
