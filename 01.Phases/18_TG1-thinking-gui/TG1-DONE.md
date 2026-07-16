---
summary: 사고 GUI를 Claude Code Desktop 스타일로 재작업(8 Phase 완주 — P08 스플릿 뷰 균등·지그재그는 마감 후 편입, 하단 Addendum 참조) — 턴 블록 통합(한 턴=한 블록=아바타 1개, groupIntoTurnBlocks)·한 줄 상태 라인(✻ 심볼·동사 순환·경과 초·실시간 토큰 통합, 답변 시작 시 소멸)·공식 Claude Spark 아바타(듀얼 백엔드 엔진 식별)를 단일챗·멀티패널·서브에이전트 표면 3종에 전파. P05 서브 사고 토큰·훅 알림은 SDK 귀속 채널 부재(parent_tool_use_id 없음)로 명시 보류(재개 조건 = SDK 채널 부여, 서브는 우아한 부재 처리). 최종 게이트 typecheck 0·Vitest 5246 passed/0 failed·lint 0·라이브 배터리 GREEN·옵트인 shot 4/4·census 셀렉터 파손 0·reviewer 전 Phase 🔴 0. 헌팅 결함 1건(StatusLine 이중 말줄임) 즉시 봉합. 잔여 = 사람 트랙 3건(영호 육안 14컷·push·PR) 후 M5 배포(상표 게이트 인계).
phase: TG1-마일스톤-마감
work-id: tg1-thinking-gui
status: done
grade: 대규모
gate_version: 1
report_html: 00.Documents/reports/TG1-사고GUI-데스크톱스타일-7페이즈-완주-보고서.html
owner: youngho
milestone: TG1
completed_at: 2026-07-16
---

# TG1 — 사고 GUI 데스크톱 스타일 마일스톤 완료 박제

**기간**: 2026-07-16 (P08 편입 2026-07-17) · **브랜치**: `feature/tg1-thinking-gui` (전부 로컬 커밋·미push) · **Phase**: 8개(P01~P08) 전부 done — P08은 마감 후 편입(하단 Addendum)

## TL;DR

GAP1 마감 육안 중 영호 피드백 2건(사고 인디케이터↔답변 분리감·아바타 불일치)에서 이월된 마일스톤을 **7 Phase(P01~P07)로 닫았고, 이후 마감 육안에서 P08(스플릿 뷰 균등·정적 하이라이트·지그재그)을 편입해 8 Phase로 완주했다**(2026-07-17 · GAP1 P16 마감 후 편입 선례 · 하단 Addendum). GAP1 P16이 인접 연출(gap 축소)로 임시 봉합했던 "분리감"의 근본 원인은 **"턴"이라는 묶음 개념이 DOM에 없다는 것**이었고(P16 학습 계승), 진짜 해법은 구조였다. TG1은 ① **턴 블록 통합**(`groupIntoTurnBlocks` — 사고 상태·전문·답변을 한 턴 블록=아바타 1개로 통합) ② **한 줄 상태 라인**(`StatusLine` — ✻ 심볼·유희적 동사 순환·경과 초·실시간 토큰을 한 줄로 통합, 답변 시작 시 소멸) ③ **공식 Claude Spark 아바타**(자체 SVG 대신, 듀얼 백엔드 엔진 식별)를 세우고, 이를 단일챗·멀티패널·서브에이전트 **표면 3종**에 전파했다. 셀렉터 계약 리스크(`.msg` 구조 변경 → 96 시각·라이브 테스트)는 P01 census 선행 게이트 + **census 밖 파손 0**으로 봉쇄했다. 최종 게이트 전건 green(typecheck 0 · Vitest **5246 passed/0 failed** · lint 0 · 라이브 배터리 GREEN · 옵트인 shot 4/4 무재베이스라인 · census 파손 0 · reviewer 전 Phase 🔴 0). P07 채증 중 발견한 헌팅 결함 1건(StatusLine 이중 말줄임)은 즉시 봉합했다(`c291b2c`). 서브에이전트 사고 토큰·훅 알림은 SDK 귀속 채널 부재로 명시 보류(재개 조건 명시·조용한 드롭 아님). 잔여는 사람 트랙 3건 — ① 영호 육안 14컷 ② push 1회(영호 승인) ③ PR 생성 GO — 그 뒤 M5 배포(상표 게이트 인계)로 간다.

## 5단계 보고

