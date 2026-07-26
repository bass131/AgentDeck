### ADR-019: 슬래시 커맨드 동적 캡처 — SDK supportedCommands() 하이브리드 ⭐
**결정**: 슬래시 팔레트의 빌트인 목록을 정적 하드코딩에서 **SDK `query.supportedCommands()` 동적 캡처 + 큐레이션 폴백 하이브리드**로 전환한다.
- **큐레이션 폴백**(즉시): 작동 보증 빌트인(clear·ask 인터셉트 + compact·init·review·security-review)을 첫 run 전·캡처 실패 시 표시.
- **동적 캡처**(첫 run에서): ClaudeCodeBackend가 활성 query 핸들의 `supportedCommands()`를 run 시작 시 1회 호출해 결과(name·description·argHint·aliases)를 **워크스페이스별 캐시**. AgentBackend에 generic 메서드(예: `listSupportedCommands(): Promise<SlashCommandInfo[]>`)로 노출(ADR-003: command.list 핸들러는 구체 엔진 미인지).
- **머지/dedup**: command.list = 큐레이션 빌트인 ∪ 캡처 빌트인 ∪ `.claude/commands` 스캔. name 키로 dedup, 우선순위 = 캡처 > 큐레이션 > fs 스캔. 클라이언트 인터셉트 전용(ask·clear)은 캡처에 없어도 항상 보존.

**이유**: ① 사용자 요구 "ClaudeCode 지원 모든 슬래시, 왠만하면 다 쓸 수 있게" — 정적 12개는 협소하고 6개는 거짓 광고였음(실측). ② supportedCommands는 **환경별 실제 지원 목록**(빌트인+스킬+커스텀, 측정 32개)이라 포괄적·정확하며 **SDK 버전업 시 자동 동기(드리프트 방지)** — 손유지 불필요. ③ 큐레이션 폴백으로 부트 프로브 없이(추가 비용 0) 첫 대화 후 포괄.

**트레이드오프**: 원본 AgentCodeGUI 미존재 확장(원본은 supportedCommands를 알고도 6개 하드코딩, "genuinely runs only" 철학) → **ADR-013(스택 원본 일치) 예외**를 드리프트 방지 가치로 정당화. 캡처는 query 핸들 가용 후(첫 run)만 → 첫 메시지 전엔 큐레이션 폴백만. supportedCommands가 커스텀 .md를 포함하므로 fs 스캔은 폴백 격하(중복 dedup). 신뢰경계(ADR-008): 노출은 name·description·argHint·aliases만 — 본문·시크릿·경로 0. 캡처는 main(어댑터) 단독, renderer는 IPC만.

**현황(2026-06-24)**: B7 Step1(거짓광고 6개 제거·정직화) 완료(커밋 2711e89). Step2(이 ADR) 구현 예정.

