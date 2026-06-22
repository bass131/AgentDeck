# Milestone 05 — 충실도 F3: 대화 / 컴포저 / 툴카드 (Fidelity)

> 충실도 트랙 F3(`docs/UI_FIDELITY.md` §3, §6 라이브관찰, 격차 TOP#5). 중앙 대화 영역을 원본 밀도/구조로 — **체감 임팩트 최대**. renderer-only, 새 IPC 0.
>
> 권위 = `docs/UI_FIDELITY.md` + 라이브 스샷 `artifacts/acg/{03-shell,c-chat}.png` + 원본 `Chat.tsx`/`styles.css` 대조. F2까지 완료(셸·좌측 두 컬럼).

## F3 시각골격 ↔ M4/F5 실동작 경계 (핵심)
- **F3 = 시각 골격**: DOM/CSS/레이아웃 + 기존 store 데이터(messages·streamingText·toolCards)로 렌더 + M4 요소의 *구조/placeholder*.
- **M4 = 실동작**(이 마일스톤 밖): 피커 *선택 적용*(모델/effort/모드 백엔드 반영)·토큰 게이지 *계산*·슬래시메뉴·@멘션·이미지 첨부 실행·메시지 큐·working phrase 회전·툴 상태추적.
- **F5 = 모달**(별도): question/permission/설정 모달, selection toolbar.

## Phase 분해 (4개 — 의존성 순서)

| NN | Phase | 도메인 | 깃발 | 의존 |
|---|---|---|---|---|
| 01 | chat-messages | renderer | 없음 | F2 |
| 02 | rich-composer | renderer | 없음 | 01 |
| 03 | tool-cards | renderer | 없음 | 01 |
| 04 | f3-visual-regression | qa | 없음 | 01,02,03 |

## 범위 경계 (scope creep 차단)
- 피커(모델/effort/모드)는 **드롭다운 열림 + 옵션 표시 + 로컬 선택 시각**만. *백엔드 반영·실제 모델 전환 = M4*.
- 컨텍스트 게이지 3종 = **구조 + placeholder %**(0% 등). *실제 토큰/한도 계산 = M4*.
- 슬래시메뉴·@멘션·이미지 첨부·예약 큐 = **M4**(F3 미포함 — 트리거가 M4 동작). working phrase 회전 = M4.
- question/permission/설정 모달·selection toolbar = **F5**.
- 메시지 타임스탬프: store에 있으면 표시, 없으면 생략(store 변경=후속). 멀티에이전트 = M4.

## 핵심 측정값 (원본 styles.css 추출)
- `.chat-head` 52 / `.thread` max-width 760(반응형 clamp) padding 26·28·30 gap 24 / `.msg` gap 14 아바타 28×28 / `.msg.user .content` bg surface-2 radius 16(우상단 5) max-width 80% / assistant 아바타 accent / `.composer` bg surface border radius 14 padding 12 / textarea max-h 160 / `.send` 34×34 / 게이지 `.cc-ring` 19×19 conic / 추천칩 `.wc-grid` 2×2 gap 10, `.wc-card` radius 12.

## 실행/검증
renderer + TDD + reviewer(렌더 다수) + 시각검증(visual-viewer 채팅 스크린샷 — 빈채팅·메시지버블·컴포저·게이지·툴카드). 자동: `python scripts/execute.py 05_fidelity-f3`.
