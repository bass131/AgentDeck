# Phase 20 — M4-1: 기초 + 단일 에이전트 실 실행

> 시각 셸(F9 Composer RunPicker) 위에 **실 파라미터 전달**을 연결. M4 기능 트랙의 토대.
> "대화 하나가 사용자가 고른 model/effort/mode로 실제로 돌고, 토큰 게이지가 실 usage를 표시"까지.
> 신뢰경계 CRITICAL — renderer가 보내는 model/effort/mode는 **untrusted** → main이 allowlist 검증 후에만 CLI 인자화(플래그 주입 차단).

## 근거 (claude-code-guide 권위 확인 2026-06-23 + 원본 Explore 매핑)
- `claude -p`는 `--model <alias|fullId>`, `--effort low|medium|high|xhigh|max`, `--permission-mode default|acceptEdits|plan|auto|dontAsk|bypassPermissions`, `--append-system-prompt` 지원.
- **effort는 모델 의존**: Haiku 4.5 effort 미지원 · Sonnet 4.6 xhigh 미지원 · Opus 4.8/Fable 5 max·xhigh 지원. CLI엔 `minimal` 값 없음(우리 피커엔 있음).
- **이미지 헤드리스 입력 = 미확인** → M4-2로 이연. **실시간 per-turn context 필드 = 확인 안 됨** → 게이지는 최종 result usage + 모델별 contextWindow 상수로(실시간 갱신은 후속). cache/cost 필드 불확실 → 있으면 매핑, 없으면 무시(기존 mapUsage가 이미 optional 처리).
- 현재: `AgentRunInput`=messages+workspaceRoot만 · ClaudeCodeBackend CLI args=`-p/--output-format/--verbose`만(model/effort/mode 0) · claude-stream은 result usage 이미 추출 · pickerOptions ids가 CLI와 정렬(fable/opus/sonnet/haiku, max..minimal, normal/plan/acceptEdits/auto/bypass).

## 설계 결정
1. **계약 확장은 additive·optional** (하위호환): `AgentRunRequest`(shared) += `model?: string · effort?: string · mode?: string`(피커 id 문자열). `AgentRunInput`(AgentBackend) += 동일 3필드. 미전달 시 기존 동작(CLI 기본값).
2. **CLI 인자 매핑 = 순수 모듈** `src/main/agents/run-args.ts` (electron import 0, vitest 직접). `buildRunArgs({model,effort,mode})` → `string[]`(CLI 플래그). 책임:
   - model id → `--model <id>`(alias 그대로). **미지의 id면 생략**(allowlist=KNOWN_MODELS).
   - mode id → `--permission-mode <v>` (normal→default·plan→plan·acceptEdits→acceptEdits·auto→auto·bypass→bypassPermissions). 미지면 생략.
   - effort id → `--effort <v>` **단, (a) 모델이 effort 미지원(haiku)이면 생략 (b) 값이 모델 미지원(sonnet+xhigh)이면 한 단계 낮춰 클램프 = `--effort high`(확정: 생략 아님) (c) `minimal`은 CLI에 없음 → 생략(확장사고 끔=effort 안 보냄).** 모델별 지원표(`MODEL_EFFORT_SUPPORT`)를 모듈 내 상수로.
   - **args 순서 고정**: buildRunArgs 플래그는 기존 `['-p', prompt, '--output-format','stream-json','--verbose']` **뒤에 append**(`-p prompt` 선두 보존). 골든 테스트가 전체 args 순서까지 단언(순서 회귀 방지).
