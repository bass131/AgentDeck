### ADR-010: 멀티에이전트 개발 분담 — ClaudeDev식 coordinator/worker

> ⚠️ **개정 1(2026-07-25)로 조직 구조가 바뀌었다.** 아래 원 결정의 *coordinator 위임 축*은 철회됐다 — 현행 계약은 문서 하단 「개정 1」이 정본이다.

**결정**: 본 저장소 개발은 coordinator(분해·위임·통합) → 도메인 Worker(main-process / agent-backend / renderer / shared-ipc / qa) → reviewer/plan-auditor 자동 호출. 권한 경계 + 재귀 차단 + 등급별 동원.
**이유**: `C:\Dev\ClaudeDev` 검증된 패턴 착안. 컨텍스트 보존 + 경계코드 일관성.
**트레이드오프**: 위임 오버헤드(단순 작업엔 과함) → 등급 "단순"은 메인 직접 처리로 완화.

---

### 개정 1 (2026-07-25, HR2 P01 — 영호 승인): Opus 5 리뉴얼 — coordinator 축소 · CTO 신설 · 모델 티어 4층

**철회(supersede)**: 원 결정의 다음을 철회한다.
- ① **coordinator의 "분해·위임·통합" 역할** — 위임 권한 자체가 런타임에서 소멸했다.
- ② **"등급별 동원"의 coordinator 경유 전제** — 복잡/대규모 등급도 위임자는 메인이다.

**존치**: 도메인 Worker 경계 · 재귀 차단 원칙 · 등급 4단계(단순/보통/복잡/대규모) · "컨텍스트 보존 + 경계코드 일관성"이라는 원 이유.

#### 철회 근거 — 결정이 틀린 게 아니라 **전제가 만료**됐다

| # | 실측 (2026-07-24~25) | 함의 |
|---|---|---|
| 1 | Claude Code **v2.1.220 + `SPAWN_DEPTH` 미설정 = 서브에이전트 중첩 기본 OFF.** 서브에이전트 런타임에서 `Agent` 도구 **부재를 직접 관측** | `main→coordinator→Worker` 2단 위임은 **이미 실행 불가능**했다. 문서만 살아 있었다 |
| 2 | `00_Documents/CHANGELOG.md:56`의 *"coordinator Agent 도구 유지 결정(영호, 2026-07-11)"* 은 중첩이 **켜져 있던 v2.1.172~216 창 안**의 결정. 이후 재검토 기록 없음 | 그 결정은 **당시엔 옳았다.** 런타임이 바뀌었을 뿐 |

> 이 구분이 이 개정의 핵심이다 — ADR을 "틀린 결정 정정"으로 읽으면 다음 사람이 *판단*을 의심하지만, "전제 만료"로 읽으면 *환경 변화*를 의심한다. 후자가 맞다.

#### 신규 계약

1. **역할 10종** — `chief-tech-operator`(신설) · `coordinator`(축소) · 도메인 Worker 4(`main-process`·`agent-backend`·`renderer`·`shared-ipc`) · `qa` · `secretary` · `reviewer` · `plan-auditor`.

2. **`chief-tech-operator` 신설** — 설계 분기 자문(ADR 초안)과 막힌 문제 진단(에스컬레이션 최종단)을 맡는 최상위 판단 역할. 읽기 전용(`disallowedTools: Edit, Write`). **발동 = 메인이 자동 제안 → 영호 승인 후 호출**(혼합 방식) — 상시 자동 발동은 비용이 크고, 영호 수동 호출만으로는 호출 시점을 놓친다.

3. **`coordinator` 축소** — `Agent` 도구를 **반납**하고 역할을 **경계 정합 검증** 단일로 좁힌다. 기존 Hard rule 5(경계 정합)만 존치·승격, 분해 패턴 카탈로그는 `chief-tech-operator`로 이관.
   ⚠️ **"메인만 위임자"의 강제 주체가 바뀐다** — 지금까지는 *"coordinator만 `Agent`를 가진다"* 가 곧 기계 강제였다. 반납 후 그 강제는 문서 규범으로 내려오지만, **런타임 중첩 OFF가 사실상 같은 효과**를 내므로 실질 방어는 유지된다. **중첩이 다시 켜지는 버전이 오면 이 항목을 재검토해야 한다** — 그때 문서 규범만 남아 있으면 무방비다.

4. **모델 티어 4층** (원 ADR에 없던 축 — ADR-033 개정 1이 Sol/Terra/Luna 계층을 철회하면서 Claude 쪽 모델 규범의 소유자가 공백이 됐다. 본 ADR이 소유한다)

   | 층 | 대상 | 모델 (**full ID 필수**) |
   |---|---|---|
   | 메인 세션 | 판단·조율·위임 | `claude-opus-5` |
   | 최상위 판단 | `chief-tech-operator` | `claude-fable-5` (영호 승인 발동) |
   | 도메인 Worker | 구현 | `claude-sonnet-5` / 위험 깃발·대규모 시 `claude-opus-5` |
   | 판정 렌즈·격리 | `reviewer`·`plan-auditor`·`coordinator`·`qa`·`secretary` | `claude-opus-5` |

