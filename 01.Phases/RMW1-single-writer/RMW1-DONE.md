---
owner: 영호
milestone: RMW1
title: RMW1-single-writer 마일스톤 종합 보고
date: 2026-07-03
status: done
---

# RMW1-single-writer — 마일스톤 종합 -DONE (5단계 보고)

> 브랜치 `feature/rmw-lost-update` (master 기점). Phase 5/5 완료.
> 최종 게이트: **4005 tests PASS · typecheck 0 · lint 0 · build green · 전수 grep SAVE 잔존 0 · reviewer 전 Phase + 통합 통과(CRITICAL 0)**.

## 🎯 무엇을 (목표)

`multi-agent.json`(멀티세션 단일 blob)의 **lost-update 경합을 구조적으로 제거** — renderer 다중 주체의 분산 read-modify-write(RMW)를 전면 폐기하고, 병합 책임을 main 단일 기록자로 이관(ADR-031). blob 통짜 `MULTI_SESSION_SAVE` 채널은 소멸 — renderer 측 RMW 재발이 컴파일 타임에 불가능.

## 🤔 왜 (배경·결정)

- BF3 P05 reviewer 🟡가 발견한 선재 레이스: autosave(debounce 500ms) × 언마운트 flush × CRUD 5액션 × 다중 패널이 각자 `LOAD → 수정 → SAVE`를 돌려, IPC 왕복 간극에 낀 write가 last-write-wins로 통째 소실.
- CAS(세대 토큰) 대비 명령 이관을 채택 — 감지·재시도가 아니라 **경합 질문 자체를 소멸**(ADR-031, 기각 대안 3종 기록). Electron main의 run-to-completion이 락 없이 원자성을 공짜로 제공.
- 게이트 확정 2건(영호, 2026-07-03): ① 채널명 단일 dot camelCase(`multi.cmdUpsert`) 수용 — 골든 정합. ② **미지 id upsert = no-op + `ok:false`** — 삭제된 세션의 뒤늦은 autosave가 세션을 되살리는 "stale upsert 부활" 차단(P02 reviewer 🟡 → phase 문서의 "없으면 append"를 override).

## 🛠️ 어떻게 (Phase별 커밋)

| # | 내용 | 커밋 | 핵심 |
|---|---|---|---|
| 01 | 경합 재현 3계열 박제 (TDD RED) | `280114a` | deferred-promise 인터리브 결정론 재현 — (a) autosave×flush (b) autosave×CRUD (c) select×rename. `it.fails`로 유실을 CI green으로 증명 |
| 02 | shared 명령 5종 계약 + preload 노출 | `e2cd03e` | `multi.cmdUpsert/Create/Delete/Rename/Select`, 응답 공통 `{ok, state}`(병합 후 권위 상태). upsert는 title 제외(rename 전용) |
| 03 | main 병합 의미론 + 동기 원자 핸들러 | `6a026fb` | 순수 병합 함수 5종(fs 무의존, 단위테스트 22) + `readMulti→병합→writeMulti` **await 0** 동기 블록. 입력 형태검증(untrusted) |
| 04 | renderer 이관 + P01 GREEN | `2ba91c3` | 6개 호출처 → 명령 1발 + 응답 미러 수렴(`mirrorFromState` 단일 정의). mock이 main 실제 병합 함수 재사용(드리프트 원천 차단). **P01 3계열 `.fails` 제거 → PASS** |
| 05 | SAVE 채널 소멸 + 마감 | (본 커밋) | shared 채널·타입 + preload 노출 + main 핸들러 제거, 테스트 잔재 15파일 정리, 골든에 `multi.cmd*` 전용 블록, ARCHITECTURE·ADR-031 현황 정합 |

부수 수리(계획 밖 발견): ⓐ P02 계약 JSDoc의 upsert "없으면 append" 서술을 게이트 확정안으로 정정(shared 3곳 + preload 2곳 — 행동 코드 0줄) ⓑ qa가 `multi-ultracode` 테스트 I의 vacuous pass(항상 통과) 위험을 발견해 실제 저장 트리거 + 호출 단언으로 보강.

## 🧪 검증 (게이트 원칙)

- **TDD 관통**: P01 RED(경합 유실 재현) → P04 GREEN(`.fails` 제거 후 3/3 PASS) = lost-update 소멸의 기계 증거. P03도 RED(22케이스) → GREEN 순서.
- **reviewer 4회**: P02(사전, 🟡1 → P03 반영) / P03(trust-boundary 무조건, 🟢 CRITICAL 0) / P04(🟢, 🟡2 비차단) / **통합**(마일스톤 전체 diff, 🟢 CRITICAL 0 · 🟡2 → 본 커밋 전 전부 봉합: DONE.md 박제 + 골든 전용 블록).
- **기계 게이트**: typecheck(양쪽) 0 · test 4005 green(기존 3983 + 신규) · lint 0 · build green · 전수 grep(`MULTI_SESSION_SAVE|multiSessionSave|multi.save`) 소스 잔존 0.
- **잔여 검증 부채**: ADR-031 완료조건 ④(멀티패널 e2e **라이브** 회귀)는 **"라이브 e2e 일괄" 잔여 건으로 이월** — 로직은 P01(컴포넌트 레이스)+P03(의미론 단위) 레벨로 증명 완료, 잔여는 full-Electron 실행분만. 추적: ADR-031 현황 줄 + 본 문서.

## ➡️ 다음 (인계·잔여 결정)

1. **push · PR 생성** — 사람 게이트(영호 GO 대기).
2. **라이브 e2e 일괄** — 멀티패널 라이브 회귀 포함(ADR-031 ④ 이월분 + REPL 라이브 사인오프 등 기존 잔여와 묶음).
3. M5 배포(electron-builder) — 기존 백로그.
4. P04 reviewer 관찰 기록(비차단): mock은 main 핸들러 앞단 shape-guard를 재현하지 않음 — 핸들러 검증 회귀는 main 측 테스트(P03)가 커버 담당 유지.

## 🎓 이번 마일스톤에서 배운 것

1. **감지보다 제거** — CAS는 충돌을 *감지*하고 재시도를 남기지만, 명령 이관은 "간극" 자체를 소멸시킨다. 경합 해법을 고를 때 "충돌 시 어떻게?"라는 질문이 남는 설계는 복잡성이 이동했을 뿐이다.
2. **run-to-completion은 공짜 락** — JS 이벤트루프는 시작한 동기 블록을 끝까지 실행한다. `await` 하나가 그 보장을 깬다 — "핸들러 경로 await 0"을 완료조건(grep 검증)으로 박은 이유.
3. **순수 함수로 의미론 분리** — 병합 규칙을 fs/IPC에서 떼니 단위 테스트가 mock 없이 돌고, renderer 테스트 mock이 *그 함수를 그대로 import*해 구현-테스트 드리프트가 구조적으로 불가능해졌다.
4. **"금지"보다 "불가능"** — SAVE 채널을 없애니 RMW 재발이 규칙 위반이 아니라 컴파일 에러다. 가드레일은 문서가 아니라 타입 시스템에 박는 게 제일 싸다.
5. **stale 명령은 부활 벡터** — upsert의 "없으면 추가"는 편의였지만, 삭제와 경합하면 유령 세션을 되살린다. 정상 경로에서 id 발급 주체(cmdCreate)가 유일하면 "미지 id = stale"로 판정해 거부할 수 있다 — 의미론을 좁혀서 얻는 안전.
