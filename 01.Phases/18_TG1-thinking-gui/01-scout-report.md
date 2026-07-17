---
milestone: TG1
phase: 01
kind: scout-report
title: TG1 스카우트 보고서 — 좌표 재실측 · 셀렉터 census · 공식 에셋
measured: 2026-07-16
method: 3갈래 병렬 조사(메인 통합)
consumers: P03(턴 블록 통합) · P04(상태 라인) · P05(SubAgent 계약) · P06(표면 전파) · P07(QA 회귀)
---

# TG1 P01 스카우트 보고서

> **역할**: 구현 착수 전 3대 불확실성(좌표 스냅샷 노후·셀렉터 계약 리스크·공식 에셋 부재)을 제거한 정본. 브리프 4·5단원 좌표는 2026-07-15 스냅샷 — 본 문서가 **2026-07-16 재실측 갱신본**이다. P03~P07 Worker는 라인 번호를 본 문서 기준으로 읽되, 착수 시점에 재확인한다(라인은 스냅샷, LR1).

---

## 1. 좌표 재실측 (2026-07-15 브리프 스냅샷 → 2026-07-16 현재)

### 1.0 경로 정정 (중요 — 브리프 오기 바로잡음)

브리프 4단원의 아래 경로는 **오기**다. 실제 파일 경로는 다음과 같다.

| 브리프 표기(오기) | 실제 경로 |
|---|---|
| `components/Conversation.tsx` | `02.Source/renderer/src/components/01_conversation/Conversation.tsx` |
| `components/PanelView.tsx` | `02.Source/renderer/src/components/00_shell/panel/PanelView.tsx` |
| (누락) | `02.Source/renderer/src/components/05_agent/SubAgentChatStream.tsx` |

### 1.1 shared · store (무변동 — 브리프 좌표 그대로 유효)

| 자산 | 파일 | 라인 |
|---|---|---|
| `SubAgentTranscriptItem` 타입 | `02.Source/shared/agent-events.ts` | :287-300 (신뢰경계 주석 :278) |
| thinking_delta `estimatedTokens` | `02.Source/shared/agent-events.ts` | :869-886 |
| `handleThinking` | store `text.ts` | :139-179 |
| thinking 리셋(handleText) | store `text.ts` | :115 |
| `handleThinkingDelta` | store `text.ts` | :192-223 |

→ **shared·store 전부 동일**. P05가 접촉할 SubAgent 계약 앵커(agent-events.ts:287-300)는 브리프 좌표 그대로.

### 1.2 Conversation.tsx (P16 하향 이동 — 아래로 밀림)

`02.Source/renderer/src/components/01_conversation/Conversation.tsx`

| 자산 | 재실측 라인 | 비고 |
|---|---|---|
| `WorkingIndicator` 정의 | :176-214 | 브리프 :173-211에서 하향 |
| `WORKING_PHRASES` | :141-157 | 브리프 :138-154에서 하향 |
| `ThinkingItem` | :243-305 | `continuous` prop 추가됨. 토큰 span :257 · :289-291 |
| assistant 버블(인라인) | :864-902 | `SmoothMarkdown` :895 · `MarkdownView` :897 · 아바타 :873-875 |
| assistant 아바타 JSX | :873-875 | `<span className="ava ai"><IconClaude size={16}/></span>` |
| `thread.map` 루프 | :829-1022 | |
| `WorkingIndicator` 마운트 | :1036-1047 | |

`02.Source/renderer/src/components/01_conversation/Conversation.css`
- `.thread { gap: 24px }` :27 (동일)

### 1.3 PanelView.tsx (멀티패널 표면)

`02.Source/renderer/src/components/00_shell/panel/PanelView.tsx`

| 자산 | 재실측 라인 |
|---|---|
| 자체 렌더 루프 | :511-610 |
| `ThinkingItem` 사용 | :583-589 |
| `WorkingIndicator` 사용 | :616-628 |
| `MessageBubble` 사용 | :599-609 |