- 🎯 **무엇을 만들었나** — Claude Code CLI/Desktop의 사고(thinking) 진행 표시를 AgentDeck GUI 안에서 **Desktop 스타일로 재작업**했다. **(1) 턴 블록 통합**: 예전엔 사고 상태(스피너)·사고 전문·답변 버블이 각자 아바타를 단 독립 `.msg` 블록 3개로 나열되고 아바타 아이콘조차 불일치(사고=IconClaude·답변=IconSpark)했다. `groupIntoTurnBlocks`로 이 셋을 같은 블록의 좌측 연속 거터로 꿰어 **한 턴 = 한 블록 = 아바타 1개**로 통합, 사고→답변 전환 시 블록이 바뀌지 않는다(GAP1 P16 인접 연출 CSS는 구조적 통합으로 대체·제거). **(2) 한 줄 상태 라인**: `StatusLine`이 ✻ 심볼 애니메이션·유희적 동사 순환(`WORKING_PHRASES`)·경과 초·실시간 토큰을 한 줄로 통합하고, 답변이 시작되면 소멸(`thinkingStartedAt` null 리셋, 같은 턴 블록 내부 전이). **(3) 공식 Claude Spark 아바타**: 자체 SVG 대신 공식 로고(`.ava-spark`)를 화자 아바타로, Claude 엔진 한정 교체(Codex 유지) — 듀얼 백엔드에서 화자 아바타 = 엔진 식별 기능 정보. **(4) 표면 3종 전파**: 단일챗 완성분을 `MessageBubble` 공유 리프 + `PanelView` 턴 블록화 + SubAgent 정적 ✻로 멀티패널·서브에이전트에 전파.
- 🤔 **왜 필요한가** — GAP1 P16이 사고 인디케이터와 답변의 분리감을 인접 연출(gap 축소)로 임시 봉합했지만 그건 과도기 처리였다. 분리감의 근본 원인은 요소의 결함이 아니라 **"턴"이라는 묶음 개념의 DOM 부재**였고(P16 학습 계승), 그래서 진짜 해법은 구조 — 턴 블록이라는 DOM 묶음을 만드는 것이다. 영호가 GAP1 마감 육안 중 낸 피드백 2건(① 실시간 토큰 인디케이터와 답변 버블이 분리돼 보여 가시성이 떨어진다 ② 아바타 불일치)에서 이월된 이 마일스톤이 그 구조를 세웠다. 상태 라인 통합은 사고 중 화면 소음(스피너·전문·토큰 게이지가 따로 노는 것)을 한 줄로 정돈해 Claude Code Desktop 수준의 밀도를 회복하는 것이 목적이다.
- 🛠️ **어떻게 만들었나** — 착수 전 3대 불확실성 제거(P01 = 유일 착수점, 코드 무변경): 좌표 재실측(LR1 교훈 — 브리프 좌표는 스냅샷) + 공식 에셋 확보(Newsroom press kit 정본) + `.msg` 소비처 셀렉터 census(선행 게이트). 그 위에 데이터 토대(P02 — `thinkingStartedAt`+경과 파생 순수 함수, Date.now 주입 가능화로 테스트 가능성)와 계약 판정(P05 — 서브 토큰·훅 probe-first)을 병렬로 놓고, 구조(P03 턴 블록)→상태 라인(P04)→표면 전파(P06)→마감 게이트(P07) 순서로 직렬 진행. 셀렉터 계약이 테스트 스위트의 암묵 API라(구조 변경 = 계약 변경), census 밖 변경은 보고·중단 규율을 두고 census 밖 3번째 소비처는 P03에서 재베이스라인했다. 전 Phase TDD RED 선행(CORE-05, 예: P02 RED 14 → GREEN 17/17).
- 🧪 **테스트 결과** — 최종 게이트(P07 마감 시점 실측): `npm run typecheck` 0 errors(node+web) / `npm run test` **Vitest 5246 passed / 0 failed**(P06에서 신규 18 단언) / `npm run lint` 0 problems. **라이브 배터리 전건 GREEN** + **옵트인 shot 4/4 무재베이스라인** + **census 셀렉터 파손 0**(96 시각·라이브 계약 보존). 게이트 수치는 Phase가 쌓이며 증가 — P03 `5201` → P04 `5228` → P06 `5246` passed. **reviewer 전 Phase 🔴 0**(🟡 비차단만). P07 채증 중 헌팅 결함 1건(StatusLine 이중 말줄임)을 재현→봉합(`c291b2c`), 채증 하네스 TG1SHOTS로 14컷(7장면 × dark/light) + GAP1 골든 20장 부수 복원.
- ➡️ **다음 스텝** — ① **영호 육안 14컷 판정**(ui-visual 사람 게이트): 7장면 × dark/light. 관전 포인트 = 한 턴=한 블록=아바타 1개(Spark 실렌더)·상태 라인 4요소 한 줄 통합·답변 전환 시 상태 라인 소멸(별개 블록 없음)·**봉합 확인 컷**(이중 말줄임 점 6개면 회귀)·멀티패널 동형 턴 블록·서브 우아한 부재(정적 ✻·배지 부재)·서브 데이터 부재 명시 문구·양테마. 열람 가이드 = `00.Documents/reports/TG1-육안검수-14컷-열람가이드.html`. ② **push 1회**(영호 승인 — 10커밋 전부 로컬 미push, 멀티머신 공통 진실 갱신, 떠나기 전 승인 확인). ③ **PR 생성 GO** → 이후 **M5 배포**(electron-builder NSIS + electron-updater, asarUnpack LSP 함정 = ADR-009, **상표 게이트 M5 인계**).

