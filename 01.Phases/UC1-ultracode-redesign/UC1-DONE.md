---
owner: 영호
milestone: UC1
work-id: uc1-ultracode-redesign
title: UC1-ultracode-redesign 마일스톤 종합 보고
date: 2026-07-04
status: done
grade: 복잡
---

# UC1-ultracode-redesign — 마일스톤 종합 -DONE (5단계 보고)

> 브랜치 `feature/uc1-ultracode` (master 기점 751040d). Phase 10/10 + P06 마감 완료.
> 최종 게이트: **vitest 4091 PASS · typecheck 0 · lint 0 · build green · 라이브 e2e Test1~4 PASS · 개별 Phase reviewer 전 🟢 · 통합 reviewer 🔴 0 / 🟡 2(해소)**.

## 🎯 무엇을 만들었나 (목표)

ADR-032(v1 + 개정 v2)의 **UltraCode 상호작용 재설계**를 구현했다. UltraCode(오케스트레이션 opt-in)를 단발성(one-shot)에서 **지속 토글**로 바꾸고, held-open(지속) 세션의 후속 턴에서도 orchestration 권한이 라이브로 반영되도록 백엔드를 재배선했다. v2에서는 "보이지 않는 키워드 승격"을 폐지해 **권한 진실원을 토글 하나로 단일화**하고, 토글 OFF 상태에서 모델이 Workflow를 시도하면 대화창에 deny 시스템 라인으로 가시화한다.

## 🤔 왜 필요한가 (배경·결정)

- **근본 문제(라이브 e2e 일괄 실증)**: SDK(`@anthropic-ai/claude-agent-sdk@0.3.186`) held-open 세션은 도구 목록을 세션 중간에 바꾸는 공식 수단이 없다(Query 런타임 = interrupt/setPermissionMode/setModel 등 — setTools 류 부재, 로컬 타입 실물 검증). 세션 고정 `disallowedTools` + 단발성 UltraCode 의미론이 구조적으로 불일치 → **진행 중 대화에서 UltraCode ON이 그 세션에 영영 무력**(시퀀스 실패로 재현·실증).
- **v1 결정(A안)**: `Workflow`를 `disallowedTools`에서 제거(상시 노출)하고 `canUseTool`이 **턴별 orchestration 상태를 동적 평가**(허용 턴 = perm-card G1/G2, 비허용 턴 = G4 즉시 deny). 기각: 토글 변경 시 세션 재생성+resume(churn·resume 경계 리스크) / `applyFlagSettings`(미문서화 불확실) / 현상 유지(새 대화에서만 정상 = 함정 방치).
- **v2 개정(P01~P04 구현 후 UX 재검토)**: §2 키워드 OR 결합("전송 순간 조용히 orchestration=true → 화면 토글과 어긋남")을 폐지. 전송 orchestration = 토글 그대로, 키워드 감지 함수는 **하이라이트·힌트 용도로만 존속**(권한 비승격). 토글 기본 ON, OFF = 명시적 차단 의사(키워드로도 우회 불가). OFF 턴 Workflow 시도 차단은 `orchestration_denied` additive 이벤트로 시스템 라인 표시 — 사용자가 영문 모를 일 없게. IPC는 이벤트 유니온 **additive 확장만**(기존 필드 변경 0).

## 🛠️ 어떻게 만들었나 (Phase별 커밋)

| # | 내용 | 커밋 | 핵심 |
|---|---|---|---|
| 01 | held-open 후속 턴 orchestration 미반영 양방향 재현 (TDD RED) | `669b843` | main 측 박제 — 후속 턴이 세션 고정 도구목록에 갇혀 orchestration이 반영 안 됨을 실패 테스트로 증명 |
| 02 | Workflow 상시 노출 + canUseTool 턴별 동적 게이트 | `22baabd` | agents — `disallowedTools`에서 Workflow 제거 + 턴별 orchestration 평가(허용=G1/G2, 비허용=G4 deny). ADR-032 A안 |
| 03 | held-open 후속 턴 orchestration 라이브 배선 (P01 RED→GREEN) | `05e2342` | main `agent-runs.ts` ActiveRun — 후속 턴 push 시 턴별 orchestration 라이브 반영. P01 재현 테스트 GREEN 전환 |
| 04 | 지속 토글(one-shot 폐기) + 키워드 턴 트리거 OR 결합 | `6870472` | renderer — `Composer.tsx` one-shot 리셋 제거, 지속 토글화 (+ v1 키워드 OR — v2에서 승격분 폐지) |
| v2 | ADR-032 개정 v2 박제 + P07~P10 신설 | `3280cee` | 키워드 승격 폐지·토글 단일 진실원 결정 박제 (plan-auditor 🔴2 봉합 — 깨질 기존 테스트 열거 보강) |
| 05+07 | 키워드 하이라이트 미러 오버레이 + 토글 단일 진실원 (육안 승인) | `33f43fc` | renderer — 투명 textarea + 미러 backdrop 보라 그라데이션 + 전송 orchestration = 토글 단일화(키워드 비승격) |
| — | 풀스크린 오버레이 createPortal(document.body) 전환 | `2648626` | renderer 부수 — 미러 오버레이를 뷰포트 기준으로 복원 |
| 08 | orchestration_denied 이벤트 계약 additive 신설 | `72bb312` | shared — 엔진중립 이벤트 유니온 additive 확장(기존 필드 0 변경) |
| 09 | G4 즉시 deny 시 orchestration_denied 방출 | `aaffe64` | agents — OFF 턴 Workflow 시도 차단 시 denied 이벤트 emit |
| 10 | orchestration_denied 시스템 라인 표시 | `1121d43` | renderer — 대화창에 "UltraCode 꺼짐 — Workflow 차단" 시스템 라인 |
| 06 | 라이브 실증 + 마일스톤 마감 | `474fd5b`·`f53a530`·(본 커밋) | qa 라이브 e2e Test3/Test4 + renderer 주석 정합 + 문서 마감 |