→ **자체 아바타 JSX 없음 — 아바타는 `MessageBubble`에 위임**. 즉 패널 표면 아바타를 바꾸려면 PanelView가 아니라 MessageBubble을 손봐야 한다.

### 1.4 SubAgentChatStream.tsx (서브에이전트 표면)

`02.Source/renderer/src/components/05_agent/SubAgentChatStream.tsx`
- thinking 렌더 :156-171 (`saf-msg-continues` 연속성 판정 :163-164)
- **아바타 없음** — `.saf-msg-who` 라벨(텍스트)만 사용

### 1.5 MessageBubble.tsx — 패널·서브 표면 아바타 공통 소유

`02.Source/renderer/src/components/.../MessageBubble.tsx` (공통 조각)
- user 아바타 :60
- assistant 아바타 :90-92 (`IconClaude` — P16에서 `IconSpark`→`IconClaude` 통일 완료)

→ **정본**: 멀티패널·서브 표면의 화자 아바타는 MessageBubble이 단일 소유. 단일챗(Conversation.tsx)은 인라인 아바타(:873-875)를 따로 소유. 즉 아바타 교체 소비처 = **Conversation.tsx 인라인 + MessageBubble 공통** 2곳(P06 전파 대상).

### 1.6 아이콘 소비처

| 아이콘 | 정의 | 소비 파일 수 |
|---|---|---|
| `IconClaude` | `common/icons.tsx:224` | 5파일 — Conversation · MessageBubble · ToolGroup · GitModal · SettingsModal |
| `IconSpark` | `common/icons.tsx:129` | 6파일 |

### 1.7 P16 인접 연출 CSS (TG1 P03 제거/대체 대상)

턴 블록 통합 시 아래 과도기 연출을 걷어내야 한다. 클래스 4종.

| 파일 | 셀렉터 | 라인 | 효과 |
|---|---|---|---|
| Conversation.css | `.msg.ai-msg.msg-continuation` | :299-301 | `margin-top: -14px` |
| Conversation.css | `.msg.ai-msg.msg-continues .thinking-summary` | :305-313 | 연속 사고 요약 스타일 |
| SubAgentFullscreen.css | `.saf-msg.saf-msg-continuation` | :122-124 | |
| SubAgentFullscreen.css | `.saf-msg--thinking.saf-msg-continues .saf-msg-body` | :125 | |

→ 클래스 4종: `msg-continuation` · `msg-continues` · `saf-msg-continuation` · `saf-msg-continues`

### 1.8 보존 자산 — deriveHookTurnBadges (건드리지 말 것)

`02.Source/renderer/src/store/hookBadge.ts:51`
- 소비: Conversation.tsx :70 · :776 (판정 :862) / PanelView.tsx :65 · :258 (판정 :605)

→ P16 훅 배지 순수 파생 자산. TG1 턴 재작업이 이 판정 경로를 깨지 않도록 보존.

---

## 2. 셀렉터 census (99.Others/tests 전수)

### 2.1 "96개 시각·라이브 테스트" 명제 판정: **부합(타당)**

- e2e 스펙 단위 실측 ~93-132로 브리프 명제와 부합. **계량 단위 = e2e-스펙**으로 명시.
- 영향 파일 합계 ~56 (e2e ~33 + Vitest ~23).

### 2.2 위험 상위 3 — P03 보존 우선 대상

| 순위 | 셀렉터 | 규모 | 리스크 |
|---|---|---|---|
| ① | `.msg.ai-msg .content` | ~36파일 / ~90매치 | 라이브 배터리 전부의 **답변 읽기 체인**. classList 분기 존재 → 조용한 파손 위험. **보존 또는 전 소비처 마이그 필수** |
| ② | `.thread` / `.ma-p-thread` | 스크롤·인터리브 앵커 | 턴 래퍼 계층을 `.thread`와 `.msg` 사이에 삽입하면 `.thread > *` 순회·`classList.contains` 파손. 실측 파손점: m5-token:363 · conversation.test:115-122 |
| ③ | `.thinking` + data-testid 4종 | ~10파일 | testid: `thinking-block` · `thinking-toggle` · `thinking-detail` · `thinking-progress`. **사고 마일스톤 폭심지** |

