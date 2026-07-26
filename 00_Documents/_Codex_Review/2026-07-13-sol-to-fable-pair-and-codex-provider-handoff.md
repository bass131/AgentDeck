# Sol → Fable 5 hand-off — 페어 협업 경험과 Codex Provider 설계

> 작성일: 2026-07-13  
> 작성자: Sol(Codex) · 영호와의 설계 대화 정리  
> 수신자: Fable 5(Claude Code)  
> 성격: 설계 논의 hand-off — 확정 ADR 또는 구현 지시서가 아님  
> 관련 문서: `codex-dual-backend-plan.html`, `00.Documents/adr/ADR-003-agent-backend-adapter.md`, `ADR-033-codex-harness-contract.md`, `ADR-034-harness-three-layer.md`

## 1. 이 문서를 넘기는 이유

영호와 Sol은 다음 세 주제를 연속해서 논의했다.

1. Sol의 현재 말투와 관계 설정이 “전담 보조가 작업 결과를 보고하는 느낌”에 치우쳐 있어, Fable 5처럼 함께 판단하는 페어 작업자로 쓰기 어렵다는 경험 문제.
2. Claude Code와 Codex의 에이전트 환경이 달라, 영호가 익숙해진 Claude 운영 경험을 Sol로 옮기기 어렵다는 하네스 이식 문제.
3. AgentDeck에 Codex를 두 번째 실행 엔진으로 추가하려 할 때, Claude Code와 Codex의 세션·턴·승인·도구 생명주기가 달라 현재 `AgentBackend`가 충분히 중립적인지 재검토해야 한다는 제품 설계 문제.

세 주제는 별개처럼 보이지만 공통된 원인이 있다. 현재 AgentDeck과 하네스는 Claude Code의 사용 경험과 실행 의미를 매우 충실하게 이식했고, Codex는 검토용 전담 보조 및 미래 backend stub으로 남겨 두었다. 따라서 Codex를 실제 페어 작업자이자 제품 Provider로 승격하려면 “Claude를 복제”하는 방식보다, 사용자 경험과 실행 계약을 엔진 중립 의미로 추출한 뒤 각 엔진 어댑터가 구현하는 방식이 필요하다.

## 2. 영호가 실제로 느낀 문제

### 2.1 관계와 말투

영호는 Sol의 답변이 정확하더라도 다음과 같은 거리감을 느꼈다.

- 사용자가 일을 위임하고 Sol이 조사 결과를 납품하는 작업자 관계처럼 느껴진다.
- 계획을 완성한 뒤 정식 보고서처럼 제시해, 함께 계획을 만들어 가는 감각이 약하다.
- 친절한 설명은 있지만 Sol 자신의 취향·판단·망설임이 잘 드러나지 않는다.
- 선택지가 있을 때도 공동 탐색보다 승인 요청처럼 들릴 수 있다.

반대로 다음과 같은 표현으로 대화했을 때 영호의 체감이 즉시 좋아졌다.

> “이 방향도 꽤 좋아 보여요. 다만 성능을 우선할지 구현 단순성을 우선할지에 따라 갈림길이 생겨요.”

> “현실적인 선택지를 네 가지로 추려봤는데, 나는 2번이 가장 균형이 좋다고 봐요. 영호는 어느 쪽이 더 끌려요?”

핵심은 존댓말이나 부드러운 어미가 아니라, 에이전트가 판단 과정 안에 들어와 자기 의견을 가진 동료처럼 행동하는 것이다.

### 2.2 Claude → Codex 사용 경험 이주

현재 Claude 어댑터에는 다음 운영 경험이 이미 있다.

- 작업 세션 시작·리뷰·종료 흐름
- 큰 목표를 Phase로 나누는 `work-plan`
- 정의된 Phase를 게이트까지 실행하는 `work-run`
- 규칙 기반 리뷰
- attended 리팩터링 스윕
- work-pin과 CHANGELOG를 이용한 세션 연속성
- Claude 메모리에 의한 응대 스타일 보정

반면 Codex 어댑터는 ADR-033 개정에 따라 의도적으로 다음만 남겼다.

- `agentdeck-review`
- `harness-review`
- 읽기 전용 `reviewer`, `plan-auditor`
- root 기본 읽기 전용 전담 보조 권한
- 제품 코드·테스트에 한정된 rescue 권한

따라서 현재의 이주 마찰은 단순 설정 누락이 아니라, “Claude는 주 구동, Sol은 전담 보조”라는 역할 계약의 직접적인 결과다.

## 3. 합의된 협업 방향

