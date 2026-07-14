---
owner: 영호
milestone: GAP1
title: 코어 패리티 — Claude Code CLI 대비 코어 작업 루프 동등 (배포 게이트)
status: pending
grade: 대규모 (마일스톤 전체 — phase별 상이, frontmatter 참조)
created: 2026-07-13
---

# GAP1 — 코어 패리티 마일스톤 계획

> **배경**: BL1(백로그 마감) 종결 후, M5 배포 전 마지막 게이트. GAP1 감사(2026-07-13, Ultracode 4단계 워크플로·Opus 17에이전트, 확정 격차 48건)가 드러낸 격차 중 **코어 작업 루프에 직결되는 항목만** 선별해 닫는다. 근거 정본 = `00.Documents/reports/GAP1-Claude-Code-기능격차-감사.html`.
>
> **검증 상태**: plan-auditor GO(🔴 0 · 🟡 5 봉합 완료 2026-07-13) — P05·P06·P07 risk backend-contract·ui-visual 이중화 + reviewer 무조건 / P03↔P09 셸-tail 타입 결합 완화(additive 탈출구) / FEATURE_MAP 로드맵 추적성 / P09 P02 soft 의존 + CORE-01 명시.
>
> **검증 상태 (2)**: Codex 교차 리뷰(gpt 계열, 2026-07-13) NO-GO P1 4·P2 9·P3 1 → **13건 전부 봉합 반영**(probe-first 계약·TaskStop 재분류·tail 스트림 재설계·dogfood 인수 시나리오·P01→P02 직렬·P09 hard 의존·모델 setModel semantics).

## 🎯 목표

**"AgentDeck 안에서 AgentDeck 개발이 가능"** — Claude Code CLI로 하던 일상 코딩 드라이버 루프를 GUI 안에서 CLI 대비 손실 없이 성립시킨다. 영호 결정(2026-07-13): 이 게이트를 통과한 뒤 M5 배포로 간다.

### 배포 게이트 기준 (정량)
- **15 Phase** 전부 `status: done` + 각 Phase 완료 조건(typecheck 0 · Vitest 전체 green · lint 0 + TDD) 충족. (P10 turn-id·P11·P12 편입 + P13~P15 확장 — 영호 2026-07-14. 배포 게이트 강화 = **"AgentDeck으로 AgentDeck 개발 가능한 성능·안정성·UX"**)
- 코어 루프 3축 복구: (1) SDK 신호 배선(훅 콕핏·턴 신뢰성·라이브 사고) · (2) IDE급 도구 렌더(Read/Grep/Glob·백그라운드 셸 테일·plan 승인) · (3) 신형 도구 인지·모델 영속.
- 감사가 "GUI가 일상 드라이버가 못 되는 결정적 이유"로 지목한 앵커(T-01 백그라운드 셸 라이브 테일)가 GUI 안에서 성립.

## 🐕 마일스톤 인수(dogfood) 시나리오

> 15 Phase 완료 후 마감 게이트에서 **1회 통주(通走)** — 담당 qa + 영호 육안.

dev 서버 백그라운드 시작 → 증분 로그 라이브 관찰 → 검색 결과 클릭으로 파일 열기 → plan 모드 계획 검토·승인 → 파일 수정 승인 → 모델 변경 후 같은 세션 후속 턴.
확장분(영호 2026-07-14): ⑦ 진행 중 세션 plan 전환→ExitPlanMode 성립(P13) ⑧ SubAgent 스플릿 뷰 라이브(P14).

## 🧭 범위 절단 결정 (영호 2026-07-13)

