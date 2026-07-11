# CP1 — 멀티패널 cwd 정합 + 서브에이전트 영속 + 백로그 스윕

> 영호 선택 2026-07-04, PR #17 종결 직후. 버킷 c 설계 2건(멀티패널 cwd ↔ 전역 워크스페이스 정합 / 서브에이전트 영속·카드 복원) + 백로그 소형 일괄을 한 마일스톤으로 묶는다.

| Phase | 제목 | 도메인 | 등급 | 깃발 |
|---|---|---|---|---|
| 01 | command.list·skill.list root 파라미터 계약 (additive) | shared-ipc | 보통 | shared-contract, trust-boundary |
| 02 | 핸들러 root 수용·재검증 + 전역 폴백 | main-process | 보통 | trust-boundary |
| 03 | 패널 cwd send·팔레트 배선 | renderer | 보통 | 없음 |
| 04 | 서브에이전트 영속 스키마 설계 (영호 GO) | shared-ipc | 보통 | shared-contract |
| 05 | 서브에이전트 영속 구현 | cross | 복잡 | shared-contract |
| 06 | renderer 소형 백로그 6건 스윕 | renderer | 보통 | 없음 |
| 07 | 어댑터 소형 백로그 3건 스윕 | agent-backend | 보통 | shared-contract |

## 의존성 · 웨이브

- **의존성**: 01→02→03 (계약→핸들러→배선) / 04→05 (설계 GO→구현) / 06·07 독립.
- **웨이브 1 (병렬 — 도메인 상이)**: 01(shared-ipc) · 04(shared-ipc 설계) · 06(renderer) · 07(agent-backend) 동시 착수 가능.
- **웨이브 2**: 02 (01 완료 후).
- **웨이브 3**: 03 (02 완료 후) · 05 (04 영호 GO 후).

## 사전 스카우트 실측 (2026-07-04, 분해 근거 — plan-before-scout 준수)

- **패널 cwd 배선 갭**: 패널 cwd는 `shared/ipc/multi.ts:146-161` `PersistedPanel.cwd`로 영속되나, run 전달은 `PanelView.tsx:265-267`이 전역 `workspaceRoot`를 사용(panel.cwd는 라벨 표시뿐) — 배선 갭이 CP1 cwd 정합의 핵심.
- **command.list/skill.list 전역 고정**: `main/00_ipc/handlers/settings.ts:52·108`이 전역 `getCurrentWorkspaceRoot()`로 고정. 단 스토어 함수(`skills.ts:297`·`commands.ts:358`)는 이미 root 인자를 수용 — **핸들러 파라미터 additive만으로 패널별 반영 가능(신규 스캐너 불요)**.
- **전역 root 소유**: `main/00_ipc/context.ts:39-43` `ipcState.currentWorkspaceRoot`, `handlers/workspace.ts:78-79`에서 재검증 후 갱신.
- **대화 영속 누락 지점**: `ConversationMessage {role,content}`(`agent.ts:46-50`), 저장 필터 `conversationPayload.ts:39-42`가 `kind==='msg'`만 통과 — 서브에이전트/도구 이력이 여기서 누락. 레코드 버전 필드 없음(`index.json`만 `version:1`).
- **Esc 우회**: `Shell.tsx:244-253` `onEscape`가 `decideStopAction`을 우회하고 `abortRun()`을 직접 호출 — 정지 버튼과 판정 불일치.

## plan-auditor 감사 봉합 (2026-07-04)

- **🔴 1 (P04/P05 멀티패널 스키마 비대칭)** → **옵션 B 채택(Supervisor 결정)**: CP1의 서브에이전트 영속은 **단일챗(`ConversationRecord`)만** 대상. **멀티패널(`PanelThreadSnapshot`) 영속은 후속 마일스톤으로 명시 이관**. P04 설계 대상 한정·P05 복원 범위(단일챗 `loadConversation`만) 반영.
- **🟡 6 (P05 backend-contract 오탑재)** → 어댑터 무수정 확인. P05 frontmatter risk에서 `backend-contract` 제거(shared-contract만), Phase 표 05 깃발 갱신.
- **🟡 (P02 root 소비처 누락)** → command.list root 소비처가 스토어 함수 + `getBackend().listSupportedCommands` **2곳**임을 P02 작업에 명시(한쪽만 배선 시 패널-root/전역-root 혼합 반환).
- **🟡 (P02 roots 레지스트리 판정 미결)** → 스캔은 `.claude/skills|commands` 하위 한정 직접 읽기로 기존 전역 root와 동일 신뢰 수준 — 레지스트리 멤버십 불요를 P02 AC로 명문화(불변식 테스트 동반).
- **🟡 (P06 Esc 거동 변화 관찰성)** → P06 loop_track을 human-visual로 상향, Esc 항목을 영호 육안 확인 항목으로 명시(NG 시 키바인딩 1점 원복).

## 브랜치 전략

- master에서 `feature/cp1-cwd-persist-sweep` 분기 (plan-auditor 감사 후 영호 GO).
- 웨이브 1은 도메인이 상이하여 병렬 착수 가능하나, 04→05 사이의 영호 GO(버킷 c — JSON 영속 스키마)가 웨이브 3의 하드 게이트.
