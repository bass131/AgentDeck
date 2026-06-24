# AgentDeck

> 대화로 코딩하고, 그 자리에서 코드를 읽고, Git까지 — 데스크톱 AI 코딩 IDE.

**2-트랙 목표**: 먼저 [UnrealFactory/AgentCodeGUI](https://github.com/UnrealFactory/AgentCodeGUI)를 **기능·레이아웃·배포까지 1:1 완전 복제**(Track 1, Claude Code 전용)하고, 그 다음 **Codex 듀얼 백엔드 + 우리 스타일**을 얹는다(Track 2). 내부에는 얇은 `AgentBackend` 이음을 둬 Track 2를 대비한다(복제 충실도엔 영향 없음).

이 저장소는 **하네스 엔지니어링**으로 개발된다 — `docs/`(brain) + `CLAUDE.md`(헌법) + `.claude/`(멀티에이전트·hooks) + `scripts/execute.py`(Phase 실행기).

## 기술 스택
Electron · Vite · React · TypeScript · Zustand · JSON fan-out 영속 · electron-builder(NSIS) · electron-updater

## 빠른 시작
```bash
npm install
npm run dev    # 개발 모드 (HMR)
```
> **영속화**: 대화는 `userData/chats/<id>.json` + `index.json`(JSON fan-out, ADR-006 supersede·M1). 네이티브 모듈 0 → 빌드/테스트에 ABI rebuild 불필요. 영속화 초기화가 실패해도 앱은 정상 실행(persistence만 비활성)된다.

## 테스트
```bash
npm run test       # 단위·통합 (Vitest, node ABI) — 138개
npm run test:e2e   # Electron e2e (Playwright) — build→electron ABI→실행→node ABI 복구
npm run typecheck  # 타입검사 (main+renderer)
```
> e2e는 echo 백엔드 + 임시 워크스페이스로 핵심 루프(폴더열기→대화→스트리밍→도구카드→파일변경→diff)를 실제 Electron 런타임에서 결정론 검증한다.

## 개발 워크플로우 (하네스)
1. `docs/` 채우기/보강 (PRD·ARCHITECTURE·ADR·UI_GUIDE).
2. Claude Code에서 `/harness` → docs 읽고 Phase 분해.
3. `python scripts/execute.py 01_mvp` → Phase 순차 자동 실행.
4. `/review` → 규칙 기반 점검 → docs 보강 → 재실행.

## 문서
- [docs/PRD.md](./docs/PRD.md) · [ARCHITECTURE](./docs/ARCHITECTURE.md) · [ADR](./docs/ADR.md) · [UI_GUIDE](./docs/UI_GUIDE.md) · [FEATURE_MAP](./docs/FEATURE_MAP.md)
- [CLAUDE.md](./CLAUDE.md) — 헌법(절대 규칙)

## 로드맵 (마일스톤)
**Track 1 — 완전 복제 (Claude Code 전용)**
- **M1 — 핵심 루프**: 폴더 열기 → 대화 → Claude Code 실행(스트리밍) → 파일변경/diff + 영속화. (`phases/01_mvp`)
- **M2 — 코드 인텔리전스**: LSP·코드뷰어·시맨틱토큰·이미지프리뷰·레퍼런스폴더·마크다운·JetBrains 스킴.
- **M3 — Git 통합**: fork 스타일 3컬럼 비주얼·브랜치/태그·AI 커밋.
- **M4 — 멀티에이전트 & 대화 고도화**: 동시 큐·서브에이전트 카드·슬래시커맨드·이미지첨부·토큰게이지·입력 히스토리·엔진 버전관리.
- **M5 — 배포 & 플랫폼**: NSIS 설치·electron-updater·컨텍스트 메뉴·라이트 테마. → **완전 복제 달성.**

**Track 2 — 우리 스타일 (복제 이후)**
- **M6 — Codex 듀얼 백엔드**: `codex` 어댑터 실동작 + 엔진 전환 UI.
- **M7+ — 우리 확장**: 프로젝트 하네스 씌우기·백엔드 비용 비교 등.