## 🧪 테스트 결과 (검증)

- **라이브 e2e (qa 실증, `LIVE_SDK=1`)**: orchestration-live Test1~4 전부 PASS.
  - **Test3 mid-session OFF→ON 토글 후 perm-card 등장** — ADR-032 ①' 핵심 증거. 구 세션고정 구조였다면 불가능했을 시나리오(P01 함정을 "고쳐졌음의 증거"로 뒤집음).
  - **Test4 키워드 비승격 + deny 시스템 라인 등장** — v2 ②'+⑥ 실증(토글 OFF + 메시지에 "ultracode" 언급 → orchestration=false 전송 + 모델 Workflow 시도 시 즉시 deny + 시스템 라인).
  - **ultracode-demo PASS** — 프로필 격리 + passBootGates 표준화. (stale 대화이력/닉네임 온보딩 함정 2건은 테스트 하네스 문제로 확인·수정 — 앱 버그 0.)
- **기계 게이트**: typecheck 0 / vitest **4091 pass** / lint 0 / build 0.
- **reviewer**: 개별 Phase reviewer 전 🟢 · plan-auditor 2회 봉합 · **통합 reviewer(751040d..HEAD + 워킹트리)** 🔴 0 / 🟡 2 · 8축 전부 통과(신뢰경계·엔진추상화·IPC 4면 정합·시크릿·TDD·Phase 이음새).
  - 🟡 2건 = `orchestrationKeyword.ts` stale 주석·죽은 export → **renderer Worker가 주석 정합 완료**(커밋 `f53a530`), `detectOrchestrationKeyword`는 정규식 회귀 가드로 존치 결정.
- **완료조건 매핑**: ① mid-session 라이브(Test3) · ②' 비승격 회귀+라이브(Test4) · ③ G4 deny 회귀 · ④ 육안 승인 완료 · ⑤ 게이트 green · ⑥ deny 가시화(계약 골든+표시+라이브) — **전부 충족**.

## ➡️ 다음 스텝 (인계·잔여)

1. **UC1 push · PR 생성** — 사람 게이트(영호 GO 대기). 무인 실행 금지.
2. **영호 수동 2건**(메인 세션이 하네스 봉인에 막혀 대행 불가): ① settings.json 하네스 deny 추가 ② supervisor-guard 상대경로 패턴 패치.
3. **FB1 착수** — 별도 브랜치, 줌 스파이크 선행(영호 피드백 스크린샷 스윕).

## 🎓 이번 마일스톤에서 배운 것

1. **런타임이 못 바꾸는 건 세션 경계로 못 넘긴다** — held-open 세션의 도구목록 고정은 SDK 한계(실측). 단발성 의미론을 "세션 재생성"이 아니라 **canUseTool 턴별 동적 평가**로 흡수 — 권한을 세션이 아니라 *턴*에 붙였다.
2. **보이는 것 = 전송되는 것** — v1 키워드 OR 승격은 편의였지만 "전송 값 ≠ 화면 토글"의 예측 불가능성을 낳았다. v2에서 진실원을 토글 하나로 좁혀 예측 가능성을 택했다(편의 포기).
3. **버그 재현 테스트의 재활용** — mid-session 무력을 실증했던 시나리오를 그대로 "고쳐졌음의 증거"(Test3)로 뒤집었다 — RED를 GREEN 증거로 재사용.
4. **차단은 침묵하면 안 된다** — G4 즉시 deny는 안전하지만 사용자에겐 "왜 안 되지?"만 남는다. additive 이벤트 한 줄로 침묵을 가시화 — 계약 변경 없이 UX를 메웠다.
</content>
</invoke>