5. **⭐ 별칭 금지 — full ID를 적는다.** `model: opus`는 **`claude-opus-4-8`로 스폰된다**(2026-07-24 secretary 3스폰 트랜스크립트의 model 필드 실측). Opus 5를 원하면 `claude-opus-5`를 적어야 한다.
   ⚠️ **이 규칙은 이미 한 번 세워졌다가 조용히 무너졌다** — `00_Documents/CHANGELOG.md:80`(2026-07-03)이 *"Worker 5는 `model: sonnet` 별칭 → `claude-sonnet-5` 명시 고정(영호 '별칭 해석 모호성 제거')"* 이라 기록했으나, **2026-07-25 실측 결과 디스크는 전부 `sonnet` 별칭으로 되돌아가 있었다**(agent-backend·main-process·renderer·shared-ipc 4건 + qa는 `opus`로 상이 = 총 5건 드리프트, 되돌아간 시점 기록 없음). 즉 **full ID는 문서 규범만으로는 유지되지 않는다** — 회귀 테스트로 고정하지 않으면 다음 리팩터에서 또 별칭으로 돌아간다(P02 완료 조건).

**트레이드오프**:
- **(얻는 것)** 조직도가 런타임 현실과 일치한다. *"coordinator가 분해·위임한다"* 는 죽은 서술을 믿고 설계를 얹는 사고를 막는다 — 이 마일스톤 자체가 그 사고의 잔해(3세대 규범 겹침)를 치우는 중이다.
- **(잃는 것)** 대규모 Phase에서 **메인 컨텍스트 부담이 늘어난다**. 분해를 메인이 직접 하기 때문이다. 완화 = `secretary`를 *"싼 모델"* 이 아니라 **"입출력이 큰 작업을 메인 컨텍스트 밖에서 돌리고 결론만 회수"** 로 재정의(P03).
- **(비용 증가)** 티어 4층은 판정 렌즈 5종을 Opus 5로 고정한다 — 저렴한 티어로 내리면 토큰은 줄지만, 이 저장소에서 판정 렌즈의 오탐·누락 비용이 그보다 크다는 것이 이 마일스톤 자체의 실증이다(plan-auditor가 메인이 못 잡은 결함 8건 포착, 그중 2건은 세션이 자기 권한을 잠그는 사고).
- **(⚠️ Codex 대칭 파손)** `.codex/harness-contract.test.mjs:131-136`이 coordinator의 `Agent` 보유를 **기계 강제**하므로 반납 즉시 red가 된다. CORE-12(엔진별 Hook 격리)상 **Claude는 `.codex/**`를 고칠 수 없다** → 영호 또는 Codex 세션의 별도 작업(P10). 그때까지 반쪽 상태임을 P11 마감에 명시한다.

**위험도**: [H] — 조직 계약·모델 정본 변경(하네스 통제 구조).

**관련**: ADR-033 개정 1(Sol/Terra/Luna 티어 철회 — Claude 모델 규범 공백의 출처) · ADR-034(하네스 3층) · ADR-038(유지보수 창) · CORE-11(사용자 단독 통제) · `.claude/policies/execution-owner.md`(§3 티어 표 — 본 ADR의 구현) · `.claude/agents/_routing.md`.

**현황(2026-07-25)**: 채택. 구현 = HR2 P02(모델 정본)·P03(역할 재편). P10(Codex 대칭)은 실행 주체가 달라 별도 추적.

---

### 개정 2 (2026-07-27, BZ P01 — 영호 승인): 판정 렌즈 fable-5 승격 (E 승격)

개정 1 티어 4층의 「판정 렌즈·격리」 행을 **둘로 가른다**:

| 층 | 대상 | 모델 (**full ID 필수**) |
|---|---|---|
| 판정 렌즈 | `reviewer`·`plan-auditor` | `claude-fable-5` |
| 격리·실행 | `coordinator`·`qa`·`secretary` | `claude-opus-5` (유지) |

- **근거**: 개정 1 트레이드오프의 연장 — *"판정 렌즈의 오탐·누락 비용이 토큰 비용보다 크다"*. BZ P01 실증: reviewer(`claude-fable-5` override)가 shell-policy 오탐 수리가 연 **회귀 3계열**(명령 치환 위장·cd 상대경로·파이프)을 14케이스 실측으로 포착했다 — 이 회귀는 그대로 커밋됐으면 봉인 우회 통로였다.
- **안전장치 절차**: Fable 5 안전장치(방어 보안 작업 등) 발동 시 `claude-opus-5`로 재호출하되, **품질 저하가 아니라 안전장치 발동임을 구분 기록**한다(`reviewer.md` 완화 노트 — fa38471).
- **기계 고정**: `99_Others/tests/agents/agent-model-canon.test.ts` 기대표 갱신(c9340db) — 문서 규범만으로 유지되지 않음(개정 1 §5 별칭 회귀 실증)의 같은 처방.
- **운영 표**: `.claude/policies/execution-owner.md` §3 — 같은 창(BZ P06)에서 동기 갱신.

