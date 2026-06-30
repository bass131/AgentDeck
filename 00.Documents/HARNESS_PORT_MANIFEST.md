# 하네스 이식 Manifest — ClaudeDev → AgentDeck (확정 v1)

> 작성: 2026-06-26, **ClaudeDev 세션(원본 하네스 = 외부 무편향 감사 시점)**이 작성 → AgentDeck 세션이 집행.
> **이 문서가 단일 진실원이다. `HARNESS_GAP.md`는 본 문서로 supersede(폐기·archive 대상).**
> 사유: HARNESS_GAP.md는 AgentDeck 세션이 *자기 자신을 진단*해 스킵을 합리화한 산물 → 자기편향. 본 manifest는 원본 쪽이 외부에서 재결정한 것.
>
> **⚠️ 정합 노트 (2026-06-30 — ADR-028 루트 재구성):** 본 문서는 **2026-06-26 하네스 *이식 시점*의 완료 기록**이다. 이후 루트가 번호접두 카테고리로 재구성됨: `docs/`→`00.Documents/` · `phases/`→`01.Phases/` · `src/`→`02.Source/` · `tests`·`scripts`·`out`→`99.Others/`. **현 디렉토리 구조의 진실원 = [ADR-028](./ADR.md) + [ARCHITECTURE.md](./ARCHITECTURE.md).** 아래 본문의 옛 경로(`src/`·`docs/`…)는 *이식 시점 스냅샷*으로 보존(역사 기록 불변 — 기존 ADR 항목·CHANGELOG 옛 줄과 동일 처리). 단 훅 위치는 `.claude/hooks/`로 확정(§4-3, 옛 `scripts/hooks/` 추정 정정).

---

## 0. 대전제 — 2층 분리 (blind copy 아님)

- **프로세스 층 (도메인 무관 기계장치)** = work-pin·등급·루프/버킷·정책 프레임워크·보고양식·ADR 규율·훅 프레임워크·슬래시 카탈로그·SubAgent *골격*. → **ClaudeDev 것이 상위호환. 통째 이식.**
- **도메인 층 (프로젝트 살)** = 절대원칙 내용·Stack·Pillars·SubAgent *도메인 배정*·훅 *경로 매처*. → **AgentDeck 자기 PRD/ARCHITECTURE/ADR에서 재유도.** ClaudeDev 것 복붙 시 퇴화.

이식 = **[ClaudeDev 프로세스 골격 통째] + [AgentDeck 도메인 살 새로 발라냄] + [작업물·결정 보존]**.

