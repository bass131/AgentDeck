# AgentDeck Codex Harness 전체 점검 및 `multi_agent_v2` 실험 기록

- 작성일: 2026-07-10
- 대상 브랜치: `codex/agent-harness`
- 기준 커밋: `36a8186`
- 상태: 읽기 전용 점검 완료, 개선안 미적용
- 목적: Claude Code에서 후속 작업을 이어갈 수 있도록 Codex 하네스 점검 결과와 실험 근거를 보존한다.

## 1. 결론

현재 하네스는 기본 구조, Hook 등록, Claude/Codex 런타임 상태 분리, 역할·스킬 대응 관계가 전반적으로 정상이다. 자동 검사도 모두 통과했다. 따라서 일상적인 작업을 시작할 수 있는 상태다.

다만 “Hooks 전부 이상 없음” 또는 “권한 경계가 완전히 강제됨”으로 결론 내리면 안 된다. 이번 점검에서 아래 네 가지 높은 우선순위 문제가 확인되었다.

1. Codex Worker 역할별 쓰기 권한이 실제 도메인별로 분리되어 있지 않다.
2. Claude `coordinator` 역할은 다른 Agent를 호출해야 하지만 필요한 위임 도구가 없다.
3. Supervisor·Secretary 중심 작업 절차가 일부 오래된 문서와 역할 지시에는 반영되지 않았다.
4. Claude Harness 봉인은 `node -e` 같은 내장 JavaScript 파일 쓰기를 놓칠 수 있다.

Hook smoke test와 live canary는 등록된 이벤트가 실행되고 예상 payload가 처리된다는 점을 검증한다. 모든 셸 우회 경로와 모든 실제 작업 시나리오를 포괄하는 보안 증명은 아니다. `PreToolUse` Hook도 공식 설계상 보안 경계라기보다 실수 방지용 guardrail이다.

## 2. 점검 범위와 변경 통제

다음 영역을 비교·점검했다.

- Claude 정본: `CLAUDE.md`, `.claude/policies/**`, `.claude/agents/**`, `.claude/skills/**`, `.claude/hooks/**`
- Codex 호환 계층: `AGENTS.md`, `.codex/config.toml`, `.codex/agents/**`, `.agents/skills/**`, `.codex/hooks.json`, `.codex/hooks/**`
- 런타임 상태 분리: `.claude/state/**`와 `.codex/state/**`
- 역할 라우팅, 권한 프로필, Hook payload, digest cachebuster, execpolicy
- Phase·DONE 형식 비용과 현재 문서 드리프트
- Codex CLI `multi_agent_v2` 기능 플래그와 SubAgent 생성 동작

점검 중 다음 통제를 지켰다.

- `.env*`, `secrets/**`, `.claude/state/**`를 읽거나 수정하지 않았다.
- 전역 `~/.codex/config.toml`과 프로젝트 `.codex/config.toml`을 수정하지 않았다.
- 제품 코드, 하네스 설정, Hook, work-pin을 수정하지 않았다.
- 임시 CLI 실험은 명령행 설정 오버라이드로만 수행했다.
- 점검 시작 시 Git 워킹트리는 깨끗했다. 이 보고서 추가만 새 변경으로 남긴다.
- 커밋, push, PR 생성·머지는 수행하지 않았다.

## 3. 검증 결과

### 3.1 자동 검사

| 검사 | 결과 | 의미 |
|---|---:|---|
| Codex Hook 및 하네스 계약 테스트 | 27/27 통과 | Hook payload 처리, 봉인, digest, 역할·스킬 계약의 정적 회귀 검사 |
| Claude Hook 정책 테스트 | 7/7 통과 | Claude Hook의 기존 정책 회귀 검사 |
| 전체 Hook 관련 테스트 | 34/34 통과 | 두 엔진의 테스트 스위트가 모두 통과 |
| Claude Hook 셸 스크립트 구문 검사 | 10/10 통과 | Git Bash 기준 `.sh` 구문 오류 없음 |
| `harness-doctor --live` 정적 검사 | 통과 | 역할 9/9, 스킬 8/8, Hook digest 정상 |
| `harness-doctor --live` live canary | 통과 | 권한 3/3, Hook 이벤트 4/4, 모델 검사 3/3 |
| execpolicy 표본 검사 | 통과 | `git push`는 확인 요청, `curl`은 금지, `git status`는 허용 |
| Hook SHA-256 digest | 일치 | `5a77fb9e4418cf68c587733757aeb7175130a0fbeaaac224bd504bee2a6daf55` |
| 런타임 상태 경로 분리 | 통과 | Claude와 Codex가 서로의 state를 폴백으로 사용하지 않음 |
| 하네스 파일 줄바꿈 | 통과 | LF 정책과 일치 |

