### ADR-001: 셸 — Electron (Tauri 아님)
**결정**: Electron + electron-vite.
**이유**: 목표가 AgentCodeGUI의 *배포 과정까지 벤치마킹*. AgentCodeGUI는 Electron이라 NSIS 설치·electron-updater·컨텍스트메뉴 경로를 그대로 재사용 가능. React 생태계(코드뷰어/diff) 재사용.
**트레이드오프**: 번들 크기·메모리는 Tauri보다 크다. 그러나 배포 파이프라인 재현성과 레퍼런스 일치가 우선.

