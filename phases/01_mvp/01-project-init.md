# Phase 01: project-init

## 목표
Electron + Vite + React + TS 프로젝트가 초기화되어 `npm run dev`로 빈 3-pane 셸(다크)이 뜬다. 이후 Phase들의 토대.

## 담당 도메인 / 에이전트
main-process + renderer (기반 스캐폴드). 등급: 복잡 → coordinator 분해 가능.

## 의존 Phase
없음 (최초).

## 위험 깃발
없음.

## 변경 대상
- `package.json`, `tsconfig.json`, `tsconfig.node.json`, `electron.vite.config.ts`, `.editorconfig`, `eslint`/`prettier` 설정
- `src/main/index.ts` (BrowserWindow — `contextIsolation:true`, `nodeIntegration:false`)
- `src/preload/index.ts` (빈 contextBridge 골격)
- `src/renderer/` (`index.html`, `src/main.tsx`, `src/App.tsx`, `src/theme/tokens.css`)
- `tests/` (Vitest 설정 + smoke 테스트 1개)

## 작업 단계
1. electron-vite 기반 스캐폴드 구성(main/preload/renderer 3 타깃). ADR-001/002 스택 준수.
2. `BrowserWindow`를 `contextIsolation:true`, `nodeIntegration:false`로 생성(헌법 CRITICAL 신뢰경계).
3. renderer에 빈 3-pane 레이아웃 골격 + `src/theme/tokens.css`에 UI_GUIDE 다크 팔레트 CSS 변수.
4. Vitest 설치 + `npm run test`로 도는 smoke 테스트 1개(`tests/smoke.test.ts`).
5. `npm run typecheck`/`lint`/`dev`/`build` 스크립트를 package.json에 정의(CLAUDE.md 명령어 정합).

## 완료조건 (AC)
- [ ] `npm install` 성공.
- [ ] `npm run dev`로 앱 창이 뜨고 다크 3-pane 골격이 보인다.
- [ ] `npm run typecheck` green.
- [ ] `npm run test`로 smoke 테스트 PASS.
- [ ] `src/main/index.ts`에 `contextIsolation:true` + `nodeIntegration:false` 확인.

## 완료 후 후속(사용자/다음 세션)
- `touch .claude/state/tdd-enforce` → 이후 구현은 TDD 차단 모드.

## 참조
docs/ARCHITECTURE.md(디렉토리 구조) · docs/UI_GUIDE.md(팔레트) · CLAUDE.md(신뢰경계·명령어) · ADR-001/002/005.
