---
owner: 영호
milestone: BF3
phase: 06
title: 권한 요청 인라인 카드 전환 — 모달 완전 제거 (Claude Desktop 스타일)
status: pending
grade: 복잡
risk: ui-visual
loop_track: human-visual
estimated: 3~5h
domain: cross
summary: PermissionModal(풀오버레이)을 삭제하고 컴포저 바로 위 인라인 카드로 권한 요청 UX 일원화 — ■ 가림 근본 해소 + 멀티패널 권한 배선 격차 해소, e2e 7파일+renderer 1파일 셀렉터 이관 동반. 착수 전 ADR-030 확정 게이트(영호)
---

# Phase 06: 권한 요청 인라인 카드 전환

> **상태**: pending / **마일스톤**: BF3 / **등급**: 복잡 (ui-visual 깃발) / **담당**: cross (renderer + qa)
> **loop_track: human-visual** — 기능 구현·기계 게이트는 자율 진행하되 **무인 커밋 금지**. 스크린샷 산출 → 영호 육안 승인 후 커밋.

## 🎯 목표

권한 요청이 화면을 덮는 모달이 아니라 **컴포저 바로 위 인라인 카드**로 뜬다(Claude Desktop 방식, 영호 확답 2026-07-03: 모달 완전 제거). 대화 흐름이 가려지지 않고, 권한 대기 중에도 ■(중단) 버튼이 상시 노출·클릭 가능해진다(백로그 "권한 모달 중 ■ 가림"의 근본 해소).

## ⏪ 사전 조건

- [ ] **ADR 게이트 (영호 단독, plan-auditor 결함-1)**: 원본 AgentCodeGUI는 권한을 중앙 모달로 렌더(`Chat.tsx:1268` 실측) — 모달 완전 제거는 Track-1 충실도(ADR-013/014)로부터의 의도적 이탈이라 **착수 전 ADR 신설로 예외를 명문화**해야 한다(옵션 A — 사유: ■ 가림 버그 + 영호 확답 + Track-2 순서 waiver). ADR은 사용자 단독 통제 영역 — 영호가 직접 확정. 미확정 시 본 Phase NO-GO.
- [ ] Phase 01~05·07 완료 (마일스톤 후미 — 유일한 human-visual이라 auto-gate 흐름과 분리. ADR 확정 시간도 자연 확보)
- [ ] `_permission-ux-notes.md` 필독 (사전 조사 — 현행 구조·데이터 흐름·셀렉터 계약 전수)

## 📝 작업 내용

**renderer (본체)**
- [ ] `PermissionCard`(가칭) 신설 — 삽입 위치는 `Conversation.tsx` LoopStatusBanner(~:871)와 Composer(~:878) 사이의 기존 "컴포저 위 배너 슬롯". LoopStatusBanner의 "none이면 null" 한 자리 패턴 준용.
- [ ] 데이터 흐름 **무변경**: `pendingPermission` 슬롯 + `respondPermission(behavior)` 그대로 재사용 — 프레젠테이션만 교체. IPC·shared 계약 0줄.
- [ ] 기능 등가 보존: 허용/항상 허용/거부 3버튼(`PERM_CHOICES`) + 숫자키 1·2·3 + Esc=거부. 단 키보드 리스너는 카드 표시 중에만 활성(전역 window keydown 잔존 주의).
- [ ] `PermissionModal.tsx`·`PermissionModal.css` 삭제. `.q-overlay` 등 공유 클래스는 QuestionModal이 계속 쓰므로 **공유 CSS는 보존** — PermissionModal 고유 분만 제거.
- [ ] WorkingIndicator 공존 정책 결정 반영: 현재 렌더 조건은 `isRunning && !pendingQuestion && …`(pendingPermission 미포함, ~:830) — 오버레이가 사라지면 카드와 WorkingIndicator가 세로 공존. **권한 대기 중엔 WorkingIndicator 억제(pendingQuestion과 동일 취급)를 기본안**으로 구현, 육안 검토 포인트로 표기.
- [ ] 디자인: UI.md 토큰만(인라인 색 리터럴 금지) · radius 11px · 안티슬롭 준수. 카드는 경고성 표면(`--warn`/`--accent` 계열 틴트)으로 눈에 띄되 네온/글로우 금지.

**멀티패널 배선 (2026-07-03 영호 지시 "백로그 없이" — 범위 편입)**
- [ ] 현행 격차: 패널별 `pendingPermission`은 `PanelSessionState`(AppState 상속)에 격리 저장되고 **공유 reducer**가 처리한다(panelSession.ts 로컬 핸들러 아님 — 헛찾지 말 것, plan-auditor 🟡-F). 그러나 `PanelView`/`PanelComposer`는 권한 UI **미배선** — 멀티패널에서 권한 요청이 오면 응답 수단이 없어 run이 대기에 갇힘. 인라인 카드를 `PanelView`(패널 컴포저 위)에도 렌더해 해소.
- [ ] 응답 경로: 패널의 `session.state.pendingPermission` + 자기 runId로 `window.api.permissionRespond` 호출 + 패널 로컬 슬롯 정리(`panelSession.ts`의 CLEAR_LOOPS 류 패널 로컬 액션 패턴 준용). 단일챗과 컴포넌트 공유(1 컴포넌트 2 마운트 지점) — 로직 중복 금지.
- [ ] 키보드(숫자 1·2·3)는 멀티패널에서 포커스 패널에만 — 전역 리스너면 패널 2개 동시 권한 대기 시 오발동, 카드 로컬 핸들링으로.

