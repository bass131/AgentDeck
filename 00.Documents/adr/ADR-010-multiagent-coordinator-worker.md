### ADR-010: 멀티에이전트 개발 분담 — ClaudeDev식 coordinator/worker
**결정**: 본 저장소 개발은 coordinator(분해·위임·통합) → 도메인 Worker(main-process / agent-backend / renderer / shared-ipc / qa) → reviewer/plan-auditor 자동 호출. 권한 경계 + 재귀 차단 + 등급별 동원.
**이유**: `C:\Dev\ClaudeDev` 검증된 패턴 착안. 컨텍스트 보존 + 경계코드 일관성.
**트레이드오프**: 위임 오버헤드(단순 작업엔 과함) → 등급 "단순"은 메인 직접 처리로 완화.

