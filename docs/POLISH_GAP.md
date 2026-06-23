# POLISH_GAP — 원본 대비 "놓친 구현 디테일" 폴리싱 드라이버

> 기능 트랙 완료(M1~M4·B8·B9·M2-LSP) 후, 원본 AgentCodeGUI의 **미세 동작/실배선 디테일** 격차를 audit→fix.
> 무인 /loop 드라이버(매 iteration 읽고 다음 미완 이어감, 압축 생존). "다른 부분 없을 때까지".
> **사용자 결정**: 진입 대문 = 원본 진입 흐름 **실배선(Track 1)** + 우리 스타일 가미(Track 2).
> audit 원천: 2026-06-24 Explore(원본 App.tsx 진입 시퀀스·prefs.ts·Settings.tsx·useGlobalShortcuts 대조).

## 확인된 토대 부재 (우리 코드)
- **profile·ui-prefs·engine 탐지 IPC 전무**(grep 0). 대문은 main 영속/탐지부터 신규.
- 엔진 모델 차이(ADR-016): 우리는 Agent SDK(하드 의존, isAvailable=true) — 원본의 `claude` CLI 설치 탐지와 의미가 다름. **EngineGate는 1:1 아닌 적응**(SDK 가용 + OAuth 인증 상태) 필요.

## 우선순위 격차 → 웨이브 (🔴 기능결함 > 🟡 영속/UX > 🟢 폴리싱)

### 🔴 1단계 — 진입 대문 + 핵심 동작
- [x] **P1 ui-prefs 영속 토대** ✅ `221a317` — main prefs.ts(userData/ui-prefs.json)+IPC+renderer lib/prefs.ts(boot loadPrefs·getPref/setPref). reviewer 🔴 0·단위 1792.
- [x] **P2 Profile 진입 게이트(대문 핵심)** ✅ `06f3303` — profile.ts 영속+PROFILE_GET/SET + AppGate 부트 3단계(스플래시→온보딩→Shell·첫실행/복귀 분화)+인사말 닉네임 실연결+절제된 페이드인. reviewer 🔴 0·단위 1849.
- [x] **P3 EngineGate 적응** ✅ `926807e` — engine.state IPC(available/authed/version, authed 불리언만·토큰 미노출) + AppGate engine-check 단계 + EngineGate를 CLI 설치→OAuth 인증 안내로 적응(재확인/계속 우회). Shell stale EngineGate 제거. reviewer 🔴 0·단위 1898.
- [x] **P4 WhatsNew/UpdateNotes 자동 트리거** ✅ `316d93b` — app.getVersion IPC(shared 계약·preload getAppVersion·main 핸들러) + lib/whatsNewTrigger.ts(SEEN_KEY·seriesOf·decideStartupModal 순수) + Shell 부트 useEffect(첫실행 seen 빈값→WhatsNew·마이너 시리즈 상승→UpdateNotes·닫을 때 setPref 도장·같은 키 공유로 동시표시 방지). "자동 표시 안 함" 셸 상태→부트 트리거 대체, test-open 훅 보존. reviewer 🔴 0·계약 골든 5+트리거 순수함수 18·단위 1922.

### 🟡 2단계 — 실동작/영속
- [ ] **P5 Settings 5탭 실동작**(🔴 기능): 엔진/MCP/Skill/LSP 탭 정적 샘플→실 IPC. (엔진=SDK·LSP=manager status·MCP/Skill=SDK 설정. 일부는 우리 모델로 적응/비범위.)
- [ ] **P6 전역 단축키 배선**(🟡): useGlobalShortcuts no-op→실 액션(Ctrl+N 새채팅·Ctrl+O 폴더·Esc 중지·Shift+Tab 모드순환). 원본 App.tsx 477~539.
- [ ] **P7 대화 영속 보강**(🟡): draft·draftImages·sysPrompt·recentFiles·picker(model/effort/mode) 채팅별 영속(원본 PersistedChats).

### 🟢 3단계 — 폴리싱(선택)
- [ ] **P8** scroll-follow latch·메시지 animate·타임스탬프 미세동작.
- [ ] **P9** SubAgent 패널 상태 전이(멀티 초기).

## 이미 충실(폴리싱 불요 — 과잉수정 방지)
ImageViewer·FileModal/CodeViewer·Composer 기본·GitModal·AskModal·테마전환·Permission/Question 모달·RecentFiles 탭·Zoom·LSP(방금 완료).

## 사이클·정책
각 웨이브: (필요시 Explore 보강)→Phase/계획→plan-auditor(토대·신뢰경계 변경 시)→domain Worker TDD(실패 먼저)→reviewer(신뢰경계 🔴 0)→라이브(필요시 vite-node/실 동작)→conventional commit(master)→POLISH_GAP/FEATURE_MAP/replica-loop 갱신. 서브에이전트·도구 한국어·기본 foreground. 인간게이트(push/배포) 보존. 신뢰경계 불가침(fs/IPC main 단독·토큰0). 막힘=원본+Opus 5회 의논 후 정지.

## 상태
- 진입 대문 완료: **P1✅(`221a317`)·P2✅(`06f3303`)·P3✅(`926807e`)·P4✅(`316d93b`)**. ADR drift 정정✅(`7a346e6`).
- 진행: **P5 착수** (Settings 5탭 실동작).