- **"두껍게" 옵션 채택** — 감사 합성이 권장한 7 Phase에 **plan 승인 UI(P07)** 와 **Grep/Glob 클릭 점프(P08)** 를 더해 **총 9 Phase**로 확정.
- ⚠️ **plan-auditor 주의 신호 명시**: 8+ Phase 마일스톤은 통상 분해 과다(재분할 대상) 신호일 수 있으나, 본 9 Phase는 **사용자(영호) 명시 결정**이다. 재분할 권고가 아니라 사용자 우선순위 반영임을 이 문서에 기록한다.
- 감사의 3 마일스톤 후보(M-A/M-B/M-C) 중 **M-A의 코어 루프 스트랜드 + M-B의 렌더 스트랜드**만 이번에 선별. M-C(제어·안전 표면 — fs.write·권한 영속·MCP 등록·rewind·worktree·fork)는 read-only 아키텍처 정면 변경(trust-boundary·ADR 다수)이라 **전량 배포 후로 이연**.
- **P10 turn-id 상관자 편입** — 영호 편입 결정 2026-07-14 — P04 잔여 완전 역전(새 턴 running 후 이전 턴 늦은 idle) 결정론 기각, reviewer 분리 정당 판정. P04 직후·P05 전 claude-stream 직렬 실행 → **총 10 Phase**. (초기 9 Phase 두껍게 결정 이후 백로그에서 마일스톤으로 편입 — 위 9 Phase 산식은 편입 이전 기록)
- Codex 교차 검증(영호 지시 2턴 조사)이 P10 부재 증명을 반증(자율 턴 조합), qa 실측 5/5 수용 — P11(근본 봉합)·P12(triage High 고아 pump) 편입, 총 12 Phase (2026-07-14)
- **P13~P15 확장 편입 (영호 2026-07-14)** — dogfood 결함 A 봉합(P13 진행 중 모드 전환) + SubAgent 스플릿 뷰 스펙 확정(P14) + Playwright 라이브 버그 헌팅 루프(P15, 실환경 배포 게이트) — **총 15 Phase**. 배포 게이트 강화 = "AgentDeck으로 AgentDeck 개발 가능한 성능·안정성·UX".

## 📊 Phase 표 (의존성 순)

| Phase | 제목 | 등급 | risk | loop_track | domain | 감사 격차 ID | 의존 |
|---|---|---|---|---|---|---|---|
| 01 | quick win 렌더 재사용 3건 | 보통 | ui-visual | human-visual | renderer | T-02·T-08·quick-win 5 | — (독립) |
| 02 | toolKind MAP·TaskStop 재분류·모델 영속 | 복잡 | backend-contract | auto-gate | cross | T-09·permission·I-03 | P01 (toolKind hotspot) |
| 03 | AgentEvent 계약 일괄 정의 + taxonomy ADR 초안 | 복잡 | backend-contract | human-gate | shared-ipc | (후속 계약 정본) | — |
| 04 | 턴 신뢰성 신호 배선 | 복잡 | backend-contract | auto-gate | cross | S-05·S-02·S-01·S-13 | **P03** |
| 10 | turn-id 상관자 — **종결: misfire 부재 실측·봉쇄 회귀 잠금**(turnId 철회, 부재 중 결정 ③′ 2026-07-14) | 복잡 (보통 + backend-contract) | backend-contract | auto-gate | cross | P04 잔여(완전 역전) | **P04** (직후·P05 전 직렬) |
| 05 | 훅 콕핏 (생명주기·차단사유·auto-deny) | 복잡 | ui-visual | human-visual | cross | S-04·S-03·S-07 | **P03** |
| 06 | 확장 사고 전문 표시 | 복잡 | ui-visual | human-visual | cross | I-01·S-09·S-19 | **P03** |
| 07 | Plan 모드 승인 UI | 복잡 | ui-visual | human-visual | cross | T-07·S-06·I-02 | **P03** |
| 11 | send-token 턴 귀속 회계 (Codex 반증 편입) | 복잡 (보통+backend-contract) | backend-contract | auto-gate | cross | P07·qa repro 실증 | P07 직후·P12/P08/P09 전 |
| 12 | RunManager 고아 pump 종결 (Codex triage High) | 복잡 (보통+backend-contract) | backend-contract | auto-gate | cross | P11 | P11 직후·P09 전 |
| 08 | Grep/Glob 결과 IDE 렌더 | 복잡 (보통 + backend-contract) | ui-visual·backend-contract | human-visual | cross | T-03 | P03·P01(soft) |
| 09 | 백그라운드 셸 라이브 테일 | 대규모 | backend-contract·ui-visual | human-visual | cross | T-01 | **P03·P02·P04** |
| 13 | REPL 진행 중 세션 권한 모드 전환 실지원(모드 피커 no-op 봉합) | 대규모 | backend-contract·trust-boundary·ui-visual | auto-gate(계약 사전 박제 2026-07-14) | cross | dogfood 결함 A(2026-07-14) | **P07·P11/P12** + 결함 B 봉합(3c1d104) |
| 14 | SubAgent 스플릿 뷰 — 단일채팅모드 우측 분할 그리드 | 대규모 | ui-visual·backend-contract(조건부) | human-visual | renderer | 영호 스펙(2026-07-14) | **P13** (renderer 직렬) |
| 15 | Playwright 라이브 버그 헌팅 루프(라운드제 — 배포 게이트) | 대규모 | ui-visual·backend-contract(봉합 조건부) | human-visual | cross | 영호 결정(2026-07-14) 실환경 게이트 | **P13·P14** (최후순) |

