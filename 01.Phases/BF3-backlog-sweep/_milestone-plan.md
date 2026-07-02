# BF3-backlog-sweep — 비차단 🟡 백로그 일괄 수리 + 권한 UX 인라인 전환

> 마일스톤 목표: LR2~BF2에 걸쳐 누적된 비차단 🟡 백로그를 한 브랜치에서 **잔여 백로그 최소화** 원칙으로 정리한다(영호 지시 2026-07-03: "최대한 백로그 없이 전부 깔끔하게").
> 소형 수리 6건(테스트 위생 + agent-backend 3 + renderer 2) + UX 개선 1건(권한 모달 → 인라인 카드 + 멀티패널 배선).
> 브랜치: `feature/bf3-backlog-sweep` (master 9c07bfd 기점).

## 영호 결정 사항 (2026-07-03)

| 결정 | 내용 |
|---|---|
| 범위 | 백로그 🟡 전부 + 실측 발견분 흡수 ("최대한 백로그 없이 이번 마일스톤에서 전부") — 배너 연속성 갭 → Phase 07 신설, 멀티패널 권한 미배선 → Phase 06 편입 |
| 권한 UX | **모달 완전 제거** — Claude Desktop처럼 컴포저 바로 위 인라인 카드로 일원화 (영호 확답). 충실도 이탈은 **ADR-030으로 명문화**(초안 `_adr-draft-030-permission-inline.md` — 영호 확정 대기, 확정 전 Phase 06 NO-GO) |
| P04 범위 | **①(인터리빙 배너)만 수리** — ②(WAKEUP_LOOP_ID 싱글턴 슬롯)는 유일한 의도적 제외. 결함 백로그가 아니라 문서화된 설계 제약("같은 세션 안 동시 다중 self-paced 루프 미지원")이고, 세션·패널 간 독립은 이미 성립하므로 희귀 케이스 비용 > 가치 |

## Phase 순서 (7개)

| # | 파일 | 등급 | 도메인 | loop_track | 요약 |
|---|---|---|---|---|---|
| 01 | `01-test-hygiene.md` | 보통 | qa | auto-gate | LT6 드레인 패턴 + bf1 단언 진단력 (테스트만) |
| 02 | `02-interrupt-error-copy.md` | 보통 | agent-backend | auto-gate | tool_use 중 중단 시 "Agent execution error" 노출 순화 |
| 03 | `03-push-race-window.md` | 보통 | agent-backend | auto-gate | idle-close 판정~종료 사이 μs 창 push 유실 봉합 |
| 04 | `04-interleave-banner.md` | 보통 | agent-backend | auto-gate | 인터리빙 턴에서 루프 배너 일시 제거 오판 수리 |
| 05 | `05-multipersist-restore-race.md` | 보통 | renderer | auto-gate | useMultiPersist 복원 폴백 레이스 (실질 버그) |
| 07 | `07-banner-continuity.md` | 보통 | renderer | auto-gate | loops/goal 배너 연속성 — 축출·복원 경계 소실 봉합 (05 후행) |
| 06 | `06-permission-inline-card.md` | 복잡 | cross(renderer+qa) | human-visual | 권한 모달 → 인라인 카드 + 멀티패널 배선 (**ADR-030 게이트**) |

> 실행 순서는 01→…→05→**07**→06 (07이 05의 복원 경계 수리에 후행, 06은 ADR·육안 게이트라 최후미). 파일 번호는 생성 순서라 07이 06보다 먼저 돈다.

## 의존성 / 병렬성

- **02 → 03 순차**: 둘 다 `claudeAgentRun.ts` 펌프 구역 — 충돌 방지 위해 직렬.
- **01 · 05는 완전 독립**: 언제든 병렬 가능 (01=qa, 05=renderer — 02~04의 agent-backend와 안 겹침).
- **04는 02/03과 파일이 다름**(`progressTrackers.ts` 중심)이라 논리적으론 독립이나, 같은 agent-backend Worker 영역이라 순차 배치.
- **07은 04·05 후행**: 04(배너 판정 안정화)·05(복원 경계 수리)와 같은 지대를 다루므로 선행 완료 후.
- **06은 마지막**: 가장 크고 유일한 human-visual(육안 게이트) + ADR-030 확정 게이트 — 앞 6건의 auto-gate 흐름을 끊지 않게 후미 배치.

