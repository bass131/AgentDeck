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
- [ ] **P1 ui-prefs 영속 토대**(🔴 토대): main `prefs.ts`(`userData/ui-prefs.json`)+IPC(`ui.getPrefs`/`ui.setPref`)+preload+renderer `lib/prefs.ts`(boot loadPrefs·getPref/setPref 캐시). 원본 lib/prefs.ts 미러. WhatsNew/Profile/EngineGate first-run 플래그 토대.
- [ ] **P2 Profile 진입 게이트**(🔴, 대문 핵심): profile 영속(getProfile/setProfile IPC) + 부트→로그인→MainApp 3단계(원본 App.tsx 1143~1191) + 우리 스타일 온보딩 가미. 첫실행("시작하기") vs 복귀("다시 오셨네요") 분화.
- [ ] **P3 EngineGate 자동 트리거**(🔴 적응): 우리 엔진=SDK 가용+OAuth 인증 상태 탐지(IPC) → 미인증/불가 시 게이트. 원본 CLI 설치 탐지를 우리 모델로 적응(default-off 제거·자동 체크).
- [ ] **P4 WhatsNew/UpdateNotes 자동 트리거**(🟡→대문 일부): prefs seen-key + 버전 비교로 첫실행/업데이트 시 자동 표시(원본 WhatsNew.tsx 156~206). 조건부 셸 off 제거.

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
- 진행: **P1 착수**.