## 🔗 의존성 그래프

```
P01 ──▶ P02                  # 둘 다 toolKind.ts 편집 = merge hotspot → 직렬
P01 ──(soft)──▶ P08          # CodeViewer 재사용 패턴 확립 후 Grep/Glob 렌더 권장
P03 ──▶ P04 ──▶ P09          # P04 persistent-run liveness를 P09 background task가 공유(hard)
P03 ──▶ P05
P03 ──▶ P06
P03 ──▶ P07
P03 ──▶ P08                  # search_result 엔진 중립 계약 정의
P03 ──▶ P09                  # 신규 AgentEvent·tail 스트림·정지 이벤트 소비
P02 ──▶ P09                  # TaskStop/KillShell 명칭 정본 공유(hard)
P04 ──▶ P10 ─┐               # P10 = 2026-07-14 편입, P04 직후·P05 전
P05 ─────────┼─(직렬 권장)   # 넷 다 claude-stream.ts를 편집 → 파일 충돌 방지 위해 직렬
P06 ─────────┘
P07·P12 ──▶ P13 ──▶ P14 ──▶ P15   # 2026-07-14 확장 직렬 레인 — P13 모드 전환[cross] → P14 스플릿 뷰[renderer 대규모] → P15 헌팅 루프[qa 주도 라운드제, 최후순]
```

- **P01·P03 = 선행 없는 착수 지점**(P02는 P01 뒤). P01·P02는 둘 다 `toolKind.ts`를 편집(merge hotspot)이라 **P01 → P02 직렬**. P03은 후속 6 Phase(P04~P09)의 계약 선행이므로 **가장 먼저 확정**돼야 하며, probe-first + taxonomy 설계 분기 + ADR 신설이라 **human-gate(영호 GO)**.
- **P04·P10·P05·P06 claude-stream 직렬(P10은 2026-07-14 편입, P04 직후)**: 넷 다 `claude-stream.ts`의 system/stream 분기를 편집한다. 병렬 강행 시 머지 충돌 + 이중 idle 판정 회귀 위험 → 순차 진행 + 각 단계 통합 게이트.
- **claudeAgentRun/agent-runs 직렬 레인: P11→P12 (2026-07-14 편입, Codex 교차 검증 근거), P08·P09는 그 뒤**: P11·P12 둘 다 `claudeAgentRun.ts`(+P12는 `agent-runs.ts`)의 send/turn 회계·run 수명을 편집하므로 순차 진행. P08·P09는 그 뒤에 배치.
- **P08은 P03 뒤 + P01 뒤 권장(soft)**: P03의 `search_result` 엔진 중립 계약을 소비하고(어댑터 정규화), P01이 확립할 CodeViewer/FileModal 재사용 패턴을 클릭 점프가 재사용한다.
- **P09는 최후순 (hard 의존 3종)**: P03(계약) + **P02(TaskStop/KillShell 명칭 정본)** + **P04(persistent-run liveness — 활성 태스크 존재 시 idle-close 금지 정합)**. 최대 비용(대규모) + claude-stream 배선이 P04~P06과 겹쳐 조율 지점 많음.

### 병렬 가능성 요약
- 착수 시점: {P01, P03} 병렬 가능(P02는 P01 뒤 = toolKind hotspot, P03은 human-gate 대기가 병목).
- P03 GO 후: P04→P05→P06 직렬 레인 + P08(P03·P01 뒤) 별도 레인 병행 가능.
- P07은 P03 뒤, P09는 P03·P02·P04 뒤 최후 배치.