## 리스크 메모

- 02·03·04 = `02.Source/main/01_agents/**` → **backend-contract 깃발** → reviewer 무조건.
- 03은 LR3-P02가 세운 **불변조건(idle-close 5개) 보존** 필수. `02.Source/main/00_ipc/agent-runs.ts`(🔴 ADR-024 위험구역)는 0줄 원칙.
- 06은 **ui-visual 깃발** → 기능 진행은 하되 무인 커밋 X, 스크린샷 산출 후 영호 육안 게이트.
- 06의 e2e 셀렉터 계약 이관 대상 = e2e 7파일(11곳) + renderer 단위 1파일 — `_permission-ux-notes.md` 참조.

## plan-auditor 판정 (2026-07-03) — 조건부 GO

- **01~05 즉시 GO** (결함 0 — 라인 참조 전수 실측 확인). 주의 3건 반영 완료: ①셀렉터 카운트 7파일 정정 + `.perm-modal` grep 단독 게이트 ②Phase 03 agent-runs.ts 경로 오기 수정 ③Phase 02 git stash 실측 필수 승격.
- **06은 ADR 게이트 해소 전 NO-GO (결함-1)**: 원본 AgentCodeGUI는 권한을 중앙 모달로 렌더(`C:/Dev/AgentCodeGUI/.../Chat.tsx:1268` 실측) — 모달 완전 제거는 Track-1 충실도(ADR-013/014) 이탈이라 **영호가 ADR로 예외를 명문화한 뒤 착수**(옵션 A 권고 — 영호 결정 유지 + 정식 근거 부여 / 옵션 B = 모달 유지·■ 가림만 봉합, 인라인은 Track 2로 defer). 06이 후미라 01~05 진행과 병행 해소 가능.

## 세션 독립성 실측 (2026-07-03 영호 제기 — Explore 검증)

"loop/goal 배너는 세션별 독립이어야 한다(멀티패널 포함)" 요구는 **현행이 이미 충족** — 신규 Phase 불필요:
- 멀티패널: 패널 로컬 상태 + runId 필터로 완전 격리 (`panelSession.ts:37-40,278-291` / `PanelView.tsx:148-152,397-400` — 배너 패널별 렌더).
- 단일챗: 대화 전환 시 bgRuns 스냅샷 교체 + 디스크 로드 시 명시 리셋 — 타 대화 오표시 경로 없음 (`sessions.ts:171-208,252-255`).
- main: CronTracker가 run(세션)별 인스턴스 — 전역 싱글턴 아님 (`eventNormalizer.ts:94-99`).
- **잔여 갭(오염 아닌 소실 방향)**: loops/goal 상태 비영속 — bgRuns 축출(cap 8)·패널 슬롯 축출(cap 32)·디스크 복원 시 진행 중 배너가 **복구 안 됨**(main 크론은 살아있을 수 있음). → **Phase 07로 편입**(영호 "백로그 없이" 지시). 단 앱 재시작 케이스는 루프 자체가 죽으므로 미복원이 정답 — Phase 07 불변조건.

## 마일스톤 완료 기준

- **7 Phase** 전부 done + 각 Phase 커밋 + 전체 회귀(typecheck 0 · test green · lint 0).
- ADR-030 영호 확정(06 착수 전) + 06 스크린샷 영호 육안 승인.
- PR 생성은 사람 게이트(ask) — 무인 push/PR 금지.

## plan-auditor 재검수 (2026-07-03 델타) — GO

- **01~05·07 실행 GO** (결함 0 — Phase 07 전축 통과, "앱 재시작 시 루프 사망" 전제 코드-실측 확인: persistentRuns는 main in-memory Map, 재시작 생존 경로 없음).
- **06 게이트 NO-GO 유지 (정상)** — ADR-030 초안은 결함-1 요구 4개 전부 충족·사실 오류 0. 영호 확정 시 GO 전환.
- 🟡 6건 반영 완료: A(라우팅 단언)·B(키보드 가드 테스트)·C(7 Phase 카운트)·D(분할 여지)·E(ⓒ=버킷c 명시)·F(pendingPermission 저장 위치 정밀화).