실행한 핵심 명령은 다음과 같다.

```powershell
node --test .codex/hooks/agentdeck-hook.test.mjs .codex/harness-contract.test.mjs
node .codex/harness-doctor.mjs --live
```

Claude Hook 정책 테스트와 셸 구문 검사도 별도로 실행했다.

### 3.2 정상으로 확인된 계약

- Claude 역할 9개와 Codex custom agent 9개가 일대일로 대응한다.
- Codex 스킬 래퍼 8개는 모두 실제 Claude 정본 워크플로를 가리킨다.
- `agents.max_depth = 2`는 루트 → coordinator → Worker 구조와 일치한다.
- 모든 SubAgent 권한 프로필에 비밀 파일 거부 규칙이 있다.
- Codex Hook 정의는 현재 공식 Hook 형식과 맞고 digest도 유효하다.
- `.codex/state/**`와 `.claude/state/**`는 분리되어 있다.
- Hook 실행기와 관련 파일은 LF 줄바꿈을 유지한다.

## 4. 높은 우선순위 발견 사항

### H1. Codex 역할별 권한이 실제 쓰기 경계로 분리되지 않음

#### 근거

- `AGENTS.md:58`, `AGENTS.md:67`, `AGENTS.md:141`은 역할별 custom permission profile이 실제 권한 경계를 담당한다고 설명한다.
- `.codex/config.toml:33-46`의 구현 Worker 프로필들은 모두 같은 `agentdeck-workspace`를 확장하며, 핵심 차이는 비밀 파일 거부에 머문다.
- `.codex/agents/main-process.toml:5`
- `.codex/agents/agent-backend.toml:5`
- `.codex/agents/renderer.toml:5`
- `.codex/agents/shared-ipc.toml:5`
- `.codex/agents/qa.toml:5`
- 위 다섯 역할은 문서상 서로 다른 폴더만 써야 하지만 실제 프로필은 교차 도메인 쓰기를 충분히 차단하지 않는다.
- Secretary는 반대 방향으로 너무 좁다. `.codex/config.toml:48-58`은 read-only 기반에 Phase·보고서·CHANGELOG 쓰기만 허용한다.
- `.codex/agents/secretary.toml:2`, `.codex/agents/secretary.toml:12`는 Secretary가 stage·commit·build를 담당한다고 설명하지만 현재 프로필은 `.git`과 일반 빌드 출력 쓰기를 허용하지 않는다.
- doctor의 권한 canary는 `cmd /c ver` 중심이어서 역할별 허용·거부 파일 쓰기를 기능적으로 검증하지 않는다.

#### 영향

- Codex: Worker가 자기 도메인 밖 제품 파일을 수정해도 프로필이 이를 일관되게 막는다고 보장하기 어렵다.
- Claude: 직접 영향은 작지만, 공용 문서가 선언하는 “역할별 실제 경계”와 Codex 구현 사이에 의미 차이가 생긴다.

#### 권고

1. Worker별로 허용 경로가 다른 permission profile을 만든다.
2. Secretary의 실제 책임을 둘 중 하나로 결정한다.
   - gate·commit까지 담당한다면 필요한 명령과 `.git` 접근을 최소 범위로 허용한다.
   - 현재 권한을 유지한다면 문서에서 stage·commit 책임을 제거하고 루트의 사람 게이트 절차를 명시한다.
3. doctor에 역할별 실제 파일 쓰기 허용·거부 canary를 추가한다.

### H2. Claude `coordinator`에 위임 도구가 없음

#### 근거