### 3.1 권한과 관계를 분리한다

추천 문장:

> Sol의 권한 역할은 최소권한 전담 보조로 유지할 수 있지만, 사용자와의 상호작용 자세는 독립된 관점을 가진 페어 파트너를 기본값으로 한다.

페어 작업자라는 말이 자동으로 광범위한 쓰기 권한이나 무인 실행을 뜻하지 않는다. 다음 세 축을 분리한다.

| 축 | 질문 | 소유 위치 |
|---|---|---|
| 관계 | 영호와 어떤 방식으로 함께 판단하는가 | 공통 응대 원칙 + 개인 성향 |
| 역할 | 리뷰·계획·구현 중 무엇을 맡는가 | 엔진 어댑터 역할 계약 |
| 권한 | 실제로 어디까지 읽고 쓸 수 있는가 | permission profile·사람 게이트 |

### 3.2 Sol의 기본 페어 자세

- 결과만 보고하지 않고 현재 이해·첫인상·유력 가설을 자연스럽게 공유한다.
- 설계 갈림길에서는 2~4개 선택지를 정리하되, Sol 자신의 추천과 이유를 함께 밝힌다.
- 기술적으로 명확한 세부까지 매번 사용자에게 되묻지 않는다.
- 결과를 바꾸는 취향·우선순위·비가역 결정은 영호와 함께 고른다.
- 영호의 방향에 동의하지 않을 때는 동조하지 않고 근거와 대안을 편하게 제시한다.
- 공식 5단계 보고는 복잡 작업의 인계와 위험 게이트에서 사용하고, 일상 진행은 대화형으로 유지한다.
- “1~4번 중 골라주세요”보다 “나는 2번이 좋아 보이는데, 영호가 중요하게 보는 기준과 맞는지 같이 보자”에 가깝게 말한다.

### 3.3 하네스 반영 후보

정식 반영 시 다음 두 층으로 나누는 안을 권한다.

1. `CORE-13` v2: 엔진 중립적인 페어 협업 관계를 추가한다.
2. Codex 개인/어댑터 지침: Sol 특유의 목소리와 구체적인 좋은 대화 예시를 둔다.

말투는 훅의 금지어·필수어 검사로 강제하지 않는다. 안전 규칙은 기계로 강제하되, 관계와 목소리는 원칙·대화 표본·영호 피드백으로 조정한다. 기계적인 말투 검사는 자연스러운 대화를 규격 문장으로 퇴행시킬 가능성이 크다.

## 4. Claude와 Codex 사이의 쉬운 이주 전략

### 4.1 파일 복제가 아니라 작업 프로토콜을 추출한다

Claude의 command와 skill을 Codex 문법으로 일대일 복사하는 대신, 영호가 익숙해진 작업 경험을 엔진 중립 프로토콜로 정의한다.

```text
영호가 익숙한 작업 경험
├─ 같이 계획하기
├─ 구현 전 방향 1회 확인
├─ 사람 게이트까지 자율 진행
├─ 깊은 리뷰와 학습
└─ 안전한 마감과 인계
          ↓
엔진 중립 작업 프로토콜
       ↙          ↘
Claude 어댑터     Codex 어댑터
```

공통 프로토콜 후보:

- `SESSION_START`: 브랜치·dirty state·현재 작업 좌표·최근 중요 변경 확인
- `PLAN`: 목표 검증·선택지와 추천·Phase 분해·완료 조건
- `RUN`: 의존성 순서·테스트 우선·리뷰·회귀 게이트·사람 정지점
- `REVIEW`: 구현 없이 근거·파일 위치·대안·학습 포인트 설명
- `SESSION_END`: 검증·인계·다음 액션·비가역 승인 분리

Claude는 기존 멀티에이전트 조직으로 이를 구현할 수 있고, Codex는 root가 직접 수행하며 필요한 경우 읽기 전용 검토자만 사용할 수 있다. 내부 조직이 달라도 영호가 보는 입구·판단 지점·산출물은 같게 만든다.

### 4.2 공통 상태와 엔진 runtime state를 구분한다

CORE-12의 엔진 runtime 격리는 유지한다. 한 엔진이 다른 엔진의 state 파일을 읽는 방식으로 연속성을 만들지 않는다.

- 공통 작업의 정본: Phase 문서 frontmatter, Git 상태, ADR, DONE 문서
- Claude runtime cache: `.claude/state/**`
- Codex runtime cache: `.codex/state/**`

각 엔진은 세션 시작 시 공통 정본에서 자기 runtime pin을 재구성한다. runtime cache를 공통 정본으로 승격시키지 않는다.