## Phase 결과 요약 (P01~P07)

| Phase | 제목 | 핵심 커밋 |
|---|---|---|
| P01 | 스카우트 재실측·공식 에셋 확보·셀렉터 census | `b61798a` (코드 무변경 — 조사·에셋만) |
| P02 | 사고 경과 시간 데이터 토대 (store) | `48eecaa` (reviewer 🟡 2 봉합 · RED 14 → 17/17) |
| P03 | 턴 블록 통합 재구조 + 공식 로고 아바타 | `9a0567c` (typecheck 0 / 5201 / lint 0 · reviewer 🔴 0 · 🟡 1→P04) |
| P04 | 한 줄 상태 라인 (심볼·동사 순환·경과 초·토큰) | `4315426` (typecheck 0 / 5228 / lint 0 · reviewer 🔴 0 · 🟡 3) |
| P05 | SubAgent 계약 additive — 명시 보류 종결 | `8d082e2` (SDK 귀속 채널 부재 · 코드 0) |
| P06 | 표면 전파 — 멀티패널·서브에이전트 | `00dc14f` (typecheck 0 / 5246[신규 18 단언] / lint 0 · reviewer 🔴 0 · 🟡 3 · 옵트인 shot 4/4) |
| P07 | 회귀 정합·시각검증 채증·라이브 배터리 | `9a08494` · `c291b2c`(헌팅 fix — 이중 말줄임) |
| P08 | 스플릿 뷰 균등 셀·정적 하이라이트·지그재그 (마감 후 편입) | `fb6f954` (typecheck 0 / 5247 / lint 0 · reviewer 🔴 0 · policy 37·container 18 RED→GREEN · qa 재베이스라인 `0875317`) |

## 리스크·보류 (정직 기록)

- **P05 명시 보류 1건 (서브에이전트 사고 토큰·훅 알림)**: probe-first 채증 결과 SDK 귀속 채널 부재 — `SDKThinkingTokensMessage`·`SDKHook*Message`에 `parent_tool_use_id`가 없어 어느 서브의 것인지 붙일 수 없다. 명시 보류로 박제(코드 0), renderer 몫은 P06에서 **우아한 부재 처리**(서브 정적 ✻ + 데이터 부재 시 명시 문구)로 대신. **재개 조건 = SDK가 `parent_tool_use_id` 부여**. 서브 정적 ✻는 라이브 틱을 일부러 미채택(데이터 없이 애니메이션만 돌리면 거짓 신호) — 조용한 드롭 아님.
- **reviewer 🟡 (전 Phase 🔴 0 · 비차단 advisory)**: P03 flatIdx→P04 흡수 · P04 ① 인터벌 null 게이팅 유휴 최적화(보류) · P04 ② 이중 말줄임(P07 `c291b2c` 봉합 — 봉합 확인 컷 감시) · P04 ③ phrase 전환 페이드 부재(의도적 단순화 — 취향 판단) · P06 ① 주석 stale(해소) · P06 ② 엔진-아바타 이중 소스(백로그) · P06 ③ 서브 PNG 외관 변화(육안 귀속).
- **상표 게이트 (M5 인계)**: Claude 로고 = Anthropic 등록 상표 **#7645254**(등록일 2025-01-07). 리스크 낮음으로 완화(지명 사용 관행 + 듀얼 백엔드 기능적 엔진 식별 + Orca 선례)됐으나 게이트 유지 — ① 대화 내 엔진 아바타로만 사용(앱 자체 아이콘·이름 금지) ② M5 배포 전 Anthropic Trademark Guidelines 확인 게이트 ③ 에셋 소스 정본 = Newsroom press kit(자체 재현 SVG 금지). TG1은 대화 아바타 한정 적용까지, 게이트는 **M5로 인계**.
- **백로그 승계**: 서브에이전트 사고 토큰·훅 알림(SDK `parent_tool_use_id` 부여 시 재개) · 엔진-아바타 단일 소스화(Codex 동적 백엔드 배선 시 prop 주입 수렴) · `continuity.ts`·continuation prop 사문화 정리(P06 의도적 보존) · P04 phrase 전환 페이드 재도입(취향 판단).
- **잔여 사람 트랙 3건 (구현 완주와 별도)**: ① 영호 육안 14컷 ② push 1회(영호 승인) ③ PR 생성 GO → M5 배포.

