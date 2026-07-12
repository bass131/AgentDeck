### ADR-009: 패키징 — electron-builder(NSIS) + electron-updater
**결정**: electron-builder NSIS 타깃, electron-updater + GitHub Releases.
**이유**: AgentCodeGUI 배포 경로 동일. 위저드 설치 + 자동 업데이트.
**트레이드오프**: 코드 서명 부재 시 SmartScreen 경고("More info→Run"). MVP/초기엔 서명 보류(비용), 후속 도입.
**현황(2026-06-24)**: 여전히 **미설치(M5)**. M5 패키징 시 **LSP 번들 서버(`typescript-language-server`/`pyright`, ADR-017)를 `electron-builder asarUnpack`** 으로 asar 밖에 둬야 함(asar 내부면 `process.execPath` 자식프로세스가 못 읽음 → spawn ENOENT). 현재 라이브 검증은 dev/vite-node 기준(패키지 미검증).

