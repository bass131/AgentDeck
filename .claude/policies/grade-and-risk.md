# Grade & Risk — 작업 정량 4등급 + 위험 깃발 자동 상향

> **헌법 참조**: 본 정책은 헌법(`../../CLAUDE.md`) "작업 등급" 섹션에서 링크됩니다.
> 충돌 시 헌법이 이깁니다.

본 문서는 모든 작업을 *정량 4등급*으로 분류하고, *위험 깃발*이 잡히면 등급을 자동 상향하는 정책을 정의합니다. 등급이 **양식 부담**(work-pin / -DONE.md / 5단계 보고)과 **동원 패턴**(메인 직접 / Worker SubAgent / Coordinator+Team)을 결정합니다.

---

## 1. 왜 등급 체계인가 (배경)

옛 운영은 *모든 작업을 같은 무게로* 처리 → 단순 변경에도 양식 노이즈 폭증, 진짜 큰 작업도 무게가 안 보여 사고 위험 ↑. **해결**: 작업 무게 4등급 → 양식 부담 4단계 1:1 매핑. 단순한 건 단순하게, 큰 건 크게. (모델 분담 = Sonnet Worker + Opus Coordinator, 상세 [`subagent-routing.md`](subagent-routing.md))

---

## 2. 4등급 정의

| 등급 | 정량 기준 | 처리 패턴 | work-pin | -DONE.md | HTML 시각화 |
|---|---|---|---|---|---|
| **단순** | 1 도메인 × 1 파일 / ≤10줄 / 가역적 | 메인 세션 직접 | ✅ | ❌ | ❌ |
| **보통** | 1 도메인 × 2~3 파일 / ≤50줄 / 가역적 | Worker SubAgent 1개 | ✅ | ❌ | ❌ |
| **복잡** | 2 도메인 / ~100~200줄 / 일부 비가역 | Coordinator + Worker 1~2개 (+reviewer 조건부) | ✅ | ✅ | ✅ |
| **대규모** | 3+ 도메인 또는 300줄+ / 비가역 | Coordinator + Team (Worker 3~4개 + plan-auditor 사전 + reviewer 통합) | ✅ | ✅ | ✅ (+종합) |

> **보고 = 비동기 문서**: 5단계 보고 구조(🎯/🤔/🛠️/🧪/➡️)는 인라인 출력이 아니라 **복잡 이상의 `-DONE.md` + HTML 시각화 문서 *안*에** 박힘. 작업은 흐름을 끊지 않고 자동 진행, 사용자는 추후 문서로 체크. 인라인 멈춤은 *영호 직접 확인 지점*(비가역·승인 게이트·육안)에서만.

### 정량 판정의 *순서*

1. **도메인 개수** 먼저 (main-process / shared-ipc / renderer / agent-backend / qa)
2. **줄 수** 다음 (실질 변경, 공백/주석 제외)
3. **가역성** (`git revert` 한 줄로 복원 가능한가)

세 기준 중 *가장 높은* 등급을 채택. 예: 1 도메인 × 5줄인데 비가역(`git push`)이면 → 복잡으로 상향.

### 등급별 동원 패턴 디테일

- **단순**: 메인 세션이 Edit/Write 직접. SubAgent 위임 비용 > 작업 비용.
- **보통**: 도메인 Worker 1개에 위임. 메인 세션은 결과 수신 + work-pin 갱신.
- **복잡**: Coordinator가 Phase 분해 + Worker 1~2개 위임 + 결과 통합. reviewer 자동 호출(트리거 충족 시). 완료 = `-DONE.md` + HTML 시각화.
- **대규모**: Coordinator + 도메인 Worker 다수 + plan-auditor 사전 검증 + reviewer 통합 점검 + `-DONE.md` + HTML 시각화(+ 마일스톤 종합).

---

## 3. 위험 깃발 (자동 등급 상향)

다음 깃발이 잡히면 *기본 등급에서 한 단계 상향*. 두 깃발 동시 잡히면 두 단계 상향.

| 깃발 | 검출 패턴 | 사유 |
|---|---|---|
| **trust-boundary** | `src/preload/**`(contextBridge 노출), `src/main/ipc/**`(IPC 핸들러), `src/shared/**`(IPC 계약), BrowserWindow `webPreferences`(nodeIntegration/contextIsolation), API 키 처리 | 신뢰 경계 — 한 줄 실수가 renderer에 Node 권한 누수 / 시크릿 노출 |
| **backend-contract** | `src/main/agents/**`(AgentBackend 인터페이스·어댑터), `src/shared/agent-events*`(공통 AgentEvent 타입) | 엔진 추상화 계약 — 한 곳 변경이 전 어댑터(Claude/Codex) 영향 (ADR-003) |
| **irreversible** | `git push`, `gh pr merge`/`create`, `npm run package`/`publish`, IPC 계약 버전 bump, JSON 영속 스키마 마이그, `git reset --hard`, force push | 되돌리는 비용이 큼 |
| **ui-visual** | `src/renderer/**/*.css`, JSX 레이아웃/애니메이션 | 시각·미감은 자동 검증 불가 → 사람 육안 트랙([`../../docs/UI.md`](../../docs/UI.md) 안티슬롭) |
| **harness** | `.claude/**` · `scripts/hooks/**` 변경 | 하네스 자체 변경 = 본인(+미래 합류자) 매번 영향 = CHANGELOG [H] 의무 + 자기 참조 함정 인지 |

### 상향 결과 박힘