- `.claude/agents/coordinator.md:4`의 도구 목록은 `Read`, `Glob`, `Grep`, `Bash`뿐이다.
- 같은 파일의 `.claude/agents/coordinator.md:15-17`, `:23`은 coordinator가 Worker, reviewer, plan-auditor를 호출하도록 요구한다.
- `.claude/skills/work-run/SKILL.md:11`도 Agent 위임을 전제로 한다.

#### 영향

- Claude: coordinator가 문서에 정의된 핵심 책임을 실제로 수행하지 못할 수 있다.
- Codex: 별도 custom agent 체계라 직접 장애는 아니지만, Claude 정본과 Codex 호환 계층의 동작 대칭성이 깨진다.

#### 권고

- Claude 버전에서 실제 SubAgent 호출에 필요한 Agent 도구를 coordinator 허용 목록에 추가한다.
- 최소 smoke test로 coordinator → 읽기 전용 reviewer 1회 호출을 검증한다.

### H3. Supervisor·Secretary 작업 절차가 일부 문서에 반영되지 않음

#### 근거

- 현재 정본 방향은 `CLAUDE.md:65`, `AGENTS.md:131`의 gate·commit·pin·운영 문서 작업을 Secretary에 위임하는 구조다.
- 그러나 `.claude/skills/work-run/SKILL.md:14`, `:17-20`, `:58`, `:68`, `:74`, `:97`에는 루트가 gate와 commit을 직접 수행하는 오래된 흐름이 남아 있다.
- `.claude/commands/refactor-sweep.md:65`, `:67-70`, `:179`도 같은 드리프트가 있다.
- Worker 역할 파일도 결과로 commit을 기대한다.
  - `.claude/agents/main-process.md:67`
  - `.claude/agents/agent-backend.md:60`
  - `.claude/agents/renderer.md:59`
  - `.claude/agents/shared-ipc.md:55`
  - `.claude/agents/qa.md:53`
- `.claude/agents/coordinator.md:57`, `:69-71`에는 coordinator가 gate·commit hash를 다루는 문장이 남아 있다.
- `00.Documents/ADR.md:60`의 “단순 작업은 main 직접 수행” 규칙도 폐기 또는 대체 표시가 없다.

#### 영향

- Claude: 같은 요청에 어떤 워크플로가 선택되느냐에 따라 root, Worker, coordinator, Secretary 중 실행 주체가 달라질 수 있다.
- Codex: `AGENTS.md`가 Supervisor 규칙을 보완하지만, 공용 정본을 따라갈 때 충돌 해석 비용이 생긴다.

#### 권고

- 먼저 하나의 책임표를 정본으로 확정한 뒤 관련 skill·command·role·ADR을 같은 변경에서 동기화한다.
- commit 주체를 변경한다면 실제 권한 프로필도 동시에 맞춘다.
- 과거 ADR은 삭제하지 말고 `Superseded by` 표기로 역사성을 보존한다.

### H4. Claude Harness 봉인이 내장 JavaScript 쓰기를 놓칠 수 있음

#### 근거

- `.claude/settings.json:18`은 `Bash(node *)`를 허용한다.
- `.claude/settings.json:48-54`의 하네스 보호 deny는 주로 `Edit`와 `Write` 도구를 대상으로 한다.
- `.claude/hooks/_lib/shell-policy.mjs:179-184`는 알려진 쓰기 명령이나 redirection을 찾지 못하면 조기에 `null`을 반환한다.
- 따라서 `node -e`에서 `fs.writeFileSync`, `renameSync` 같은 API를 사용해 하네스 파일을 바꾸는 경로를 놓칠 수 있다.
- Codex 쪽은 `.codex/hooks/agentdeck-hook.mjs:308-309`에 `embeddedWrite` 탐지가 있고 `.codex/hooks/agentdeck-hook.test.mjs:205-206`에 회귀 테스트가 있다.

#### 영향

- Claude: Harness 봉인이 문서에 설명된 수준보다 약하다. 유지보수 모드 없이도 특정 Bash 경로가 봉인을 우회할 가능성이 있다.
- Codex: 해당 패턴은 이미 방어하지만, 두 엔진의 공용 정책 의미가 달라진다.

#### 권고