**qa (셀렉터 계약 이관 — e2e 7파일(11곳) + renderer 1파일)**
- [ ] e2e 7파일: `a3-interleave`(:53) · `bf2-interrupt-probe2`(:50 상수+:342) · `live-test-project`(:39) · `lr3-p04-wakeup-banner`(:42,47) · `m5-token-streaming`(:110,331) · `orchestration-live`(:140-141 강한 단언) · `visual-viewer`(:293 오버레이 부재 단언 — 인라인 카드가 이 단언에 안 걸리는지 확인). (plan-auditor 주의-1 — 카운트 실측 정정)
- [ ] renderer 단위 1: `m4-4-permission-conversation.test.tsx`(:96-98).
- [ ] 새 셀렉터 계약(예: `.perm-card`)을 상수로 통일 — 문자열 산재 재발 방지.
- [ ] bf2-probe2 S2' 시나리오 재실행: 권한 카드 표시 중 ■ 클릭 → 정지 정상 + **이제 가림 없이 직접 클릭 가능**함을 단언 승격.

**문서**
- [ ] `00.Documents/UI.md` 갱신: §2 모달 목록에서 PermissionModal 제거 + §3 컴포저 위 배너 슬롯(LoopStatusBanner·PermissionCard) 기재.

**범위 밖(기록만, 수리 금지)**
- `pendingPermission` 단일 슬롯(한 세션 안 동시 다중 요청 시 마지막만 표시)은 기존 한계 유지 — coordinator `_waiters`는 다중 대기 가능하므로 데이터 유실은 아니고 표시 순서 문제. 패널별 슬롯은 격리돼 있어 멀티패널 배선(위)과는 별개.

## ✅ 완료 조건

- [ ] `npm run typecheck` 0 / `npm run test` green / `npm run lint` 0
- [ ] 이관된 e2e 7파일 + renderer 단위 1파일 전부 PASS. 기계 게이트는 **`.perm-modal` grep 잔존 0 단독**(권한 고유 셀렉터라 정확) — `.q-overlay`는 QuestionModal과 문자열 공유라 grep 불가, 육안 대조로 대체(QuestionModal 쪽 잔존은 정당) (plan-auditor 주의-1)
- [ ] 권한 대기 중 ■ 버튼 클릭 가능 e2e 단언 PASS (S2' 승격)
- [ ] 멀티패널 권한 응답 renderer 단위 테스트 신규 PASS — ① 패널 A 권한 대기 중 패널 B 무영향 ② 응답 후 슬롯 정리 ③ **패널 A의 응답이 A의 requestId/runId로 정확히 전달**(오배선 방지 라우팅 단언 — plan-auditor 🟡-A)
- [ ] 키보드 가드 단위 테스트 신규 PASS — 컴포저 타이핑 중 숫자키 오발동 없음 + 패널 2개 동시 권한 대기 시 포커스 패널만 반응 (plan-auditor 🟡-B — 스크린샷으로 안 잡히는 기능 결함)
- [ ] 라이트/다크 양 테마 스크린샷 산출 (`ScreenShot/` — 단일챗 + 멀티패널) → **영호 육안 승인 후 커밋** (무인 커밋 금지)

## 📚 학습 포인트

- **모달 vs 인라인의 UX 트레이드오프**: 모달은 강제 집중(놓칠 수 없음)이지만 컨텍스트 차단+다른 조작 봉쇄, 인라인은 흐름 보존이지만 놓칠 수 있음 — 권한 요청은 "대기 중에도 대화를 보고 중단할 수 있어야" 하므로 인라인이 맞는 케이스.
- **e2e 셀렉터 = 계약**: 테스트가 CSS 클래스에 결합하는 순간 그 클래스는 내부 구현이 아니라 외부 계약이 된다. 이관 비용이 이번에 체감될 것.

## ⚠️ 함정

- `.q-overlay`/`.q-opts` 등은 QuestionModal과 **공유 클래스** — 지울 때 QuestionModal 회귀 필수 확인.
- 전역 keydown 리스너(숫자 1·2·3)가 카드 미표시 상태나 컴포저 타이핑 중에 오발동하지 않게 — 입력 포커스 가드.
- WorkingIndicator 억제를 바꾸면 원본(AgentCodeGUI App.tsx L820 미러) 대비 의도적 차이가 생김 — UI.md에 차이 사유 기록(충실도 트랙 관례).
- visual-viewer.e2e.ts:293은 "오버레이 부재" 단언 — 인라인 카드가 오버레이가 아니므로 통과해야 정상이나, 셀렉터 목록에 `.perm-modal`이 있으면 목록 자체 정리 필요.

## 담당 SubAgent

coordinator + renderer Worker(본체) + qa Worker(셀렉터 이관). reviewer 무조건(복잡 + 위험 깃발). 스크린샷 산출은 메인 세션(claude-in-chrome/Playwright 스크린샷 러너).

> **분할 여지(plan-auditor 🟡-D)**: 실측이 estimated(3~5h)를 초과하면 "단일챗 인라인 전환" / "멀티패널 배선" 2커밋으로 분할 — 같은 renderer 도메인이라 게이트 무리 없음. 등급 상향은 불요.
