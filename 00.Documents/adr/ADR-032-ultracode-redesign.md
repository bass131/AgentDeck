### ADR-032: UltraCode 상호작용 재설계 — 단발성 폐기(지속 토글) + 키워드 트리거 + Workflow 상시노출·턴별 동적 게이트

**결정(영호 확정 2026-07-03 · v2 개정 동일자 · 구현 완료 2026-07-04)**:
1. **지속 토글** — UltraCode의 단발성(전송 시 자동 OFF, `Composer.tsx` one-shot 리셋)을 폐기하고 사용자가 끌 때까지 유지되는 진짜 토글로 전환.
2. **키워드 트리거** — 메시지 본문에 "UltraCode"(대소문자 무관) 또는 "/workflows" 언급 시 토글 상태와 무관하게 *그 턴*을 오케스트레이션 수행(실제 Claude Code CLI의 ultracode 키워드 opt-in 미러). 토글=지속 opt-in / 키워드=턴 단위 opt-in — 두 경로 공존(OR 결합).
3. **키워드 가시성** — 컴포저 입력 중 두 키워드에 Claude Code CLI와 같은 메커니즘의 보라 그라데이션 애니메이션. textarea는 부분 스타일 불가 → 투명 textarea + 미러 오버레이(backdrop) 표준 기법. UI.md §5 안티슬롭 네온 예외(현 UltraCode·REPL pill 한정)에 **키워드 하이라이트 확장 등재**(ADR-030 선례의 명문화 waiver).
4. **백엔드 전제(구조적 귀결)** — `Workflow`를 `disallowedTools`에서 제거(모델에 상시 노출)하고, `canUseTool`이 **턴별 orchestration 상태를 동적 평가**(허용 턴 = 사용자 승인 게이트 G1/G2, 비허용 턴 = 즉시 deny G4 유지). held-open 세션에 후속 턴이 push될 때 턴별 orchestration이 라이브로 반영되도록 배선(`agent-runs.ts` ActiveRun). `ORCHESTRATION_SYSTEM_GUIDE`는 세션 생성 시 고정이므로 상시 합성으로 전환(사용 조건 서술 포함) 또는 턴 프리픽스 — 구현 Phase에서 확정.

**근본 문제(라이브 e2e 일괄 실증, 2026-07-03)**: SDK(`@anthropic-ai/claude-agent-sdk@0.3.186`) held-open 세션은 도구 목록을 중간에 바꾸는 공식 수단이 없음(Query 런타임 메서드 = interrupt/setPermissionMode/setModel 등 — setTools 류 부재, 로컬 타입 실물 검증). 세션 고정 `disallowedTools`와 단발성(턴 단위) UltraCode 의미론이 구조적으로 불일치 → **대화 중간 UltraCode ON이 그 세션에 영영 무력**(orchestration-live 시퀀스 실패로 재현·실증).

**기각 대안**: ⓐ 토글 변경 시 세션 재생성+resume(단발성 특성상 사용마다 재생성 2회 — 세션 churn·resume 경계 맥락 리스크·지연) ⓑ `applyFlagSettings`(Settings에 disallowedTools 포함 여부 미문서화 — 불확실성 위에 설계 불가) ⓒ 현상 유지(새 대화에서만 정상 — 실사용 함정 방치).

**트레이드오프**: OFF 턴에도 모델이 Workflow 스키마를 봄 → 드물게 자발 호출 시도 가능(즉시 deny로 차단되나 턴 낭비 여지 — 시스템 가이드에 사용 조건 서술로 완화) / 컴포저 미러 오버레이 복잡도(스크롤·IME 동기화) / 네온 예외 확장은 안티슬롭 원칙의 의도적 waiver.