- Codex 구현을 그대로 복사하지 말고 Claude Hook payload 규약에 맞춰 내장 쓰기 탐지를 추가한다.
- `node -e`, `node --eval`, PowerShell 내장 쓰기, 중첩 셸의 양성·음성 회귀 테스트를 함께 추가한다.
- Hook은 보조 경계이므로 하네스 보호 파일의 실제 권한 정책도 계속 유지한다.

## 5. 중간 우선순위 발견 사항

### M1. TDD Hook은 RED 실행 자체를 증명하지 않음

현재 TDD(Test-Driven Development, 테스트 주도 개발) Hook은 테스트 파일 존재 여부, 동일 패치 포함 여부 같은 대리 지표를 검사한다. 실패하는 테스트를 먼저 실행했다는 사실까지 증명하지는 않는다.

권고: Hook 메시지와 문서에서 “TDD 순서 보조”라고 정확히 표현하고, 필요한 Phase에서는 RED 명령과 결과를 DONE 증거로 남긴다.

### M2. 정책·명령 문서의 오래된 표현

대표적인 드리프트는 다음과 같다.

- `00.Documents/ADR.md:265`의 Hook advisory 표현
- `.claude/policies/pin-and-done.md:48`, `:142`와 `.claude/policies/grade-and-risk.md:67`, `:69`의 pin 갱신 책임 차이
- `.claude/commands/harness-review.md:55`와 `.claude/policies/loop-driver.md:106`의 역할 수 8개 표기. 현재는 9개다.
- `.claude/policies/harness.md:19`, `pin-and-done.md:45`, `doc-thresholds.md:20`, `:95`의 오래된 `/work:plan` 호출명
- `refactor-sweep`의 “자는 동안” 표현과 현재 attended-only, 즉 사용자가 지켜보는 실행만 허용하는 정책의 충돌

권고: 의미 변경과 단순 명칭 정리를 분리하고, 정본 우선순위에 따라 한 번에 동기화한다.

### M3. Reviewer·Plan Auditor 호출 조건이 서로 다름

`AGENTS.md`, review-tiering 정책, reviewer 역할 파일, `work-run` 스킬의 호출 조건이 완전히 같지 않다. 특히 공유 계약, preload, `AgentBackend`, 위험 깃발, 계획 변경의 필수 리뷰 조건을 하나의 표로 통일할 필요가 있다.

### M4. 위임 프롬프트 5개 필드가 일관되게 사용되지 않음

`AGENTS.md`는 작업, 입력 자산, 변경 대상, 완료 조건, 출력의 다섯 필드를 요구한다. 실제 Secretary 호출 예시는 3개 필드, reviewer 호출 예시는 4개 키 등으로 축약된 경우가 있다.

권고: 모든 호출 예시를 공통 템플릿으로 바꾸고 정적 계약 테스트에서 필드 존재를 검사한다.

### M5. Phase·DONE 경로와 메타데이터 드리프트

- `pin-and-done` 정책과 템플릿은 `01.Phases/<owner>/M{N}-{slug}` 형식을 설명하지만 실제 저장소는 `01.Phases/{milestone-slug}` 형태가 섞여 있다.
- Phase 템플릿의 위험 분류에는 `shared-contract`, `harness` 같은 현재 위험 깃발이 빠져 있다.
- “main 직접 수행” 같은 이전 책임 모델도 일부 템플릿에 남아 있다.

권고: 기존 산출물은 레거시로 보존하고 신규 Phase부터 적용할 단일 경로·메타데이터 스키마를 정한다.

### M6. 위험 명령 탐지의 중첩 셸·인코딩 공백

현재 위험 명령 탐지는 일반적인 명령과 redirection을 잘 막지만, 여러 겹의 셸 인용, PowerShell `EncodedCommand`, 실행 문자열 조립 같은 경로는 완전하지 않다.

권고: 실사용 가능성이 높은 우회 패턴부터 회귀 테스트를 추가하되, Hook만을 보안 경계로 간주하지 않는다.

## 6. 문서 형식 비용 실측

하네스 산출물의 현재 크기를 표본으로 확인했다.