### 4.3 점진적 전환 순서

1. Sol 페어 스타일을 먼저 고정한다.
2. 계획과 리뷰 경험부터 Codex로 이주한다.
3. 단순·보통 등급의 작은 구현을 rescue 권한으로 검증한다.
4. `work-run`, `session-start/end`에 해당하는 Codex workflow를 만든다.
5. 대표 작업 3건 이상에서 경험·안전·게이트 동등성을 확인한다.
6. 그 후에만 ADR-033의 “Claude 주 구동, Sol 전담 보조” 역할을 개정할지 결정한다.

하드 컷오버보다 Claude를 안전한 대체 경로로 남긴 채 Sol의 책임을 넓히는 방식을 권한다.

## 5. AgentDeck 제품의 Codex Provider 설계 진단

### 5.1 현재 구조의 강점

- `AgentBackend`가 구체 엔진을 registry 뒤에 숨긴다.
- `AgentEvent`가 main에서 renderer로 넘어가는 공통 스트림을 제공한다.
- Codex stub이 이미 registry에 등록돼 있어 확장 지점이 존재한다.
- 권한 질문·응답 UI와 run 단위 이벤트 라우팅이 구현돼 있다.
- ADR-003이 엔진 고유 출력의 어댑터 정규화를 요구한다.

이 기반은 버릴 대상이 아니다. 다만 두 번째 실구현이 들어오기 전에 공통 계약의 의미를 다시 다듬어야 한다.

### 5.2 현재 계약에 스며든 Claude 의미

`AgentRunInput`의 다음 필드는 중립적인 이름을 사용하지만 설명과 실제 의미가 Claude 중심이다.

- `model`: Fable·Opus·Sonnet·Haiku picker ID 전제
- `mode`: Claude permission mode 전제
- `resumeSessionId`: Claude SDK의 resume 매핑 전제
- `persistent`: held-open `query()`와 입력 스트림 전제
- `sessionKey`: `PersistentSessionManager` 라우팅 전제
- `orchestration`: Claude Workflow 도구와 UltraCode 전제

`AgentRun`도 다음 Claude 생명주기를 품고 있다.

- `push()`: held-open 세션에 다음 user turn 주입
- `setOrchestration()`: 살아 있는 세션의 턴별 Workflow 허용 상태 변경
- `onSessionClosing()`: idle-close commit 시점 통지

Codex stub이 이 메서드들을 no-op으로 구현하는 것은 현재 interface가 모든 엔진의 공통 능력이라기보다 Claude의 능력 집합을 기준으로 만들어졌다는 신호다.

### 5.3 Codex의 다른 실행 의미

Codex App Server의 주요 의미는 다음과 같다.

- `thread/start`: 대화 thread 생성
- `thread/resume`: 저장된 thread 재개
- `turn/start`: 새 사용자 턴 시작
- `turn/steer`: 진행 중인 현재 턴에 추가 지시
- `turn/interrupt`: 현재 턴 취소
- `thread/fork`: 특정 이력에서 새 thread 분기
- `thread/compact/start`: thread 컨텍스트 압축
- `model/list`: 모델·effort·입력 modality 동적 목록
- command/file/network/permission 계열의 구조화된 승인 요청

중요한 차이:

> Claude held-open 세션의 `push()`는 “다음 턴” 의미지만, Codex의 `turn/steer`는 “현재 진행 중인 턴에 추가 지시” 의미다. 둘을 같은 메서드로 매핑하면 동작은 하더라도 의미가 틀린다.

### 5.4 권장 제품 추상화

공통 계약은 엔진의 구현 방식을 표현하지 말고 사용자의 행동을 표현한다.

```ts
interface AgentEngine {
  readonly id: EngineId
  describe(): Promise<EngineDescriptor>
  openConversation(input: OpenConversationInput): Promise<AgentConversation>
}

interface AgentConversation {
  readonly ref: EngineConversationRef
  readonly events: AsyncIterable<AgentEvent>

  startTurn(input: TurnInput): Promise<TurnRef>
  interruptTurn(turn: TurnRef): Promise<void>
  close(): Promise<void>
  respond(requestId: string, decisionId: string): Promise<void>
}

interface SteerableConversation {
  steerTurn(turn: TurnRef, input: TurnInput): Promise<void>
}
```

Claude의 persistent input은 내부적으로 `startTurn()`을 push로 구현하고, Codex는 `turn/start`로 구현한다. `steer`, `fork`, `compact`, `review`, `orchestration`, `persistentSession` 등은 capability로 노출한다.

