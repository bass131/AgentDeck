# M05 Backlog — 범위 밖 관찰

완료조건 밖의 발견을 한 줄씩 남깁니다. 승인을 묻지 않고 기록만 하며, 다음 goal의 후보입니다.
M04에서 넘어온 항목은 `M04_Goal_Loop/99_Backlog.md`가 계속 소유합니다.

1. `main/03_lsp/manager.ts:519`의 `disposeAll()`을 프로덕션에서 아무도 부르지 않는다. 앱 종료(`before-quit`)는 실행과 store만 닫으므로 LSP 자식 프로세스가 남을 수 있다 (G1 감사, 판독 — 실행 확인 필요).
2. `@keyframes rise`가 몸체가 다른 두 벌이다(`MultiWorkspace.css:698` +14px, `SettingsModal.css:171` -6px). 적용되는 쪽이 번들 순서에 달렸다 (G1 감사 실측, 화면 영향은 추측).
3. 권한 모드 매핑이 시작 때(`runArgs.ts:10`, `auto→acceptEdits`)와 실행 중 전환 때(`claudeAgentRun.ts:31`, `auto→auto`) 다르다. M06의 권한 처리 goal이 의미를 정한다 (G1 감사 실측).
4. SDK 버전 폴백 `0.3.186`이 두 곳에 있고 설치본(`^0.3.201`)보다 낡았다 (`ClaudeCodeBackend.ts:14`, `engineState.ts:18`). G11의 중복 통합 때 함께 고친다.
5. `renderer/src/store/slices/selector.ts:27`의 `selectTaskScope`가 호출마다 새 객체를 만들어 `AgentPanel.tsx:181`이 store 변경마다 다시 렌더될 수 있다 (G1 감사, 판독).
6. `10_Engine`·`11_Settings`의 main 구현은 Claude 전용이다. Codex 백엔드를 붙이는 goal이 백엔드 중립 계층과 Claude 구현으로 나눈다 (재편 계획 도메인 절).
7. 이벤트 이름 `'model-fallback'`만 kebab이다(나머지 28종은 snake_case). 바꾸면 영속된 대화 기록의 호환을 봐야 한다 (G1 감사 실측).
