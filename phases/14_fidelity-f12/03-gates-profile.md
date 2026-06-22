# Phase 03: gates-profile

## 목표
**EngineGate** + **AppUpdateGate**(설치/업데이트 진행 카드) + **Profile**(2분할 로그인 온보딩) 시각 1:1. 라이프사이클(단위 검증).

## 담당 도메인 / 에이전트
renderer (src/renderer). 등급: 보통.

## 의존 Phase
F12-02.

## 위험 깃발
없음 (renderer. 새 IPC 0. 엔진설치/업데이트/로그인 실동작=M5. open prop + Shell state default off).

## 변경 대상 (이 경계 밖 금지)
- `src/renderer/src/lib/avatarColor.ts`(신규) — AVATAR_PALETTE(아바타 색 12종, 고정 리터럴 — 동적 사용자색 예외).
- `src/renderer/src/components/EngineGate.tsx`+CSS(신규) — **set-dialog-overlay 오버레이 재사용(F8 보유) + install-card 본문 신규**(우리 코드베이스에 install-card 부재 → 신규 추가): install-card > ic-head(ic-hic 스피너/체크/경고 + ic-title + ic-ver) + ic-log(ic-ln) + ic-foot(ic-status + sd-cancel/sd-go). phase(prompt/installing/done/error). props{open,phase,onClose}.
- `src/renderer/src/components/AppUpdateGate.tsx`+CSS(신규, install-card 재사용) — 동일 관용구, phase(available/downloading/downloaded/error) + 「나중에」/「재시작하여 설치」. props{open,phase,onClose}.
- `src/renderer/src/components/Profile.tsx`+CSS(신규) — 풀윈도우 login-body(lg-brand[mark+wordmark+head+feats 4] + lg-form-wrap>lg-form[title 다시 오셨네요/시작하기 + desc + pf-preview(pf-ava 색+이니셜) + 닉네임 field(maxLength 20) + pf-swatches AVATAR_PALETTE 그리드 + 입장하기 submit]). avatarColor/swatch 인라인 동적색 허용(F8 예외). props{initial,onEnter} — 시각(로컬, 실 저장=M5). **⚠️ TitleBar 중첩 회피**: 원본 Profile은 자체 `<TitleBar>`를 렌더하나 우리 Shell이 이미 TitleBar 렌더 → Profile은 **자체 TitleBar 생략**(Shell win 위 오버레이로 띄우거나 login-body만). TitleBar 2중 렌더 금지.
- `src/renderer/src/layout/Shell.tsx` — engineGateOpen/appUpdateOpen/profileOpen state(default false) + 렌더. (라이브 트리거 없음 — M5.)
- `src/renderer/src/components/icons.tsx` — 필요분.

## 작업 단계
1. avatarColor.ts + InstallCard 공용(또는 각 게이트).
2. EngineGate/AppUpdateGate(phase별 카드) + Profile(2분할 폼).
3. CSS. 인라인 색 0(avatarColor/swatch 동적 예외만).
4. 단위 테스트.

## 완료조건 (AC — 측정 가능)
- [ ] `npm run typecheck` green.
- [ ] 테스트: EngineGate open(installing/done/error phase별 ic-title·버튼) · AppUpdateGate open(downloading/downloaded 버튼) · Profile open(title + pf-preview 이니셜 + 닉네임 입력 + pf-swatch 선택 aria-pressed + 입장하기 disabled[빈 닉네임]→활성). 닫힘 미렌더. PASS.
- [ ] 자동 표시 안 함: Shell 기본 open=false → 기존 e2e 회귀 0.
- [ ] scope grep: window.api 0(엔진설치/업데이트/입장=시각).
- [ ] `npm run test`·`test:e2e` 회귀 0.

## 참조
원본 EngineGate.tsx·AppUpdateGate.tsx·Profile.tsx · 기존 install-card(set-dialog F8) · REPLICA_GAP F12.
