# phases/ — Phase 정의 (`/work:plan`이 생성)

이 폴더는 `/work-plan <목표>`이 마일스톤별 Phase 정의를 생성하는 곳이다.

- **구조**: `phases/M{N}-{slug}/NN-{phase-name}.md` (+ 복잡/대규모 완료 시 `NN-{phase-name}-DONE.md`)
- **템플릿**: `.claude/templates/phase-template.md`
- **평소 비어있음** — 큰 마일스톤(M5 배포·Track2 등) 작업 시에만 채워지고, 완료·마감 후 정리한다. 과거 마일스톤 이력은 git history가 보존(여기 누적 X).
- **정책**: `.claude/policies/pin-and-done.md`(work-pin·-DONE.md 라이프사이클) · `grade-and-risk.md`(등급·위험깃발) · `subagent-routing.md`(도메인 라우팅).

> 옛 `phases/01_mvp` ~ `37_orchestration-viz`(155파일) 작업 이력은 2026-06-26 정리됨(컨텍스트 오염 방지, git history 보존). 하네스 이식 = ADR-026.
