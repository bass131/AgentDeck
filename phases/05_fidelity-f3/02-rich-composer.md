# Phase 02: rich-composer

## 목표
컴포저가 원본 구조로: textarea + 하단 바(이미지 첨부[시각] · **모델/Effort/모드 피커**[드롭다운 열림+옵션+로컬선택] · send) + 컴포저 위 **컨텍스트 게이지 3종**[구조+placeholder %].

## 담당 도메인 / 에이전트
renderer (src/renderer). 등급: 복잡.

## 의존 Phase
01 (chat-messages).

## 위험 깃발
없음 (renderer. 새 IPC 0 — 피커/게이지 모두 로컬 시각).

## 변경 대상 (이 경계 밖 금지)
- `src/renderer/src/components/Conversation.tsx` — 입력 영역을 `.composer-wrap`>`.composer-inner`>(`.ctx-strip` + `.composer`)로. send/abort 동작 보존.
- `src/renderer/src/components/Composer.tsx`+CSS (신규, 선택) 또는 Conversation 내 — `.composer`(textarea + `.composer-bar`) + `Picker` 드롭다운 + `ContextStrip`.
- `src/renderer/src/components/Conversation.css` — composer/picker/gauge 측정값.

## 작업 단계
1. `.composer-wrap`(중앙 760 고정폭) > `.ctx-strip`(게이지 3) + `.composer`(bg surface, radius 14, padding 12).
2. `.composer`: textarea(max-h 160, auto-grow) + `.composer-bar`(첨부 아이콘[시각, no-op] · 모델 피커 · Effort 피커 · 모드 피커 · spacer · send 34×34). Enter 전송 보존, 실행중 send→중단.
3. **Picker**(공용): `.pick-btn`(dot/bars/아이콘 + 라벨 + 값 + chev) → `.pick-menu`(옵션 `.pick-opt` main+desc+check). **로컬 선택 상태만**(모델=Opus4.8/Sonnet4.6/Haiku4.5 표시, effort=낮음/중간/높음/매우높음, 모드=자동/계획/수락). *백엔드 반영 X(M4)*.
4. **ContextStrip**: `.ctx-chip`×3(현재 컨텍스트/5시간/주간) — `.cc-ring`(conic %) + 라벨 + %(placeholder 0%) + detail. **전부 정적 리터럴**: 분모(`0/1M 토큰`)·리셋 문자열(`—`)·% 모두 하드코딩, **store `lastUsage`/`TokenUsage`/토큰 산술 참조 0**(B8=M4 영역 — 무심코 끌어쓰면 선침범). *실제 계산 X(M4)*.
5. 인라인 색상 0(게이지 conic의 동적 % 변수는 허용), 벡터 아이콘.

## 완료조건 (AC — 측정 가능)
- [ ] `npm run typecheck` green.
- [ ] 컴포넌트 테스트(DOM): `.composer` textarea + `.composer-bar` + 피커 3(`.pick`) + 게이지 3(`.ctx-chip`). 피커 클릭→`.pick-menu` 열림+옵션, 옵션 클릭→`.pick-val` 갱신(로컬). send 동작 보존.
- [ ] **scope grep(심볼 명시, 0이어야)**: 컴포저 변경분에서 `lastUsage`·`usage\.`·`TokenUsage`·`tokenCount` = 0(게이지 B8 미침범) · 피커가 `agentRun`/`sendMessage` 모델·effort 인자 변경 0(M4) · 슬래시/첨부/큐 실동작 핸들러 0.
- [ ] **reviewer 게이트(Phase 02 무조건)** — scope 누수 위험 최고점(피커·게이지). 위반 0 확인.
- [ ] `npm run test:e2e` 회귀 0(대화 전송 e2e — 입력→전송 동작 보존).
- [ ] 시각검증: 컴포저(피커 3·게이지 3·send) 렌더(스크린샷 육안).

## 참조
docs/UI_FIDELITY.md §3·§6(컴포저·게이지·피커) · 원본 Chat.tsx(Composer/RunPickers/ContextStrip) · phases/05_fidelity-f3/01-chat-messages.md.
