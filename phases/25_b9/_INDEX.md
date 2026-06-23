# Phase 25 — B9: 입력창 히스토리 복구(↑↓)

> 셸/터미널식 컴포저 입력 히스토리. **메모리 전용·대화별·렌더러 단독**(원본 1:1). 신규 IPC/영속 0.
> 등급=보통(renderer Worker 1 + reviewer). 원본 매핑=Explore(이 세션) — `C:/Dev/AgentCodeGUI/src/renderer/src/components/Chat.tsx` Composer L1358~1671 + App.tsx L108~115.

## 범위 (원본이 가진 만큼만 — 과대구현 금지)
- 데이터=**현재 대화의 user 메시지**(오래된→최신, 빈 텍스트 제외). 원본 `sentHistory = state.messages.filter(user).map(text)`.
- 상태=Composer 로컬: `histIdx: number|null`(null=초안) + `histDraft: useRef<string>`(탐색 시작 시점 초안 보관).
- **↑(ArrowUp)**: 팔레트 닫힘 + 커서 **첫 줄**(`!value.slice(0,pos).includes('\n')`)에서만. 첫 진입 시 histDraft=현재값 → histIdx=len-1(최신), 이후 max(0, idx-1)(더 오래된). 선택 항목 입력창 로드+커서 끝.
- **↓(ArrowDown)**: 팔레트 닫힘 + 커서 **마지막 줄** + histIdx!==null에서만. idx<len-1이면 idx+1(더 최신), idx>=len-1이면 histIdx=null+histDraft 복원.
- **팔레트 우선순위**: mention/slash 팔레트 열림 시 ↑↓은 팔레트 네비(히스토리 차단). 기존 Composer keydown 순서에 통합.
- **초기화**: 직접 타이핑(onChange) 시 histIdx=null. Enter 전송 시 histIdx=null.
- 멀티라인 안전: 첫/마지막 줄 커서 체크로 줄 이동과 충돌 회피. 빈 입력에서도 ↑ 진입 가능.

## 비범위
- 영속화(localStorage/sqlite/IPC) — 원본에 없음. 메모리 전용.
- 전역(크로스 대화) 히스토리 — 원본은 대화별.
- 중복 제거 — 원본은 중복 허용(그대로).

## 완료조건
- [ ] Composer ↑↓ 입력 히스토리 동작(첫/마지막 줄 조건·draft 보존·팔레트 우선순위·타이핑/Enter 초기화).
- [ ] 기존 keydown(슬래시/@mention 팔레트·Enter 전송·큐·이미지) 회귀 0.
- [ ] `npm run typecheck`·`npm run test` green. reviewer 신뢰경계(renderer 신규 window.api 0) 🔴 0.
- [ ] FEATURE_MAP B9 ✅ · _LOOP_PROGRESS/REPLICA_GAP 갱신.

## 신뢰경계
- renderer 단독, `window.api` 신규 호출 0(파생 데이터=store messages). 인라인 색상 0. reducer 순수성(필요 시 selector만).
