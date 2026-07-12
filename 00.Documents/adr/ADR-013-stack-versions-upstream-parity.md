### ADR-013: 스택 버전 — 원본 AgentCodeGUI와 동일 업그레이드 ⭐
**결정**: **React 19 · Electron 42 · Vite 7 · electron-vite 5 · TypeScript 6** + @vitejs/plugin-react 5 · vitest 3 · @testing-library/react 16 · @types/react 19 · @types/node 24. (이전 암묵 React18/Electron31/Vite5/TS5 → 상향.)
**이유**: Track 1 = **완전 복제**. 런타임/빌드가 원본과 동일해야 동작·배포·미래기능(LSP·Agent SDK) 정합. 원본의 *동작하는* electron.vite/tsconfig를 미러링해 마이그레이션 위험을 줄임.
**트레이드오프**: Electron 11개 메이저 등 대규모 업그레이드 → React19 JSX 네임스페이스(`JSX.Element`→`React.JSX`)·testing-library 16·better-sqlite3 ABI 재빌드 등 breaking 대응 필요. **사용자 승인(2026-06-22)**. ADR-001/002의 "Electron+React+TS" 결정은 불변, 버전만 고정.
**Note(분류 — 혼동 방지)**: 본 ADR의 *'원본 일치'* 대상 = React·Electron·Vite·electron-vite·TS·CodeMirror·react-markdown·remark-gfm·highlight.js. **vitest·@testing-library·@vitejs/plugin-react·typescript-eslint·Zustand(ADR-005)·better-sqlite3(ADR-006)·rehype-highlight는 원본 미존재 = AgentDeck 확장**(원본은 테스트 프레임워크 없음·영속화 JSON 파일·상태 라이브러리 미사용·마크다운 하이라이팅은 highlight.js 직접 호출). 배포 스택(electron-builder/electron-updater)은 원본과 동일하나 **현재 미설치(M5 예정)**.

