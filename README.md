# AgentDeck

> 대화로 코딩하고, 그 자리에서 코드를 읽고, Git까지 — 데스크톱 AI 코딩 IDE.

**2-트랙 구성**: Track 1은 Claude Code 기반의 핵심 코딩 IDE — 폴더 열기·대화·스트리밍 실행·코드뷰어·Git까지 한 데스크톱 앱에서. Track 2는 그 위에 **Codex 듀얼 백엔드 + 우리 스타일 확장**을 얹는다. 내부에 얇은 `AgentBackend` 이음을 둬 백엔드 교체(Claude ↔ Codex)를 대비한다.

이 저장소는 **하네스 엔지니어링**으로 개발된다 — `00.Documents/`(brain) + `CLAUDE.md`(헌법) + `.claude/`(멀티에이전트·hooks) + `/work:plan`(Phase 정의 생성 → 세션/루프로 실행).

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
npm run test       # 단위·통합 (Vitest, node ABI)
npm run test:e2e   # Electron e2e (Playwright) — build→electron ABI→실행→node ABI 복구
npm run typecheck  # 타입검사 (main+renderer)
```
> e2e는 echo 백엔드 + 임시 워크스페이스로 핵심 루프(폴더열기→대화→스트리밍→도구카드→파일변경→diff)를 실제 Electron 런타임에서 결정론 검증한다.

## 개발 워크플로우 (하네스)
1. `00.Documents/` 채우기/보강 (PRD·ARCHITECTURE·ADR·UI).
2. Claude Code에서 `/work-plan` → docs 읽고 Phase 분해.
3. `/work:plan` → Phase 정의 생성 후 세션/루프로 순차 실행.
4. `/review` → 규칙 기반 점검 → docs 보강 → 재실행.

## 문서
- [00.Documents/PRD.md](./00.Documents/PRD.md) · [ARCHITECTURE](./00.Documents/ARCHITECTURE.md) · [ADR](./00.Documents/ADR.md) · [UI](./00.Documents/UI.md) · [FEATURE_MAP](./00.Documents/FEATURE_MAP.md)
- [CLAUDE.md](./CLAUDE.md) — 헌법(절대 규칙)

## 로드맵 (마일스톤)
**Track 1 — 핵심 IDE (Claude Code)**
- **M1 — 핵심 루프**: 폴더 열기 → 대화 → Claude Code 실행(스트리밍) → 파일변경/diff + 영속화.
- **M2 — 코드 인텔리전스**: LSP·코드뷰어·시맨틱토큰·이미지프리뷰·레퍼런스폴더·마크다운·JetBrains 스킴.
- **M3 — Git 통합**: fork 스타일 3컬럼 비주얼·브랜치/태그·AI 커밋.
- **M4 — 멀티에이전트 & 대화 고도화**: 동시 큐·서브에이전트 카드·슬래시커맨드·이미지첨부·토큰게이지·입력 히스토리·엔진 버전관리.
- **M5 — 배포 & 플랫폼**: NSIS 설치·electron-updater·컨텍스트 메뉴·라이트 테마. → **Track 1 완성.**

**Track 2 — 확장 (Track 1 이후)**
- **M6 — Codex 듀얼 백엔드**: `codex` 어댑터 실동작 + 엔진 전환 UI.
- **M7+ — 우리 확장**: 프로젝트 하네스 씌우기·백엔드 비용 비교 등.