## AC 검증 결과

마일스톤 완료 조건을 실제로 실행한 명령과 결과(P07 마감 시점 실측):

```text
$ npm run typecheck
  0 errors (node+web)

$ npm run test        # Vitest — P07 마감
  Tests  5246 passed | 0 failed   (P06 신규 18 단언 포함)

$ npm run lint
  0 problems

$ 라이브 배터리 (Playwright _electron)
  전건 GREEN · 옵트인 shot 4/4 무재베이스라인 · census 셀렉터 파손 0
```

- [x] 8 Phase 전부 `status: done` — P01~P08 (각 Phase typecheck 0 · Vitest green · lint 0 + TDD RED 선행 · P08은 마감 후 편입)
- [x] 두 스펙 성립 — 턴 블록 통합(한 턴=한 블록=아바타 1개, `groupIntoTurnBlocks`) · 한 줄 상태 라인(4요소 통합·답변 시작 시 소멸)
- [x] 공식 Claude Spark 아바타 — 자체 SVG 대체, Claude 엔진 한정 교체(Codex 유지)
- [x] 표면 3종 전파 — 단일챗 · 멀티패널(`PanelView` 턴 블록화) · 서브에이전트(정적 ✻·우아한 부재)
- [x] 셀렉터 계약 보존 — P01 census 선행 게이트 + census 밖 파손 0(96 시각·라이브 계약)
- [x] P05 명시 보류 — SDK 귀속 채널 부재로 서브 토큰·훅 보류(재개 조건 명시·우아한 부재 처리·조용한 드롭 아님)
- [x] 헌팅 결함 1건 봉합 — StatusLine 이중 말줄임 재현→`c291b2c`(봉합 확인 컷 감시)
- [ ] 영호 육안 16컷 (사람 게이트 — 7장면 + P08 스플릿 지그재그 = 8장면 × dark/light 대기)
- [ ] push·PR (사람 게이트 — 영호 승인 대기)

## 학습 일지 후보 키워드

- 분리감은 요소의 결함이 아니라 "턴"이라는 묶음 개념의 DOM 부재다(P16 학습 계승) — 인접 연출(과도기)이 아니라 구조(턴 블록)로 해소
- 렌더 경로 시간 의존(Date.now)의 주입 가능화 = 테스트 가능성(P02)
- 셀렉터 계약이 테스트 스위트의 암묵적 API다 — 구조 변경 = 계약 변경, census가 선행 게이트(P01·P07)
- probe-first — 서브 토큰·훅은 SDK가 주는지 먼저 채증, 못 주면 명시 보류 + 우아한 부재(조용한 드롭 금지, P05)
- 데이터 없는 애니메이션은 거짓 신호 — 서브 정적 ✻로 라이브 틱 미채택(P06)
- 상표는 지명 사용(대화 아바타)까지 허용하되 앱 아이덴티티는 게이트 — M5 인계

사람 게이트: 영호 육안 16컷 → push 승인 → PR GO(2026-07-17 대기) — merge는 별도 게이트.

---

## Addendum — P08 마감 후 편입 (2026-07-17)