**완료조건(측정가능)**: ① 새 대화가 아닌 진행 중 대화에서 UltraCode ON(토글 또는 키워드) → Workflow 호출 → perm-card → 결과 복귀가 라이브 e2e로 실증. ② 키워드 턴 트리거 단위 테스트(대소문자·부분단어 오탐 경계 포함). ③ OFF 턴의 Workflow 자발 호출 → 즉시 deny(G4) 회귀 유지. ④ 컴포저 하이라이트 육안 승인(버킷 b — 영호). ⑤ typecheck·test·lint green + reviewer(backend-contract·ui-visual 깃발) CRITICAL 0.

**위험도**: [M] — 상호작용 의미론 변경 + 권한 게이트 경로 변경(trust-boundary 인접). IPC 계약 필드는 기존 `orchestration` boolean 재사용으로 스키마 변경 0 목표.

**현황(2026-07-04)**: 구현 완료 — UC1 P01~P10 커밋 + 완료조건 ①~⑥ 전부 실증(라이브 e2e Test3 mid-session perm-card·Test4 비승격+deny 라인 PASS). 상세 = 01.Phases/UC1-ultracode-redesign/UC1-DONE.md

---

**개정 v2 (2026-07-03, 영호 확정 — P01~P04 구현 후 UX 재검토)**: §2 키워드 *턴 승격*을 **폐지**하고 권한 진실원을 토글 하나로 단일화한다.

- **문제(개정 동기)**: §2의 키워드 OR 결합은 "보이지 않는 승격" — 전송 순간 조용히 `orchestration=true`가 되어 화면에 보이는 토글 상태와 실제 전송 값이 어긋난다. 사용자가 키워드를 지나가듯 언급만 해도(예: 기능 질문) 그 턴이 오케스트레이션으로 나가 혼란 유발.
- **개정 결정**:
  1. **권한 진실원 = 토글 단일** — 전송되는 `orchestration` = 토글 상태 그대로. 키워드는 권한을 승격하지 않는다(감지 함수는 하이라이트·힌트 용도로 존속).
  2. **토글 기본값 ON** — 첫 실행부터 Workflow 경로가 열려 있고, 실제 사용 시 perm-card(G1/G2)가 **명시적 프로그램 레벨 체크 1회**로 작동. OFF는 사용자의 명시적 차단 의사 = G4 즉시 deny, **키워드로도 우회 불가**.
  3. **키워드 가시성 재정의** — ON 턴: 보라 그라데이션(§3 메커니즘 유지 — "오케스트레이션 요청으로 전달됨" 신호). OFF 턴: 뮤트 스타일 + "UltraCode 꺼짐 — 토글로 켜세요" 유도 힌트(명시적 사용 유도).
  4. **G4 deny 가시화** — OFF 턴에 모델이 Workflow를 시도해 차단되면 엔진중립 이벤트(additive, 예: `orchestration_denied`)로 대화창에 시스템 라인 표시("UltraCode가 꺼져 있어 Workflow가 차단됨"). 사용자가 영문 모를 일 없게. IPC 계약은 이벤트 유니온 **additive 확장만**(기존 필드 변경 0).
- **§4 백엔드 축 불변** — Workflow 상시 노출 + canUseTool 턴별 라이브 게이트(P02·P03)는 토글 단일 진실원에서도 그대로 필요(토글이 턴마다 바뀔 수 있음). 시스템 가이드 문안만 "토글 ON 턴에만" 기준으로 정합.
- **트레이드오프**: 기본 ON = 모든 사용자가 모델의 Workflow 시도에 노출(perm-card가 게이트하므로 안전하나 카드 노출 빈도↑) vs 기본 OFF의 보수성 포기 / 키워드 자동 승격의 편의 포기 — **예측 가능성(보이는 것 = 전송되는 것) 우선**.
- **완료조건 갱신**: ①은 "토글 ON" 기준으로 유지 / ②' 키워드 비승격 회귀(OFF+키워드 → deny) 단위 테스트 / ⑥(신설) G4 deny 시 시스템 라인 표시 실증. 나머지 ③④⑤ 유지.
- **구현**: UC1 P07~P10 (P07 토글 단일화·기본 ON / P08 denied 이벤트 계약 / P09 방출 / P10 표시), P06 마감은 그 뒤로.

---