- Codex work-pin: 1개, 9줄
- DONE 문서: 11개
- DONE 평균: 69줄
- DONE 최소/최대: 41줄 / 165줄
- 정확한 `## 5단계 보고` 제목 사용: 2개
- 엄격한 `gate_version: 1` 적용: H1 산출물 1개
- Phase 후보: 99개
- Phase 평균: 약 66.6줄
- Phase 중앙값: 71줄
- complex/large 분류: 47/99
- H1의 엄격한 Phase 산출물: Markdown 81줄 + HTML 50줄 = 131줄

현재 형식은 추적성과 복구 능력은 좋지만, 작은 작업에도 동일한 서식이 적용되면 작성 비용이 커질 수 있다. 레거시 문서를 일괄 변환하기보다 신규 작업부터 위험 등급에 따라 필수 필드를 차등화하는 편이 안전하다.

## 7. `multi_agent_v2` 실험

### 7.1 확인한 환경

- 로컬 Codex CLI: `0.144.0`
- CLI 알림상 사용 가능한 업데이트: `0.144.1`
- `multi_agent`: stable, 활성화됨
- `multi_agent_v2`: under development, 기본 비활성화
- 전역 `~/.codex/config.toml`에는 `[features.multi_agent_v2]`가 없었다.
- 프로젝트 `.codex/config.toml`에는 안정 기능인 `[features] multi_agent = true`가 있다.

### 7.2 X 게시물의 설정 조각 검증

확인한 설정 조각은 다음과 같다.

```toml
[features.multi_agent_v2]
hide_spawn_agent_metadata = false
tool_namespace = "agents"
```

두 필드는 실제 CLI가 인식했으며 strict config 파싱도 통과했다. 하지만 Codex CLI `0.144.0`에서는 이 조각만으로 `multi_agent_v2`가 활성화되지 않았다. 명시적인 `enabled = true`가 필요했다.

실험에서 인식된 형태는 다음과 같다.

```toml
[features.multi_agent_v2]
enabled = true
hide_spawn_agent_metadata = false
tool_namespace = "agents"
max_concurrent_threads_per_session = 2
```

그러나 AgentDeck 프로젝트에 그대로 적용하면 현재 설정과 충돌한다.

```text
Error: agents.max_threads cannot be set when features.multi_agent_v2 is enabled
```

원인은 프로젝트 `.codex/config.toml:13`의 기존 `agents.max_threads = 6`이다. 따라서 v2를 시험하려면 기존 안정형 multi-agent 동시성 설정과 v2 설정을 함께 설계해야 한다.

### 7.3 실제 SubAgent 생성 실험

영구 설정을 바꾸지 않고 명령행 오버라이드만 사용했다.

#### 실험 A: Sol 루트, 동시성 1

- 실제 spawn 이벤트가 관찰되지 않았다.
- wait 결과도 비어 있었다.
- 에이전트의 자기보고는 실제 이벤트와 일치하지 않아 증거로 채택하지 않았다.
- 사용량 표본: input 35,060 / cached 30,976 / output 191 / reasoning 78

#### 실험 B: Luna 루트, 동시성 2, v2 활성화

- 실제 `spawn_agent` 이벤트가 발생했다.
- 생성된 child 식별자: `019f4c5e-4530-7fd0-8956-aef4b0454c01`
- wait가 완료되었고 child가 `PONG`을 반환했다.
- 루트 에이전트는 `multi_agent_v1__spawn_agent` 이름과 model 인자 전송을 자기보고했다.
- 사용량 표본: input 33,752 / cached 8,960 / output 412 / reasoning 166

중요한 한계가 있다. 이벤트에는 child가 실제로 사용한 모델의 독립적인 telemetry, 즉 실행 계측 정보가 노출되지 않았다. 따라서 model 인자가 전달된 정황은 확인했지만 child가 정말 Luna로 실행되었다고 독립적으로 증명하지는 못했다.

두 사용량 표본은 프롬프트, 캐시, 실제 spawn 여부가 달라 직접적인 모델 효율 벤치마크로 사용하면 안 된다.

### 7.4 판단