> 출처 경로: ClaudeDev = `C:/Dev/ClaudeDev` (같은 머신, AgentDeck 세션이 `/c/Dev/ClaudeDev/...`로 read 가능).
>
> **갱신 2026-06-26 (post-`/harness-review`)**: ClaudeDev 원본 하네스가 자체 점검 후 정리됨 (PR #123) — (a) **SubAgent 풀 9→8** (`unity-bridge` 폐기, Unity asset/MCP = 메인 세션 직접), (b) solo 정합(팀 흔적·디스코드/슬랙 공지 규칙 제거), (c) doc-sync(슬래시 13개·위험깃발 4종·reviewer 6축). → **Class A 파일을 지금 pull하면 정리된 상태**. ※`unity-bridge`는 AgentDeck(Electron)엔 Unity 도메인이 없어 애초 포트 대상 아님(N/A).

---

## 1. 4분류 범례

| 클래스 | 의미 | 행동 |
|---|---|---|
| **A — 그대로** | 프로세스 골격. 도메인 무관. | ClaudeDev 파일 가져와 솔로(§5.5)·폴더명만 적응. (밀고 새로 설치) |
| **B — 재유도** | 도메인 살. 게임 전용 내용. | ClaudeDev *구조*만 빌리고 내용은 AgentDeck 문서에서 재작성. 복붙 X |
| **C — 안 건드림** | 프로젝트 작업물·결정·기억. | **절대 wipe 금지.** AgentDeck 것 보존 |
| **D — 확정됨** | (아래 §5에서 영호가 확정) | manifest대로 |

---

## 2. CLAUDE.md (헌법) — 섹션별

AgentDeck CLAUDE.md를 **새로 쓰되**, 섹션 골격은 ClaudeDev에서, 내용은 출처별로.

| 섹션 | 클래스 | 비고 |
|---|---|---|
| 사용자 컨텍스트 (멘토링 톤) | A(적응) | 학부생 백엔드 학습 → AgentDeck 학습목표로 재서술. 톤·trade-off·솔직함 원칙 그대로 |
| 작업 보고 / 작업 좌표 / 슬래시 | **A** | 그대로 |
| 운영 모드 (loop-driven) | A / D | 3버킷·사람게이트=그대로(A). /engine:goal 엔진=스킵(§5-D2) |
| 문서 운영 (우선순위·세분화 임계) | A(적응) | `00_Document→docs/`, `01_Phases→phases/` 폴더명만 |
| Stack | **B** | AgentDeck = Electron42/Vite7/React19/TS6 (이미 있음) |
| Repo Layout | **B** | 02_Server/03_Client → src/main·renderer·shared·preload |
| 절대 원칙 5개 | **B** | 게임(ServerAuthority/Protocol/Trust/Tick/Shared) → AgentDeck(신뢰경계=main단독/엔진추상화 ADR-003/IPC계약단일/API키/TDD) *대응자리* 재유도. AgentDeck CLAUDE.md에 이미 박혀있음 |
| Gameplay Pillars | **B** | 게임 전용. AgentDeck엔 해당없음 또는 "앱 Pillars" |
| 작업 등급 4단계 | **A** | 그대로 (위험깃발 *내용*만 B) |
| SubAgent 풀 표 | A골격/B내용 | 표 구조=A, 도메인 배정=B (AgentDeck 이미 번역). 원본 풀 **8개**(unity-bridge 폐기) |
| Knowledge 시스템 | **스킵**(§5-D1) | 미설치 |
| 확신없을때 / PR 게이트 | **A** | 그대로 |

---

## 3. policies/ (11개)

ClaudeDev `00_Document/policies/` → AgentDeck `.claude/policies/` (신설).

| 파일 | 클래스 |
|---|---|
| `reporting-format.md` `pin-and-done.md` `doc-thresholds.md` `review-tiering.md` `review-throughput.md` | **A** 그대로 |
| `work-judge.md` | **A** (3버킷 그대로, 깃발→버킷 매핑 내용만 B) |
| `pr-and-merge-gate.md` | A(적응) — admin-bypass + "팀원 ack 대기" 머신은 **휴면 배너**로(§5.5-3), GO 게이트는 유지 |
| `grade-and-risk.md` | A골격 / 위험깃발 경로=B (GameSession/Handlers/prefab → src/preload·src/main/ipc·AgentBackend) |
| `subagent-routing.md` | A골격 / 도메인배정=B |
| `loop-driver.md` | **포트**(§5-D2) — done판사 WSL2 → AgentDeck CI(vitest/playwright/typecheck) |
| `knowledge-system.md` | **스킵**(§5-D1) |

---

## 4. .claude/ 기계장치

### 4-1. agents/
| 파일 | 클래스 |
|---|---|
| `_routing.md` `_escalation.md` | **A** 골격 (AgentDeck _routing 기존판 → 교체) |
| `coordinator` `reviewer` `plan-auditor` `qa` | A(적응) — 영역 경로만 B |
| `server` `client` `shared` | **B** → main-process·renderer·shared-ipc·agent-backend (AgentDeck 이미 번역) |
| ~~`unity-bridge`~~ | **N/A** — 원본서 폐기(2026-06-26). Electron엔 Unity 도메인 없음 → 포트 대상 아님 |
| `knowledge-gc` | **스킵**(§5-D1) |

### 4-2. commands/
| 파일 | 클래스 |
|---|---|
| `session/{start,end,review,log}` `work/plan` `harness-review` `setup` | **A** (게임참조 몇 줄만 적응) |
| `refactor-sweep` | A — AgentDeck TS판 이미 있음, 골격 정합만 |
| `work/{new-monster,new-packet,load-test}` | **B** — 게임 전용. AgentDeck 자기 작업커맨드(없으면 생략) |
| `engine/goal` | **스킵**(§5-D2) |
| `cross-review` | **defer**(§5-D3) |
| `_mapping` | A(적응) — AgentDeck 매핑으로 재작성 |

### 4-3. hooks/  (AgentDeck 훅 위치 = `.claude/hooks/` 확정 — 2026-06-27 `.claude` 통합 이동, ADR-026 / 옛 `scripts/hooks/` 추정 정정)
| 파일 | 클래스 |
|---|---|
| `hook-common.sh` `pin-injector.sh` `circuit-breaker.sh` `dangerous-cmd-guard.sh` | **A** 그대로 (도메인무관) |
| `phase-gate-validator.sh` | A(적응) — 솔로=복잡↑만 -DONE 의무, 임계 적응 |
| `convention-size-guard.sh` | A(적응) — God class 줄수 임계만 |
| `risk-detector.sh` `reviewer-auto-trigger.sh` `tdd-guard.sh` | A골격 / 경로 매처=B (AgentDeck판 이미 있음 → 골격 정합 후 유지) |
| `shared-discipline-guard.sh` | **B** — PDL.xml/Shared.dll=게임 전용 → IPC계약 가드로 재유도 |
| `README.md` | A(적응) — 새 훅셋으로 재작성 |
| `settings.json` 배선 | A골격 / permissions(dotnet/gh→npm/electron)=B |

### 4-4. templates/ setup-steps/ state/
| 항목 | 클래스 |
|---|---|
| `templates/{done-md,pin}-template` | **A** 그대로 |
| `setup-steps/{01-intro,02-common,04-finalize}` | A(적응) |
| `setup-steps/03-{backend,unity-client}` | **B** → node/electron 셋업 재작성 |
| `state/*` | **재생성** — ClaudeDev 값 복사 X. 빈 초기상태. AgentDeck 기존 state 보존 |
| `knowledge/*` | **스킵**(§5-D1) |

---

## 5. D — 영호 확정 (2026-06-26)

| 후보 | 확정 | 이유 |
|---|---|---|
| **D1. knowledge 캐시 + GC** | **스킵** | 솔로+AI self-reinforcement 위험. MEMORY.md(auto-memory)가 세션경계 캐시 담당 |
| **D2. loop-driver 정책 + /engine:goal** | **정책 포트 / 커맨드 스킵** | work-judge 3버킷·"done=외부기계심판(CI)" 개념 가치. /engine:goal 글루는 내장 /loop로 충분 |
| **D3. cross-review (Codex β)** | **defer** | 하네스엔 불필요. 듀얼백엔드 Track2 후 |

---

## 5.5. 솔로 정합 패턴 (원본 ClaudeDev가 2026-06-26 `/harness-review`로 확립 — Class A에 이미 내장)

AgentDeck도 **영호 + AI 솔로**(HARNESS_GAP §0). 원본 하네스가 방금 solo 전환(2026-06-18) 미반영분을 봉합했고(PR #123), 그 결과 **Class A 파일은 이미 솔로 정합 상태**다. 이식 시 *팀 전제 재도입 금지* — 아래 4패턴을 깨는 표현을 새로 넣지 말 것:

1. **팀 언어 제거** — 팀장/팀원/구 팀원 이름 같은 다인 전제 X → "본인 + 미래 합류자"로 일반화. (원본 봉합처: `grade-and-risk`·`knowledge-system`·`pin-and-done`·`subagent-routing`·CHANGELOG 헤더·knowledge 캐시)
2. **공지 규칙 없음** — 디스코드/슬랙 공지 규칙 **완전 제거**(솔로 = 공지 대상 없음). `CHANGELOG` = "팀 브로드캐스트"가 아니라 **compact·세션 경계 기억** (AgentDeck도 동일 — HARNESS_GAP H1-a 정합). [H] 변경도 외부 공지 X, commit·CHANGELOG에 사유 박기.
3. **CODEOWNERS = 단독 → normal merge** — `* @<owner>` 단독 소유면 code-owner 리뷰가 *스킵*돼 admin 없이 머지 가능. 따라서 `pr-and-merge-gate`의 *admin-bypass + "팀원 ack 대기"* 머신은 **휴면 배너로 표기(삭제 X)** — push/PR/merge = 사람 GO 게이트는 *유효*, 팀 분기만 dormant + 미래 팀 재구성 시 부활. (원본 `.github/CODEOWNERS` 파일 자체가 이 "휴면+부활 경로" 패턴의 모범 — 그대로 미러)
4. **GO 게이트는 솔로에도 불변** — commit OK / push·PR·merge·배포 = 사람 명시 GO(버킷 c). 솔로라고 약화 X. (단독 PR = normal merge지 *무게이트*가 아님)

> AgentDeck 기존 `.claude/CHANGELOG.md`·`.claude/state`·(있으면) pr 정책에 팀/공지 흔적이 남아있으면 위 4패턴으로 같이 정합. C-class(작업물·결정)는 불가침이나, *하네스 규칙 문구*의 팀 잔재는 정리 대상.

---

## 6. C — 절대 안 건드림 (안전 경계)

**아래는 프로젝트 그 자체 — wipe하면 작업물 파괴:**

- `phases/` — 37개 실제 작업 Phase 이력
- `docs/ADR.md` `docs/PRD.md` `docs/ARCHITECTURE.md` + 활성 드라이버(UI_FIDELITY·FEATURE_MAP·UI_GUIDE 등)
- `src/` `tests/` `scripts/`(훅 제외) — 코드
- `.claude/CHANGELOG.md` — 누적 세션 기억 (형식은 ClaudeDev와 동일 → 유지)
- `.claude/state/*` — AgentDeck 런타임 상태

> ClaudeDev `00_Document/ADR/`는 `gameplay`/`harness`/`tech-stack`로 분리됨. **harness ADR의 *결정*만** AgentDeck 새 하네스 ADR의 입력. ADR *파일 자체* 복사 X (그건 ClaudeDev 역사).

---

## 7. 실행 계획 (Phase 분해) — AgentDeck 세션 집행

> 등급 = **대규모** (다도메인·다파일·일부 비가역 인접=wipe). AgentDeck 자기 라우팅(coordinator + workers + reviewer)으로 분해 권장. push/PR=영호 사람게이트.

- **P0 — 안전 + 경계 박제**
  - AgentDeck git 클린 확인 → 새 브랜치 `chore/harness-port` (단독이어도 브랜치).
  - §6 C-동결 목록 박제. `.claude/**` deny 일시 해제(작업 후 복원).
  - `HARNESS_GAP.md` → `docs/archive/`로 이동(supersede 명시).

- **P1 — A 프로세스 골격 설치** (ClaudeDev → AgentDeck 복사 + 솔로·폴더명 적응)
  - `.claude/policies/` 신설 → §3 A 정책 8개.
  - 훅 A 6개(hook-common·pin-injector·circuit-breaker·dangerous-cmd·phase-gate·convention-size) + README → AgentDeck 훅 관례 위치.
  - `.claude/templates/*`, session/work-plan/harness-review/setup 커맨드, _routing·_escalation 골격.
  - settings.json 훅 *배선*(권한은 P2).
  - **회귀 게이트**: 훅 smoke(가짜 stdin) 통과.

- **P2 — B 도메인 살 재유도** (AgentDeck 문서에서 재작성, 기존 적응본은 *참고 입력*으로만 → 교체)
  - CLAUDE.md 재작성: 절대원칙 5(AgentDeck판)·Stack·Pillars·문서지도.
  - subagent 도메인(main-process/renderer/shared-ipc/agent-backend) 새 골격 위 재생성.
  - risk-detector/reviewer-auto-trigger/tdd-guard 경로 매처 → src/preload·src/main/ipc·AgentBackend.
  - shared-discipline-guard → IPC계약 가드로 재유도.
  - settings permissions → npm/electron/playwright/vitest.
  - grade-and-risk·subagent-routing 정책의 도메인 칸.
  - setup-steps 03 → node/electron.

- **P3 — D 확정 반영**: knowledge 미설치 / loop-driver 정책 포트(done=CI) + engine:goal 미설치 / cross-review defer.

- **P4 — 정합 검증 + 옛 누더기 archive**
  - 깨진 링크 grep 0. CLAUDE.md ↔ policies ↔ agents ↔ settings 상호참조 일치.
  - 기존 누더기(구 `_routing.md`·반쯤 적응된 파일) 교체 완료 확인.
  - **회귀 게이트**: `npm run typecheck` + `npm run test` green (하네스 변경이 코드 안 깨뜨림).

- **P5 — 새 하네스 ADR 박제 + 마감**
  - `docs/ADR.md`에 "하네스 채택(ClaudeDev 이식)" ADR 추가 — 근거=본 manifest.
  - `.claude/CHANGELOG.md` [H] 박제. work-pin 갱신.
  - **push/PR = 영호 명시 GO** (비가역 게이트).

---

## 8. 편향 차단 원칙 (AgentDeck 세션에게)

1. 본 manifest가 권위. `HARNESS_GAP.md`의 스킵 합리화는 **재론하지 말 것** (이미 외부에서 재결정됨).
2. B 도메인 파일은 기존 적응본을 *참고*만 하고 **새 골격 위에 재생성** → "누더기 패치" 냄새 제거 (= 다음 Agent 맥락충돌 방지, 이 작업의 핵심 목적).
3. 막히면 ClaudeDev 원본 파일을 직접 read (`/c/Dev/ClaudeDev/...`).
4. C-class 절대 불가침. 의심되면 멈추고 영호에게.