상향 사유는 *본인이 수동으로* work-pin에 한 줄 박음 (Hook 알림 인지 후):

```
등급:           복잡 (자동 상향: 보통 + trust-boundary)
```

### 자동 검출 + 알림 = Hook

위 깃발은 사용자/AI 판단에 *의존하지 않음*. [`../../scripts/hooks/risk-detector.sh`](../../scripts/hooks/risk-detector.sh)가 PreToolUse/PostToolUse에서 변경 파일 경로/명령 grep으로 자동 검출 → **stderr 알림 + `.claude/state/risk-flags.txt` 누적** (작업 차단 X).

**work-pin 갱신은 본인 수동** — Hook이 work-pin 파일을 직접 수정하기 어려움(동시 편집 충돌) + 본인 인지를 거쳐야 등급 상향이 의미 있음. Hook 발동 = "주의 환기" 신호, 갱신 = 본인 책임.

### 깃발 → 루프 버킷 (loop-driven)

위험 깃발은 *등급 상향*뿐 아니라 **루프 판정자(work-judge) 버킷**의 1차 분류기입니다:

| 깃발 | 버킷 | 처리 |
|---|---|---|
| 무깃발 | (a) 기계 판정 | 루프 자율 |
| `ui-visual` | (b) 취향·육안 | 사람 병행 트랙 |
| `irreversible` / `trust-boundary` | (c) 판단·비가역 | 사람 게이트(Stop) |
| `backend-contract` | 기본 (a) + reviewer 무조건·모델 상향 | 전 어댑터 영향 = 설계 결정, 설계 분기 동반 시 (c) |
| `harness` | 기본 (a), 권한·게이트 변경 시 (c) | — |

3버킷 정의·v1/v2 강제 차이 → [`work-judge.md`](work-judge.md). **본 정책이 깃발 *정의*의 단일 진실**, work-judge는 *매핑*만 (중복 0).

---

## 4. 등급 판정 흐름 (시각화)

```
[사용자 요청]
   ├─ 메인 세션: 도메인 개수 셈 → 줄 수 추정 → 가역성 판정
   ├─ 기본 등급 결정 (단순/보통/복잡/대규모)
   ├─ risk-detector.sh Hook 자동 발동 (stderr 알림 — 차단 X)
   │   ├─ 깃발 0개 → 기본 등급 유지
   │   ├─ 깃발 1개 → 1단계 상향 (본인 인지 후 갱신)
   │   └─ 깃발 2개+ → 2단계 상향
   ├─ 최종 등급 → 본인이 수동으로 work-pin에 박음
   ├─ 처리 패턴 결정 ([subagent-routing.md] 참조)
   └─ 작업 진행
```

---

## 5. 등급별 보고 양식 격차 (요약)

| 양식 | 단순 | 보통 | 복잡 | 대규모 |
|---|---|---|---|---|
| work-pin 갱신 | ✅ | ✅ | ✅ | ✅ |
| commit message | ✅ | ✅ | ✅ | ✅ |
| `-DONE.md` 박제 | ❌ | ❌ | ✅ | ✅ |
| HTML 시각화 | ❌ | ❌ | ✅ | ✅ (+종합) |
| reviewer 자동 호출 | ❌ | 조건부 | ✅ | ✅ |
| plan-auditor 사전 검증 | ❌ | ❌ | ✅ | ✅ |

양식 디테일 — [`reporting-format.md`](reporting-format.md) + [`pin-and-done.md`](pin-and-done.md).

---

## 6. 함정 / 주의사항

- **등급은 *예상*이 아니라 *측정*** — 작업 도중 정량 기준 넘으면 *상향 후 work-pin 갱신*. 등급 고착으로 양식 부담 회피 X
- **위험 깃발은 *우회 금지*** — `risk-detector.sh`는 advisory(알림)지만 양식 부담은 자동 적용. 헌법 절대 원칙 보호
- **단순 등급의 함정** — 1줄 변경이지만 `src/main/ipc/`에 박히면 trust-boundary 깃발 발동 → 보통으로 상향. 위치가 기준의 일부

---

## 7. 변경 시 동기화 책임

본 정책 수정 시 *반드시* 함께 갱신:

- [`../../CLAUDE.md`](../../CLAUDE.md) "작업 등급" 섹션 (헌법 본문 표와 정합)
- [`subagent-routing.md`](subagent-routing.md) (등급 → 처리 패턴 매핑)
- [`reporting-format.md`](reporting-format.md) (등급별 5단계 보고 조건부화)
- [`pin-and-done.md`](pin-and-done.md) (등급별 -DONE.md 박제 조건)
- [`../../scripts/hooks/risk-detector.sh`](../../scripts/hooks/risk-detector.sh) (깃발 검출 패턴)
- [`work-judge.md`](work-judge.md) (깃발 → 루프 버킷 매핑 — 본 정책이 깃발 정의 원천)

---

## 갱신 이력

- 2026-06-26 — AgentDeck 이식 (ClaudeDev → manifest 기반). 도메인 정합(server/shared/client→main-process/shared-ipc/renderer/agent-backend/qa), 위험깃발 경로 매핑(GameSession/Handlers→src/preload·src/main/ipc·src/main/agents·src/shared, prefab unity-asset→ui-visual renderer CSS, Protocol.Version→IPC 계약 버전, .claude+scripts/hooks→harness), ClaudeDev ADR 번호·실측 항목 정리. 4등급·정량 판정·자동 상향은 프로세스 골격이라 그대로.