> **명제 정정**: 본 마일스톤은 2026-07-16에 7 Phase(P01~P07)로 마감·봉인됐으나, 마감 육안 중 영호 피드백으로 **P08(스플릿 뷰 재작업)을 편입해 8 Phase로 완주**했다. 상단 본문의 "7 Phase 완주" 서술은 **편입 전 시점의 기록**이며, 최종 명제는 **8/8 완주**다(GAP1 P16 "7/7 done 명제 잔존" plan-auditor 🔴 교훈 선반영 — 바른 명제는 8/8).

- **편입 경위** — GAP1 P16이 열어둔 마감 후 편입 선례를 따라, 영호가 마감 육안 중 서브에이전트 스플릿 뷰에 대해 낸 육안 피드백 3건(2026-07-17 확정)을 P08로 편입했다. 코어·공유계약·하네스 행동 변경은 없다(renderer 국소 + 정본 테스트 교체).
- **영호 확정 3건** — ① 활성 셀 자동 확대(flex-grow 2:1) 폐기 → 전 셀 균등 고정(확대 reflow가 산만) ② 활성 표시를 정적 하이라이트(크기 불변 — 테두리/헤더 점등)로 대체 ③ 좌측 컬럼 선채움 → 좌·우·좌·우 지그재그(짝수 index=좌·홀수=우, 좌우 균형 선호).
- **구현 요지** — `computeColumns` 지그재그 · `rowWeights`/`ACTIVE_WEIGHT`/`ROWS_PER_COLUMN` 완전 삭제(균등은 CSS `flex: 1 1 0` 단독 소유) · `flexGrow` 인라인 주입 제거 → `.sag-cell--active` 클래스 · `noteActivity` running 한정 트리거 보존 · 정적 하이라이트 = `--accent-line` ring + `--accent-soft` 헤더 틴트(기존 Clay 토큰, **신규 HEX 0**).
- **게이트** — `npm run typecheck` 0 · `npm run test` Vitest **5247 passed** · `npm run lint` 0 · 정본 테스트 교체(policy 37·container 18 RED→GREEN) · reviewer 🔴 0.
- **채증** — TG1SHOTS p08 장면 2컷(`ScreenShot/p08-split-zigzag-dark.png`·`-light.png`).
- **옛 계약 옵트인 2종 재베이스라인** — qa 커밋 `0875317`(P14SHOTS 5/5 GREEN · hunt-r4 정적 검토로 대체).
- **GAP1 p14 골든 10장** — 부수 재생성 발생분을 명시 경로 `git checkout --`로 복원(역사 기록 보존 — 17_GAP1 status 잔여 0).
- **커밋** — 구현 커밋 A `fb6f954` + 추적 문서 8 Phase 화해 커밋 B.
- **잔여(변동)** — 영호 육안 **16컷**(P08 스플릿 2컷 포함 일괄) → push 승인 → PR GO → M5.

### 아바타 적용 전수 감사 (2026-07-17, 영호 지시)

> **동기** — TG1이 세운 "한 턴 = 아바타 1개(Spark)" 불변식이 대화 표면 전반에 실제로 성립하는지, 그리고 화자 아닌 곳에 아바타가 새지 않았는지를 전수 확인.

- **감사 결과** — 대화 화자 3대 표면(단일챗 · 패널 턴 헤더 + `MessageBubble` 공유 리프) Spark 적용 확인 · **미적용 라이브 1건 발견·봉합** — `ToolGroup` lead 아바타(구 `IconClaude` + "Claude" 라벨)가 턴 블록 헤더 Spark와 **동시 노출** = "한 턴 = 아바타 1개" 불변식 위반. **bare 게이트 동형 억제**(Spark 교체가 아니라 lead 아바타 자체를 숨김)로 봉합, 기존 테스트가 이 버그를 정상으로 단정하던 것을 **불변식 단언**(턴당 `.ava.ai` 정확히 1개)으로 교체.
- **의도적 비적용 확인(설계상 정상)** — Codex 폴백 분기(비Claude 엔진 로고 금지 — 상표 설계) · bare 억제 `ThinkingItem` · 죽은 `WorkingIndicator`(하위호환 export).
- **(b) 엔진 표시 3곳은 화자 아님 → 구 아이콘 유지** — `SettingsModal` 엔진 탭 · 현재 엔진 카드 · `GitModal` AI 커밋 버튼. 상표 게이트("대화 아바타 한정")대로 Spark 미적용, 구 아이콘 유지 — 이들로의 Spark 확장은 **영호 별도 결정 사항으로 박제**.
- **게이트** — `npm run typecheck` 0 · `npm run test` Vitest 전건 green · `npm run lint` 0.
- **커밋** — `fix(renderer): ToolGroup lead 아바타 중복 억제`(`ToolGroup.tsx`·`Conversation.tsx`·`conversation.test.tsx`).