## 🚫 비범위 · 배포 후 이연 (GAP1 밖)

> 감사 확정 48건 중 이번 9 Phase에 **선별되지 않은** 항목. plan 모드 밖 자율 진행 대상 아님 — 배포 후 별도 `/work-plan`.

- **M-A 잔여(sdk-events 저우선)**: commands_changed 팔레트 갱신(S-10) · notification 큐(S-11) · init 페이로드 메타 model·mcp_servers·permissionMode·output_style(S-12) · memory_recall(S-16) · queue-operation 우선순위/취소(S-17) · 저신호 스트림 일괄 억제(S-18 — refusal·tool_use_summary·local_command_output·prompt_suggestion·auth_status) · mirror_error 경고 배너(S-15) · tool_progress 경과시간(S-08).
- **M-B 잔여(tools-rendering 저우선)**: 이미지/PDF 인라인 뷰어(T-04) · MCP 서버 그룹핑·리소스/프롬프트 표면(T-05, quick-win verb 라벨은 P01에 선반영) · WebFetch 마크다운·WebSearch 링크 렌더(T-06).
- **M-C 전체(제어·안전 — 배포 후)**: settings.json 조회/편집(C-03) · 영속 권한 규칙 편집(C-02) · MCP 등록/편집/삭제 UI(C-01) · Checkpoint/Rewind(M-01·S-14) · Worktree 격리(M-05) · Fork/Branch 세션(M-03) · .claude/hooks·agents 관리(C-04·C-05·I-04) · Plugins/marketplaces(C-06) · Sandboxed Bash(C-07) · MCP resources/prompts(C-08) · env 설정 UI(C-09) · 세션 태그(M-06) · 트랜스크립트 export/import(M-02) · 커스텀 시스템 프롬프트·output styles(I-05). read-only 아키텍처 정면 변경 = trust-boundary·ADR 다수 → 전량 배포 후.
- **기존 백로그 귀속(신규 X)**: 세션 트랜스크립트 접근/export = 'SDK 트랜스크립트' 백로그 · 엔진 버전 picker = ADR-018/M5 배포 · TaskStop/Monitor 등 태스크 제어 = '백그라운드 태스크 수명 정책' 백로그(P09 tail과 조율 지점 있음).

## ⚠️ 마일스톤 공통 주의

- **P03 계약 bump = CORE-04** — 신규 AgentEvent 타입 추가 후 main·renderer 양쪽 typecheck green 필수. taxonomy 설계 분기 + ADR 신설은 human-gate(영호 GO 후 확정). Codex 어댑터(stub)에 영향 없는 **additive 설계** 유지.
- **P04~P06 claude-stream 직렬** — 기존 idle 휴리스틱(lr4-p01·loopStatus·BL1 P03 staleWatchdog)과 정합 필수. 권위 신호 승격 시 기존 lr4 계열 테스트 회귀 0.
- **P02 영속 스키마** — chats/*.json에 optional 필드 추가만 허용. shape 변경(마이그레이션)이 필요해지면 즉시 정지 + 영호 게이트(work-judge 버킷 c). MUTATING 세트 교정은 보안 부수효과라 reviewer 무조건.
- **ui-visual Phase(P01·P05·P06·P07·P08·P09)** — 기능은 자율 진행하되 무인 commit X, 영호 육안 병행. UI 롤아웃 시 노출 지점 전수 열거(과거 배지 3번째 지점 누락 교훈, memory: ui-rollout-surface-enumeration).
- **TDD 공통** — 모든 Phase 실패 테스트 선행(CORE-05, tdd-guard 강제).

## 📚 마일스톤 학습 테마

- SDK 메시지 → 공통 이벤트 정규화 taxonomy 설계(P03) · 권위 신호 vs 휴리스틱 추론(P04) · 하네스 콕핏 투명성 = 이 앱의 정체성(P05) · 확장 사고 추적의 학습 가치(P06) · plan-approval 워크플로우(P07) · 기존 인프라 재사용(P01·P08 CodeViewer) · 백그라운드 프로세스 라이프사이클·증분 tail 모델(P09).
