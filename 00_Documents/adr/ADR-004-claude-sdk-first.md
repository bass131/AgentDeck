### ADR-004: Claude Code 연동 — Agent SDK 우선, `claude -p` 폴백
**결정**: `@anthropic-ai/claude-agent-sdk`(또는 동등 SDK)를 1순위, 헤드리스 `claude -p` JSON 스트림을 폴백 어댑터로.
**이유**: SDK는 구조화된 이벤트/툴 메타를 주어 정규화가 쉽다. CLI 폴백은 SDK 부재 환경 호환.
**트레이드오프**: SDK 버전 변동 추적 비용. 어댑터 경계가 흡수.
**Note**: Anthropic/Claude 관련 작업 전 `claude-api` 스킬 + 최신 모델 ID 확인 의무(CLAUDE.md).
**현황(2026-06-24, 갱신)**: ADR-004의 'SDK 우선' 의도는 **ADR-016으로 SDK 단일 전환 완료**(Phase 21, 커밋 1c47d58/d52b139). 그 위에서 M4-2~M4-4·B8·M2-LSP 전부 SDK 기반 구현·실 SDK 라이브 검증 완료. **'`claude -p` CLI 폴백' 부분은 ADR-016이 superseded** — CLI spawn/taskkill 전면 제거되어 **현재 폴백 어댑터 없음**(SDK 하드 의존, isAvailable=true). ADR-004는 'SDK 우선' 결정의 원천 기록으로 보존하되, 듀얼(SDK+CLI) 가정은 무효.