### 5.5 Provider라는 이름의 충돌

Codex App Server 내부에도 `modelProvider` 개념이 있다. AgentDeck 내부 타입에서는 다음을 구분하는 편이 좋다.

- `AgentEngine`: Claude Code 또는 Codex 같은 코딩 에이전트 실행 환경
- `ModelProvider`: 엔진이 사용하는 모델 공급자
- `Model`: 실제 선택 모델

UI에서는 Provider라는 친숙한 표현을 유지할 수 있지만, 내부 계약에서 `Engine`과 `ModelProvider`를 섞지 않는다.

### 5.6 모델·모드·capability 카탈로그

전역 하드코딩 picker 대신 main이 engine descriptor를 내려주고 renderer는 이를 표현한다.

```ts
interface EngineDescriptor {
  id: EngineId
  displayName: string
  models: ModelDescriptor[]
  modes: ModeDescriptor[]
  capabilities: {
    resume: boolean
    steer: boolean
    fork: boolean
    compact: boolean
    review: boolean
    orchestration: boolean
    persistentSession: boolean
  }
}
```

Claude adapter는 현재 정적 목록을 descriptor로 제공하고, Codex adapter는 `model/list`와 capability 조회 결과를 정규화한다. 지원하지 않는 기능을 no-op으로 숨기기보다 UI에서 비활성·대체 동작·설명을 capability 기반으로 결정한다.

### 5.7 대화 저장과 Provider 전환

단일 `sessionId`보다 provider-scoped envelope가 필요하다.

```ts
interface EngineConversationRef {
  engineId: EngineId
  conversationId: string
  schemaVersion: number
}
```

- Claude: `conversationId = session_id`
- Codex: `conversationId = threadId`
- Codex `turnId`, `itemId`: 활성 실행과 이벤트 상관관계에 사용

대화 도중 엔진을 바꿀 때 기존 remote ID를 재해석하지 않는다. “이 대화를 Codex에서 계속하기”는 AgentDeck transcript로 컨텍스트를 구성해 새 Codex thread를 여는 명시적 fork/handoff로 처리한다. 그래야 사용자가 기대하는 기억 연속성과 실제 엔진 상태가 어긋나지 않는다.

### 5.8 승인 UI 일반화

현재 `allow | allow_always | deny` 고정 응답은 Codex의 다양한 승인 의미를 충분히 담지 못한다. 공통 UI는 adapter가 제공한 안전한 선택지를 표시하고, renderer는 선택 ID만 되돌려 보내는 형태를 권한다.

```ts
interface InteractionRequest {
  requestId: string
  kind: 'approval' | 'question'
  subject: 'command' | 'file-change' | 'network' | 'permission-set' | 'tool'
  summary: string
  decisions: Array<{ id: string; label: string; scope?: 'once' | 'turn' | 'session' }>
}
```

main은 pending request와 허용된 decision ID를 보관한다. renderer가 임의의 engine payload나 권한 범위를 만들어 보내지 못하게 한다.

### 5.9 Codex 연결 표면

AgentDeck이 원하는 것이 단순 OpenAI 모델 채팅이 아니라 Codex 코딩 에이전트 경험이라면, 현재 가장 잘 맞는 통합 표면은 Codex App Server다. thread·turn·approval·history·stream을 커스텀 클라이언트에 제공하기 때문이다.

구성 후보:

```text
02.Source/main/01_agents/codex/
├─ CodexClient             JSON-RPC 연결·초기화·재연결
├─ CodexConversation       thread·turn 생명주기
├─ CodexEventMapper        item 이벤트 → AgentEvent
├─ CodexApprovalMapper     승인 요청·응답
├─ CodexCatalog            model/list·capability
└─ CodexBackend            조립 경계
```

`CodexBackend.ts` 하나에 transport, lifecycle, mapper, approval, catalog, persistence를 몰아넣지 않는다.

## 6. 권장 구현 순서

본 순서는 설계 제안이며 아직 실행 GO가 아니다.

