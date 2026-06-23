# PRD: AgentDeck

> Product Requirements Document — *뭘 만드는지*. 하네스 프레임워크 Layer 1.

## 목표 — 2 트랙

**1차 목표(Track 1 · 완전 복제)**: [UnrealFactory/AgentCodeGUI](https://github.com/UnrealFactory/AgentCodeGUI)를 **기능·GUI 레이아웃·배포 과정까지 1:1로 충실히 복제**한다. AgentCodeGUI는 Claude Code 전용 데스크톱 IDE이므로, Track 1은 **Claude Code 단일 엔진**으로 완성한다.

**2차 목표(Track 2 · 우리 스타일)**: 복제가 끝난 뒤, **Codex 듀얼 백엔드 + 우리 UX 개선**을 얹는다.

> ⚠️ **순서가 핵심**: 먼저 *똑같이* 만들고(Track 1), *그 다음* 우리 식으로 바꾼다(Track 2). 이 문서의 마일스톤은 그 순서를 강제한다.

## 설계 메모 — 얇은 백엔드 이음 (복제 충실도 ↔ Track 2 대비)
Track 1은 Claude Code 전용이지만, 내부에 **얇은 `AgentBackend` 이음**을 둔다(ADR-003). 이는 사용자에게 보이지 않는 *내부 구조*라 복제 충실도에 영향이 없고, Track 2에서 Codex 어댑터를 끼우기 쉽게 한다. **Track 1 동안 엔진은 Claude Code 하나뿐**이며, Codex 어댑터는 stub(자리만)로 둔다. 백엔드 *전환 UI*는 Track 2에서 생긴다.

---

## Track 1 — 완전 복제 기능 (AgentCodeGUI 1:1)

> 전부 *복제 대상*. 어느 것도 영구 제외가 아니라 마일스톤 M1~M5에 걸쳐 **모두 구현**한다. 상세 추적/마일스톤 배치는 [FEATURE_MAP.md](./FEATURE_MAP.md).

### A. 엔진 (Claude Code 단일)
1. 로컬 Claude Code 엔진 설치 탐지·버전 관리.
2. Claude Code 실행(Agent SDK / `claude -p`) — 스트리밍·도구호출·중단(abort).
3. (내부) 얇은 `AgentBackend` 이음으로 정규화된 `AgentEvent`.

### B. 대화 & 멀티에이전트
4. 대화 패널 — 스트리밍 응답, 도구호출 카드(역할·도구·결과).
5. 멀티에이전트 동시 실행 + 메시지 큐잉.
6. 서브에이전트 검사 카드.
7. 대화·파일변경·diff·draft 영속화 + 복구.
8. 슬래시 커맨드(`/init` `/compact` `/review` `/security-review` `/ask`).
9. 이미지 첨부(붙여넣기/드래그/파일).
10. 컨텍스트 토큰 게이지 + 사용량 분석.
11. 입력창 메시지 히스토리 복구(↑↓).

### C. 코드 인텔리전스 & 파일
12. 파일 탐색기 + AI가 건드린 파일 인디케이터.
13. 코드 뷰어 — 시맨틱 토큰·하이라이팅·이미지 프리뷰.
14. diff 뷰어 — 삭제 시각화.
15. LSP — 타입 호버·정의 이동(pyright/typescript 번들, clangd/omnisharp 다운로드).
16. 레퍼런스 폴더(읽기 전용) + 마크다운 렌더링.
17. 언어별 JetBrains 컬러 스킴 자동 적용.

### D. Git 통합
18. 비주얼 히스토리 — fork 스타일 3컬럼(히스토리/브랜치, 커밋 목록, 커밋 상세).
19. 브랜치/태그 관리.
20. AI 커밋 메시지 생성.

### E. 배포 & 플랫폼
21. NSIS 설치 패키징 — `AgentDeck-Setup-*.exe`.
22. electron-updater 자동 업데이트 — GitHub Releases.
23. Windows 10/11 컨텍스트 메뉴 통합.
24. 다크/라이트 테마.

→ **A~E 전부 완료 = Track 1 완전 복제 달성.**

---

## Track 2 — 우리 스타일 (복제 이후)

> Track 1이 끝난 뒤 착수. AgentCodeGUI에 없는 우리 확장.

- **X1. Codex 듀얼 백엔드 실동작** — `codex` CLI / OpenAI 어댑터를 얇은 이음에 끼움 + 엔진 전환 UI(대화/전역).
- **X2. 프로젝트에 하네스 씌우기** — 사용자의 프로젝트에 컨텍스트 파일·hooks 스캐폴드를 생성하는 1급 기능.
- **X3. 백엔드별 토큰/비용 비교**, 기타 우리 UX 개선.

---

## 진행 현황 (M1·M2·M3 완료 → 충실도 트랙)

- **M1 핵심 루프 ✅** (`phases/01_mvp`): IPC 계약 + 얇은 `AgentBackend`(Claude 실동작/Codex stub) + 3-pane 셸 + 폴더열기→대화 스트리밍→파일변경→diff + sqlite 영속화 + 다크.
- **M2 코드 인텔리전스 ✅** (`phases/02_code-intelligence`): CodeMirror6 코드뷰어 + `fs.read` 단일채널 + 마크다운(react-markdown, XSS/원격차단/CSP) + 이미지 프리뷰 + 레퍼런스 폴더(읽기전용, 등록 루트 ID 게이트). 287 단위 + 8 e2e. **C2 시맨틱·C5 LSP는 M2-LSP로 분리.**
- **M3 Git ✅** (`phases/19_m3-git`): GitModal 실데이터 연결 — `src/main/git.ts`(execFile 직접·라이브러리 0) status/log/commit/push/pull + 비주얼 히스토리·브랜치/태그(읽기)·AI 커밋(에이전트 위임) + fs.diff HEAD 스냅샷 버그수정. 1008 단위 + e2e 14. **D1~D4 ✅.** (실 origin push=인간 게이트)
- **남은 로드맵**: M4 멀티에이전트·슬래시·토큰게이지·엔진버전 → M2-LSP(호버/정의이동) → M5 NSIS·자동업데이트·컨텍스트메뉴·라이트테마. → **Track 2** Codex 듀얼백엔드·우리 확장.

### ⭐ 충실도 트랙 (2026-06-22 사용자 결정, ADR-013/014)
기능맵 기반 구현이 원본 완성도에 못 미침 → **전면 1:1 시각/구조 재작업**. 원본 repo를 `C:/Dev/AgentCodeGUI`에 클론해 소스/스크린샷 대조(+사용자 권한 하 live 빌드). **스택을 원본과 동일 업그레이드**(React19/Electron42/Vite7/TS6, ADR-013). 타깃 = `docs/UI_FIDELITY.md`, 페이즈 **F1~F6**(디자인시스템+셸 토대 → 사이드바/탐색기 → 대화/컴포저/툴카드 → 우측패널 → 뷰어/모달 → 라이트테마). 격차 상당수(서브에이전트·Git·설정·LSP)는 M3/M4/M5 기능과 병합된다.

> 🔑 영구히 Track 1 밖인 것은 *Codex·우리 스타일*뿐(= AgentCodeGUI 자체에 없는 것). 나머지는 모두 복제 대상.

## 비기능 요구사항
- **OS**: Windows 11 우선(10 호환). macOS 비목표.
- **성능**: 스트리밍 첫 토큰 지연 인지 수준 이내, UI 60fps.
- **보안**: API 키는 OS 자격증명/`.env`(git-ignored). 코드·DB·로그 평문 금지(CLAUDE.md CRITICAL).
- **하네스 자기적용**: 본 저장소 자체가 `docs/` + `CLAUDE.md` + `.claude/` + `scripts/execute.py`로 통제.

## 성공 기준
- **M1 done**: `npm run dev`로 3-pane가 뜨고 → 폴더 열기 → 대화 지시 → Claude Code 스트리밍 → 파일변경 인디케이터 + diff → 재시작 시 대화 복구 → 하네스 게이트(`/review`·hooks) 동작.
- **Track 1 done(완전 복제)**: A~E 전 기능이 AgentCodeGUI와 동등하게 동작 + NSIS 설치본 배포.
- **Track 2**: Codex 전환 + 우리 확장 동작.
