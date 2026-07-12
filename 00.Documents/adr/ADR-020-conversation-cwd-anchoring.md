### ADR-020: 대화별 작업폴더(cwd) 앵커링 — 대화가 자기 워크스페이스를 기억 ⭐
**결정**: 워크스페이스를 전역 단일에서 **대화별 cwd 앵커링**으로 확장한다(원본 AgentCodeGUI 패리티).
- **DB 스키마(better-sqlite3, ADR-006)**: conversations 테이블에 `cwd TEXT` 컬럼 추가 — 마이그레이션 v3(기존 행은 cwd=null graceful).
- **IPC 계약(src/shared)**: `ConversationRecord`에 `cwd?: string` 추가. save/load가 cwd 운반.
- **store/renderer**: 대화 로드 시 그 대화의 cwd로 워크스페이스 복원(cwd 있고 검증 통과 시에만). 대화 생성/save 시 현재 workspaceRoot를 cwd로 기록.
- **범위(MVP 축소, plan-auditor)**: 단일 모드 대상. 멀티 모드는 이미 패널별 cwd(P15)라 제외. **folder-switch 확인 UX(원본 pendingFolder)는 후속 분리** — MVP는 "검증 통과 시 무확인 전환 + 생성 시 cwd 기록"으로 축소.

**이유**: ① 원본은 chat record에 `cwd`("Required")를 저장해 대화 전환 시 그 프로젝트로 워크스페이스가 따라 바뀜 — 1:1 충실도 갭. ② 멀티프로젝트 사용 시 **컨텍스트 정합**: 대화 A(/ProjectX)를 /ProjectY에서 열어도 탐색기·@멘션·에이전트 cwd가 A의 폴더를 따라가 어긋남 방지. ③ 에이전트 resume이 올바른 디렉토리에서 재개.

**트레이드오프 / 신뢰경계(plan-auditor #2 정정)**: DB 마이그레이션 + IPC 계약 변경(신뢰경계 깃발) + store 전역→대화별 = 중형. **`workspace.open`은 원래 rootId 게이트 비대상**(절대 folderPath를 `isAbsolute+existsSync+isDirectory`로 자기검증해 직수신 — renderer가 이미 임의 폴더를 열 수 있음). cwd 자동복원이 만드는 새 표면은 **"DB 영속 경로의 무확인 자동-open"** → 완화: ⓐ 자동 open 전 **재검증**(isAbsolute+existsSync+isDirectory, 기존 workspace.open과 동일 수준)·ⓑ 검증 실패 시 **전역 workspaceRoot 유지(graceful, 워크스페이스 미닫음)**·ⓒ **동일 workspace.open 핸들러 경로 재사용**(무검증 신규 경로 금지). cwd는 경로 문자열(시크릿 아님). 마이그레이션 실패/cwd=null → 기존 전역 동작 폴백.

**완료조건(측정가능, plan-auditor)**: ① store `save({cwd})`→`load()` 라운드트립 보존 + v3 미적용 DB 기존행 cwd=null graceful(단위). ② cwd 검증 헬퍼: 비존재 경로 → 전역 유지(open 미호출)(단위). ③ e2e: 대화 A(/X)·B(/Y) 전환 시 workspaceRoot·fileTree·@멘션 base가 cwd 따라 변경. ④ typecheck 양쪽 green.

**현황(2026-06-24)**: 구현 예정(MVP 축소 범위). folder-switch 확인 UX는 후속.

