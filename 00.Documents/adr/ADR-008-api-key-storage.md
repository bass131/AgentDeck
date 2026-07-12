### ADR-008: API 키 저장 — OS 자격증명 / `.env`(git-ignored)
**결정**: 키는 OS 자격증명 저장소 또는 `.env`. 코드·DB·로그에 평문 금지.
**이유**: 유출 방지(CLAUDE.md CRITICAL).
**트레이드오프**: keytar류 네이티브 의존. MVP는 `.env`로 시작, 자격증명 저장소는 마일스톤 04.
**현황(2026-06-24, 갱신)**: 실제 인증은 **Claude Code OAuth(`~/.claude/.credentials.json`) 또는 `ANTHROPIC_API_KEY`(env)** — Agent SDK(ADR-016)/Claude Code가 소유하고 우리 앱은 **토큰을 저장하지 않고 읽기 전용으로만** 접근. B8(usage)·P3(engine-state)는 토큰을 main 지역변수에서 **boolean으로만 환원**(반환/로그/IPC 미노출, reviewer 검증). 우리가 키를 보관하지 않으므로 별도 OS 자격증명 저장소(keytar)는 불요 — **'마일스톤 04' 계획 무효**. ADR-008의 '코드·DB·로그 평문 금지' 원칙은 **불변(준수 중)**.