### 2.3 보조 위험

- `.saf-msg--*` / `.saf-convo` — 7파일 / ~44매치. 스타일 소유 = `SubAgentFullscreen.css`.

### 2.4 영향 파일 대표 census (census 원문 요지 축약)

- **e2e 라이브** ~20파일 (라이브 배터리 답변 읽기 체인이 `.msg.ai-msg .content`에 집중 — 위험 ①)
- **시각검증** ~10파일 (`.thinking`+testid 4종에 사고 표면 집중 — 위험 ③)
- **Vitest** ~23파일

→ **게이트 지침(P03·P06)**: 위험 상위 3 셀렉터는 (1) 보존하거나 (2) 전 소비처를 census 표대로 동시 마이그해야 한다. census 밖 셀렉터 변경 발견 시 보고·중단(pin 【셀렉터 리스크】 게이트).

---

## 3. 공식 에셋 확보

### 3.1 확보 결과 — 착지 성공

`02.Source/renderer/src/assets/brand/`

| 파일 | 크기 | 사양 |
|---|---|---|
| `claude-spark-clay.svg` | 2,580 B | viewBox 94x94, 단일 path, fill `#D97757` (Clay) |
| `claude-spark-clay.png` | 937x937 | |
| `SOURCE.md` | — | 출처·상표 고지 박제 |

### 3.2 출처

- anthropic.com/press-kit → www-cdn zip (26,465,941 B) 내 `Claude logos/3 Claude Spark/`
- sha256 원본 일치(무수정 — 파일명 공백만 제거)
- **공식 명칭 = "Claude Spark"** (Anthropic이 pinwheel/스타버스트 심볼에 붙인 공식 이름)
- 상세 조달 기록·상표 고지 = `02.Source/renderer/src/assets/brand/SOURCE.md`

### 3.3 부수 실측 (하네스 정합성 — 영호 판단 사항)

- 하네스가 `Bash(curl*)` · `Bash(wget*)`를 deny(2회 자동 거부 실측) → 허용된 `Bash(node *)` fetch로 조달.
- curl deny ↔ node 허용의 정합성 판단은 영호 몫(에셋 조달 자체는 성공).

### 3.4 상표 게이트 재확인 (pin 【상표 게이트】)

- Claude pinwheel = 등록 상표 #7645254.
- **허용**: 대화 내 엔진 아바타 한정(엔진 출력 지시자).
- **금지**: 앱 아이덴티티(아이콘·이름·스플래시·마케팅).
- **M5 배포 전 게이트**: Anthropic Trademark Guidelines 재확인 후 사람 판단.

---

## 4. P03~P07 착수 요약 (한눈에)

- **P03(턴 블록 통합)**: 인접 연출 CSS 클래스 4종(§1.7) 제거·대체. 단, 위험 상위 3 셀렉터(§2.2 `.msg.ai-msg .content`·`.thread`·`.thinking`+testid)는 보존 또는 전 소비처 동시 마이그. `.thread`와 `.msg` 사이 래퍼 삽입 시 §2.2② 파손점 주의.
- **P04(상태 라인)**: WorkingIndicator(:176-214)·WORKING_PHRASES(:141-157) 인근. 신규 애니메이션은 prefers-reduced-motion 준수(pin 백로그 인접).
- **P05(SubAgent 계약)**: agent-events.ts:287-300(SubAgentTranscriptItem)·:869-886(estimatedTokens) additive 확장. 데이터 원천 부재 시 명시 보류 박제 + renderer 우아한 부재 처리(pin 【조용한 드롭 금지】).
- **P06(표면 전파)**: 아바타 소비처 2곳 = Conversation.tsx 인라인(:873-875) + MessageBubble 공통(:90-92). PanelView·SubAgentChatStream은 각각 MessageBubble 위임·라벨만이라 직접 아바타 없음.
- **P07(QA 회귀)**: §2 census 표 = 회귀 영향 범위 정본. 위험 상위 3 + 보조(`.saf-msg--*`) 우선 검증.