- X 게시물의 문제 제기는 방향상 타당하다. 현재 안정형 multi-agent에서 탐색용 작은 모델을 명시적으로 선택하기 어렵다는 불편은 재현 가능한 문제 영역이다.
- 게시물의 설정 조각은 Codex CLI `0.144.0` 기준으로 불완전하다. `enabled = true`가 빠져 있다.
- `multi_agent_v2`는 실험 기능이며 AgentDeck의 기존 `agents.max_threads`와 충돌한다.
- 이 기능은 모델 인자를 보낼 수 있는 통로를 제공하지만, Fable식 Advisor/Executor 정책을 자동으로 완성하지는 않는다. 역할 라우팅, 모델 선택 기준, 결과 통합 규칙은 별도로 필요하다.
- 현 시점에는 전역 설정에 바로 적용하지 말고, CLI 업데이트 후 격리된 프로젝트 또는 임시 오버라이드에서 다시 검증하는 편이 안전하다.

## 8. Claude에서 이어갈 권장 순서

### 1단계: 권한 계약부터 확정

- Codex Worker별 허용 경로를 분리한다.
- Secretary가 gate·commit을 실제로 담당할지 결정한다.
- doctor에 역할별 허용·거부 쓰기 canary를 추가한다.

이 단계는 문서만 고치는 작업이 아니라 실제 권한 모델을 바꾸므로 사용자 승인과 Harness 유지보수 모드가 필요하다.

### 2단계: Claude coordinator 실행 가능성 복구

- coordinator에 Agent 위임 도구를 추가한다.
- coordinator → reviewer smoke test를 추가한다.

### 3단계: Supervisor 워크플로 동기화

- `CLAUDE.md`의 현재 책임표를 기준으로 `work-run`, `refactor-sweep`, Worker, coordinator, ADR을 맞춘다.
- 변경된 책임과 실제 권한이 일치하는지 함께 검증한다.

### 4단계: Claude 내장 쓰기 봉인 강화

- Claude shell policy에 embedded write 탐지를 추가한다.
- 정상 `node` 읽기 명령을 과도하게 차단하지 않는 음성 테스트도 함께 둔다.

### 5단계: 중간 우선순위 문서 정리

- 역할 수, 명령 이름, pin 책임, reviewer 조건, 5개 필드 위임 템플릿, Phase/DONE 경로를 현재화한다.
- 과거 Phase와 DONE은 소급 변환하지 않는다.

### 6단계: `multi_agent_v2` 재실험

- Codex CLI `0.144.1` 이상에서 기능 상태와 공식 문서를 다시 확인한다.
- `agents.max_threads` 제거 또는 대체가 기존 하네스에 미치는 영향을 먼저 검토한다.
- root 모델, child 모델 인자, 실제 child telemetry를 구분해 기록한다.
- 사용량 비교는 동일 프롬프트, 동일 캐시 조건, 동일 동시성으로 다시 측정한다.

## 9. 사람 게이트와 남은 위험

다음 작업은 자동으로 진행하지 않는다.

- Harness 설정·Hook·역할·스킬 정본 수정
- 권한 프로필 변경
- `multi_agent_v2` 전역 또는 프로젝트 영구 활성화
- push, PR 생성·머지

Harness를 수정할 때는 사용자가 변경 범위를 승인한 뒤 Codex 부모 프로세스를 `AGENTDECK_HARNESS_MAINTENANCE=1` 환경으로 새로 시작해야 한다. Bootstrap 또는 Hook 실행기 자체를 고치는 경우에는 프로젝트 Hook 신뢰·활성화 절차와 digest cachebuster 갱신도 함께 수행한다.

이번 결과에서 가장 큰 잔여 위험은 자동 테스트가 통과했음에도 선언된 역할 책임과 실제 도구·권한이 일부 맞지 않는다는 점이다. 다음 수정은 문구 정리보다 H1~H4의 실행 가능성과 권한 경계를 먼저 다루는 것이 좋다.

## 10. 참고 자료

- OpenAI Codex config reference: <https://learn.chatgpt.com/docs/config-file/config-reference#configtoml>
- OpenAI Codex Hooks 문서: <https://learn.chatgpt.com/docs/hooks#where-codex-looks-for-hooks>
- 프로젝트 진입 규칙: `AGENTS.md`
- 공용 헌법 정본: `CLAUDE.md`
- Claude Harness 점검 절차: `.claude/commands/harness-review.md`
- Codex 호환 계층 설명: `.codex/README.md`