---

## Addendum — P09 provider 브랜드 로고 단일소스 (2026-07-17)

> **편입 경위** — 위 아바타 감사 (b)가 "엔진 표시 3곳으로의 Spark 확장 = 영호 별도 결정"으로 박제했던 항목을 영호가 GO(2026-07-17)로 열었다. 상표 게이트를 "대화 아바타 한정"에서 **"provider 기준 엔진 표시 전반"**으로 확장하되(앱 아이덴티티 금지 불변), provider→브랜드 로고를 **단일소스(SSOT)**로 세워 표면 전반을 이 한 매핑으로 수렴시켰다. TG1은 이로써 **9/9 완주**(P08에 이은 두 번째 마감 후 편입 — GAP1 P16 선례). 코어·공유계약·하네스 행동 변경 없음(renderer 국소 + 에셋 + 정본 테스트 신규).

- **구현** — `providerBrand.ts` 순수 descriptor SSOT(부수효과 0): `claude`→공식 Spark(테마 공용 단일 에셋) / `codex`→OpenAI Blossom(**dormant** — 테마 스왑: black=라이트·white=다크) / 미지 provider→자체 폴백. 공통 컴포넌트 `ProviderBrandIcon`이 이 descriptor를 소비한다. **소비처 수렴** = 대화 턴 아바타(`Conversation`·`PanelView` 중복 로직 소멸 — **P06 🟡 "엔진-아바타 이중 소스" 백로그 해소**) · `MessageBubble` · Welcome 히어로 · `SettingsModal` 2곳 · `GitModal` AI 커밋 버튼. 구 `isClaudeEngineAvatar`/직접 import는 **완전 소멸**(grep 0).
- **에셋** — OpenAI 공식 배포 zip(`cdn.openai.com`)에서 Blossom 4파일 착지(`sha256` = `SOURCE.md` 박제). Codex 전용 로고 미배포 확인 → **provider 마크 = Blossom** 판정. 지명 사용 허용 문구 확인 + 재채색 금지 조항 → **CSS 색 변조 0**(순수 에셋 스왑, 변형 금지 준수).
- **plan-auditor** — 🔴 1건(작업4 scope creep 문리) **옵션 A 즉시 봉합** — Codex 매핑은 **dormant**(라이브는 Claude만, Codex UI 미신설 = Track 2 X1 인계) · 🟡 4건 전건 반영.
- **reviewer** — 🟢(🔴 0 · 🟡 2, 비차단): 🟡-1 Welcome 히어로 저대비(accent 위 Clay)를 기존 처방 동형 `.wc-mark.wc-mark-spark` **중립 표면**(`--surface-2` + `--line-2`)으로 **즉시 봉합**(미지 폴백은 accent 유지) · 🟡-2 `getTheme()` 동기 읽기 테마 stale은 현 라이브 무해(Claude 테마 무관) — **Track 2 X1 인계 노트: Codex 배선 시 테마 반응형 승격 필수**.
- **qa** — **TG1SHOTS 11/11 GREEN** · p09 6컷(`welcome-hero`·`settings-engine`·`git-commit` × dark/light — welcome은 봉합 후 **재채증본**) · 이미지 비교 골든 부재 실측 확정(재베이스라인 불요) · 부수 덮어쓰기 10장 명시 경로 복원.
- **게이트** — `npm run typecheck` 0 · `npm run test` Vitest **5256 passed** · `npm run lint` 0.
- **상표 게이트 확장 박제** — 대화 아바타 한정 → **provider 기준 엔진 표시 전반**(영호 GO 2026-07-17). 앱 아이덴티티(자체 아이콘·이름) 금지 조항은 **불변**. M5 배포 전 **양사(Anthropic·OpenAI) 가이드라인 일괄 확인** 게이트 인계.
- **Track 2 X1 인계 2건** — ① Codex 매핑 테마 반응형 승격(현 `getTheme()` 동기 stale → 반응형 필수) ② Codex 배선 시 dormant 활성(라이브 provider 스위칭).