3. **신뢰경계(CRITICAL)**: 매핑 함수가 곧 allowlist — 알려진 id만 알려진 플래그로 변환, 그 외 전부 무시. renderer 임의 문자열이 spawn 인자에 그대로 들어가지 않음. spawn은 배열 인자(셸 미경유)라 추가로 안전하나 검증은 필수. main ipc 핸들러(agent.run)는 model/effort/mode가 string이 아니면 무시.
4. **토큰 게이지 실데이터**: 모델별 contextWindow 상수 `MODEL_CONTEXT_WINDOW`(키 = picker id `opus`/`sonnet`/`fable`/`haiku`, **KNOWN_MODELS와 동일 키 집합 — 단일 출처, 드리프트 시 미지 모델 window=undefined 방지**): Opus4.8/Sonnet4.6/Fable5=1_000_000 · Haiku4.5=200_000. 게이지 = 최종 `done.usage`(input+output, cache 포함 가능) ÷ 선택 모델 window. **fallback**: 모델 미전달/미지 → window 기본 1_000_000 사용(게이지 깨지지 않게). 실시간 per-turn 갱신은 CLI 미지원 → M4-2 후속(`--include-partial-messages` 조사). **picker의 display `ctx:1000`(haiku도 1000)은 별개 표시값** — 게이지는 권위 window 사용(불일치는 노트, picker 표시 수정은 범위 외). **B8 부분완료**: 게이지(단일 수치)만, 사용량 분석(히스토리/누적/비용)은 후속.
5. **systemPrompt·이미지·슬래시 실행·세션 resume·멀티·권한/질문 = 범위 외** (M4-2~M4-4).

## 추가/변경 계약 (shared)
- `src/shared/ipc-contract.ts`: `AgentRunRequest` += `model?/effort?/mode?: string`. `MODEL_CONTEXT_WINDOW: Record<string, number>` 상수(또는 별도 export). 채널/타입 신규 0(기존 AGENT_RUN 재사용).
- `src/main/agents/AgentBackend.ts`: `AgentRunInput` += `model?/effort?/mode?: string`. (backend-contract 깃발 — agent-backend·main·renderer·qa 정합.)
- preload: agent.run req를 통째 전달 → **변경 불요**(검증).

## 서브웨이브 (도메인 Worker, 의존성 순서, 각 TDD)
- **20a (shared 계약)** — shared-ipc: AgentRunRequest 3필드 + MODEL_CONTEXT_WINDOW + AgentRunInput 3필드. typecheck 양쪽 green. (구현 전 qa가 계약 타입 사용 테스트 가능.)
- **20b (backend 매핑)** — agent-backend: `run-args.ts`(buildRunArgs + 모델 effort 지원표) **TDD 핵심**(model/effort/mode→args, 미지 id 무시, haiku effort 생략, sonnet xhigh 클램프, minimal 생략, untrusted 문자열 무해화). ClaudeCodeBackend가 buildRunArgs 결과를 spawn args에 합성(`-p prompt` 앞/뒤 위치 주의). qa 골든 테스트.
- **20c (main 핸들러)** — main-process: agent.run 핸들러가 req.model/effort/mode(타입검증) → AgentRunInput 전달. 통합.
- **20d (renderer 연결)** — renderer: Composer RunPicker 선택값(pickerOptions id) → store.sendMessage → agent.run req에 포함. 토큰 게이지를 done.usage + MODEL_CONTEXT_WINDOW(선택 모델)로 실데이터화. reducer usage 저장 확인.
- **20e (qa 통합)** — 매핑 골든 + 핸들러 패스스루 + 게이지 reducer 단위. e2e는 실 claude CLI 불필요(매핑/계약 단위로 충분, 실행은 수동/후속).

## 검증 / 완료조건
- 각 서브웨이브 = Worker TDD(실패 테스트 먼저) → reviewer(**신뢰경계 CRITICAL**: model/effort/mode untrusted→allowlist만 인자화·run-args electron import 0·API 키 평문 0) → typecheck 양쪽 + 단위 green → conventional commit.
- **완료조건(측정가능)**: ① `buildRunArgs`가 (opus,xhigh,auto)→`['--model','opus','--effort','xhigh','--permission-mode','auto']`(전체 순서 고정) 정확 매핑 + haiku effort 생략 + sonnet xhigh→high 클램프 + minimal 생략 + 미지 id 무시 골든 green. ② agent.run req의 model/effort/mode가 ClaudeCodeBackend spawn args까지 도달(통합 테스트, args 순서 포함). ③ 토큰 게이지가 done.usage 실값÷선택 모델 window(미지 모델 fallback 1M)로 표시(렌더러 단위). ④ 미전달(legacy) 경로 기존 동작 유지(args=기존 3개만). ⑤ **기존 단위 전부 green + 신규 테스트 green**(절대 카운트 비의존), 신뢰경계 reviewer CRITICAL 0.
- **범위 외(후속 M4 Phase)**: 슬래시 실행·@mention·이미지·큐 드레인(M4-2) / 멀티 패널·세션 CRUD(M4-3) / 권한·질문 응답(M4-4).
