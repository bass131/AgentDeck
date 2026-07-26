### ADR-015: M3 Git 백엔드 — git CLI `execFile` 직접 (라이브러리 0) ⭐
**결정**: git 연동은 `src/main/git.ts` 단일 파일에서 시스템 git을 `child_process.execFile`로 직접 호출. simple-git/isomorphic-git/nodegit 등 **라이브러리 미사용 = 새 의존성 0**. read 6 + write 3 = 9함수(status/log/commitDetail/fileAt/workingFile/root + commit/push/pull), 출력은 porcelain v2·--numstat 직접 파싱. AI 커밋 메시지는 **별도 AI 모듈 없이 활성 에이전트에 위임**(onAskClaude → 컴포저 주입, ADR-003 재사용).
**이유**: 원본 AgentCodeGUI가 정확히 `src/main/git.ts` + execFile 방식 → **완전 복제 충실도**. execFile은 Node 내장(stdlib)이라 번들·ABI·버전 부담 0이고 git 출력 포맷을 자유롭게 제어. 신뢰경계: git/child_process는 main 단독(`git.ts` electron import 0), renderer는 `window.api.git.*` IPC만.
**트레이드오프**: 시스템 git 설치에 의존(없으면 실패 → `GitOpResult`/null로 흡수). 라이브러리 추상화 대신 출력 파싱을 직접 작성. 그러나 의존성 0 + 원본 일치 + 포맷 제어가 그만한 값. ADR-013(스택 원본 일치)·ADR-007(신뢰경계)와 정합.