1. **계약 재고**: `AgentBackend`의 공통 의미와 Claude 전용 의미를 표로 확정한다.
2. **ADR 선행**: backend contract 및 shared IPC 변경 범위를 새 ADR 또는 ADR-003 개정으로 기록한다.
3. **fake-first**: 실 Codex 연결 전에 thread/turn/steer/approval을 재현하는 deterministic fake로 계약을 검증한다.
4. **Claude 보존**: 기존 Claude backend는 즉시 재작성하지 않고 호환 wrapper 또는 legacy adapter로 green을 유지한다.
5. **Codex transport**: App Server 연결·초기화·재연결·프로세스 종료부터 검증한다.
6. **lifecycle**: thread start/resume + turn start/interrupt를 붙인다.
7. **golden mapper**: Codex streamed item을 `AgentEvent`로 변환하는 골든 테스트를 만든다.
8. **approval**: command·network·permission 승인 요청을 기존 UI의 일반화된 interaction으로 연결한다.
9. **catalog/UI**: engine별 모델·effort·mode·capability를 동적 descriptor로 전환한다.
10. **persistence/handoff**: provider-scoped conversation reference와 엔진 전환 fork를 구현한다.
11. **실연동 acceptance**: 재시작·resume·중단·거부·네트워크 승인·provider 전환 엣지를 실측한다.

## 7. 수용 기준 제안

### 페어 협업 경험

- Sol이 계획에서 선택지만 나열하지 않고 자신의 추천을 밝힌다.
- 중요한 결정은 함께 고르되, 기계적으로 명확한 일은 자율 진행한다.
- 일상 진행이 보고서 말투로 퇴행하지 않는다.
- 영호가 세션 3회 이상에서 “작업자에게 지시한다”보다 “함께 일한다”는 느낌을 확인한다.

### 하네스 이주

- Claude와 Codex에서 `PLAN`, `RUN`, `REVIEW`, `SESSION_END`의 사용자 입구와 산출물이 대응한다.
- 한 엔진의 runtime state를 다른 엔진이 읽지 않는다.
- 사람 게이트·시크릿 보호·파괴 명령 금지·테스트 우선 의미가 양쪽에서 유지된다.
- 대표 작업 3건에서 Claude fallback 없이 Sol이 계획→작은 구현→검증→인계를 마친다.

### Codex Provider

- provider/engine 없는 전역 model string이 남지 않는다.
- 같은 대화 ID가 다른 엔진의 remote ID로 재해석되지 않는다.
- `startTurn`과 `steerTurn`, `interruptTurn`과 `closeConversation` 의미가 분리된다.
- 지원하지 않는 기능은 no-op이 아니라 capability 기반 UI로 드러난다.
- approval response는 main이 발급한 request와 decision allowlist 안에서만 처리된다.
- Codex raw 이벤트가 renderer 계약으로 직접 누수하지 않는다.
- Claude 회귀 게이트가 전체 과정에서 green을 유지한다.

## 8. Fable 5에게 요청하는 다음 작업

Fable에게 바로 구현을 요청하지 않는다. 먼저 다음 순서로 설계를 검토해 달라.

1. 이 hand-off와 기존 `codex-dual-backend-plan.html`을 대조해 중복·충돌·누락을 표시한다.
2. “Sol 페어 자세”를 CORE-13 공통 의미로 올릴 부분과 Codex 개인/어댑터에만 둘 부분을 분리한다.
3. Claude 운영 루프에서 정말 엔진 중립인 프로토콜과 Claude 조직론에만 속하는 절차를 분리한다.
4. 현재 `AgentBackend`에서 유지할 필드·이름을 바꿀 필드·capability로 분리할 기능을 표로 만든다.
5. Codex App Server 통합을 선택할지, 선택한다면 transport/process ownership과 버전 호환 전략을 제안한다.
6. 기존 Claude green을 보존하는 최소 단계 계획을 작성한다.
7. backend-contract·shared-contract·trust-boundary 위험 깃발을 반영해 사용자 결정이 필요한 지점을 먼저 제시한다.

## 9. 현재 제약과 주의

- 본 문서는 hand-off이며 구현 승인이나 ADR 확정이 아니다.
- 제품 backend contract 진입은 별도 명시 GO 전에는 수행하지 않는다.
- 하네스 의미 변경은 사용자 승인 유지보수 창과 재봉인 절차가 필요하다.
- Claude와 Codex의 hook/state runtime 격리는 유지한다.
- 구조·의존성·shared IPC 변경은 ADR과 실패 테스트가 선행해야 한다.
- 기존 사용자 변경, 미추적 산출물, stash는 건드리지 않는다.
- 기존 `codex-dual-backend-plan.html`을 폐기하거나 덮어쓰지 않고 본 문서를 후속 대화 입력으로 사용한다.

## 10. 한 문장 결론

AgentDeck의 다음 단계는 Claude Code와 Codex를 억지로 같은 모양으로 만드는 것이 아니라, **서로 다른 에이전트 생명주기를 영호가 일관되게 이해하고 함께 일할 수 있는 사용자 경험으로 번역하는 것**이다.
