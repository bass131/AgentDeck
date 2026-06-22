# Milestone 16 — 충실도 F14: 폴리시/디테일 (Fidelity, 마지막 디자인 웨이브)

> REPLICA_GAP 웨이브 F14(마지막). 원본의 폴리시 디테일을 시각 1:1. **디자인-우선**: 정적 샘플/로컬. 권한/질문 응답·줌 영속·단축키 실동작=M4/각 기능 트랙. renderer 중심(창 스냅만 main geometry 순수함수). **F14 완료 = 디자인 트랙 F1~F14 전부 ✅ → 사용자 종합 보고.**

## 원본 구조
- **PermissionModal**(Chat.tsx L1026~1056): q-overlay > perm-modal(perm-head[perm-ic IconShieldChk + perm-htext title/sub + perm-tool] + perm-sum + q-opts[q-opt: q-num 1/2/3 + label/desc] + perm-foot "숫자 키로 선택 · Esc 거부"). PERM_CHOICES 허용/항상 허용/거부. 숫자키 1·2·3 + Esc 거부.
- **QuestionDialog**(L1059~1393): q-overlay > q-modal(q-modal-head + q-steps[다중] + q-block[q-head q-chip+q-q + q-opts q-num/label/desc + "직접 입력" q-custom] + q-modal-foot "숫자 키로 선택 · Esc 내려두기" + q-submit). 잠깐 내려두기 → q-mini 알약(우하단). 단일선택 자동진행/다중 토글.
- **ZoomBadge/useZoom**(zoom.tsx): Ctrl+휠 줌(0.5~3, step 0.1, clamp 10%) + flash → zoom-badge "120%" 일시 pill. localStorage 영속.
- **메시지 타임스탬프**: 메시지 메타에 시간(우리 MessageBubble .meta에 time 추가).
- **thinking/notice 아이템**: thinking(IconClaude + 사고요약 + 점 3개) / notice(IconAlert + 텍스트 + 시간) 메시지 타입.
- **SelectionToolbar**(Chat.tsx): 스레드 텍스트 드래그 → 떠서 「복사」(IconCopy→복사됨)/「더 자세히」(IconSearch).
- **전역 단축키**: Ctrl+N/O/F·`백쿼트`(사이드바)·Shift+Tab(모드)·↑↓(히스토리)·Esc(중지) — 핸들러 골격(동작=각 트랙).
- **창 스냅**(window/, protocol SnapZone): 드래그 시 화면 좌/우/모서리 근접 → 스냅 존 + 고스트 프리뷰 + 릴리스 시 스냅 바운드. main geometry 순수함수.

## 적응 (우리)
- 권한/질문 모달: 컴포넌트 + Shell open state(default off, M4 트리거). 정적 샘플. 단위 시각 검증(+데모 트리거 가능 시 e2e).
- ZoomBadge: useZoom 훅(localStorage) + 채팅 스크롤에 연결(라이브). 메시지 타임스탬프/thinking/notice/선택툴바: Conversation 폴리시(샘플 메시지 단위 검증).
- 전역 단축키: useGlobalShortcuts 훅(keydown 골격, Esc/백쿼트 등 자명한 것만 연결, 나머지 no-op 골격).
- 창 스냅: `src/main/window/geometry.ts`에 computeSnapZone/snapBounds **순수함수** 추가 + golden 테스트 + controls.ts 최소 wiring(릴리스 스냅). 고스트 프리뷰는 단순화/생략 가능. **신뢰경계 준수(순수함수+기존 main 패턴, 새 IPC 0)**.

## Phase 분해 (4)
| NN | Phase | 도메인 | 깃발 | 의존 |
|---|---|---|---|---|
| 01 | permission-question-modal | renderer | 없음 | F13 |
| 02 | chat-polish-zoom | renderer | 없음 | 01 |
| 03 | shortcuts-windowsnap | renderer+main | trust-boundary(main geometry) | 02 |
| 04 | f14-visual | qa | 없음 | 03 |

## 실행/검증
TDD + reviewer + 시각검증(모달·줌배지·채팅폴리시 스샷; 스냅=geometry golden). 완료 시 REPLICA_GAP F14 ✅ + Iteration 로그 + **F1~F14 종합 보고**.
