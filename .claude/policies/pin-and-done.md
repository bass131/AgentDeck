# Pin & Done — 작업 좌표 핀(압축) + Phase 완료 박제 라이프사이클

> **헌법 참조**: 본 정책은 헌법(`../../CLAUDE.md`) "작업 좌표 + Phase 완료 박제" 섹션에서 링크됩니다.
> 충돌 시 헌법이 이깁니다.

본 문서는 *시간순으로 연결된* 3개 정책을 통합 정의합니다:

```
[작업 중]              [Phase 완료 직후]            [박제 직후]
   ↓                        ↓                          ↓
current-pin 갱신    →    -DONE.md 박제          →    세션 마감 권유
(매 응답 영향)          (복잡/대규모 등급만)         (사용자 선택)
```

work-pin은 *압축*(목표 30~40줄). 안 변하는 사용자 컨텍스트(신분/목표)는 memory(`~/.claude/projects/.../memory/`)가 보유.

---

## 1. 작업 좌표 핀 (current-pin.txt) — 압축본

### 위치·역할

- 파일: `.claude/state/current-pin.txt` (목표 30~40줄, `.gitignore`)
- 역할: 현재 작업 좌표를 항시 보관 → 학습 질문 끼어들어도 *다음 턴*에 작업 복원
- 주입: `UserPromptSubmit` 훅([`../../scripts/hooks/pin-injector.sh`](../../scripts/hooks/pin-injector.sh))이 *매 사용자 입력 직전* 핀 내용을 컨텍스트 상단에 주입

### 핀 필드 (압축 5개 + 선택: 주의할 약속 · 루프 상태)

빈 템플릿: [`../templates/pin-template.txt`](../templates/pin-template.txt)

```
WORK-ID:        <Phase slug 또는 ad-hoc-YYYYMMDD-주제>
PHASE:          <마일스톤·Phase 번호> / 등급: <단순/보통/복잡/대규모, 자동 상향 표기>
현재 작업:      <지금 무엇을 하는지 한 줄>
다음 액션:      <바로 다음 한 스텝>
주의할 약속:    <빠뜨리면 안 되는 검증/제약, 없으면 생략>
루프 상태:      <버킷 a/b/c · 사람대기 여부 · pending-* 원장 참조 — loop 운영 시만 (work-judge)>
마지막 갱신:    <YYYY-MM-DD 또는 commit hash>
```

### 갱신 정책 (잘못된 핀 고착 방지)

| 시점 | 누가 | 무엇을 |
|---|---|---|
| `/work:plan` 호출 직후 (Phase 시작) | AI | 자동 생성 |
| 이미 분해된 마일스톤에서 다음 Phase 진입 시 | AI (사용자 확인 후) | 핀을 그 Phase 좌표로 갱신 |
| 코드 변경 후 work-pin 갱신 시 | AI | *변경된 항목만* (현재 작업 / 다음 액션) |
| 등급 자동 상향 시 | Hook ([`../../scripts/hooks/risk-detector.sh`](../../scripts/hooks/risk-detector.sh)) | PHASE 줄에 상향 사유 박음 |
| 주의할 약속 변동 시 | **사용자 수동** | 갱신 |
| 루프 스텝 경계 (loop-driven) | 루프 엔진/드라이버 | 현재 작업/다음 액션 + 루프 상태(버킷·원장). 무인 시 `pin-injector` 미발동 → 드라이버 직접 주입 |
| Phase 완료 시 | AI | archived 또는 cleared |

**원칙**: 핀은 *잘못 박히면 가짜 좌표로 다음 응답을 오염*. *변경 항목만 최소 갱신* + *사용자 약속은 확인 후*.

---

## 2. -DONE.md 박제 — 복잡/대규모 등급 한정

### 발동 조건

- Phase 파일의 **모든 완료 조건 충족** 시
- **복잡 또는 대규모 등급일 때만** 박제 ([`grade-and-risk.md`](grade-and-risk.md))
- 단순/보통 등급은 work-pin + commit message로 박제 충분 (양식 부담 회피)

### 경로

```
phases/<owner>/M{N}-{slug}/{NN}-{phase-name}-DONE.md
```

원본 Phase 파일과 *짝꿍 페어*. Phase 정의 `.md`의 frontmatter `owner:`가 박는 사람 식별 (솔로 = 본인; 미래 합류자 대비 필드 유지).

### 템플릿

[`../templates/done-md-template.md`](../templates/done-md-template.md).

### 학습 박제

Phase 완료의 *사실·결정·증상·키워드*는 `-DONE.md`(AI가 박음)에 박힙니다. 세션 경계 기억은 memory(auto-memory `MEMORY.md`)가 담당 — 별도 knowledge 캐시는 두지 않습니다(솔로 + self-reinforcement 위험 회피).

### Post-flight 게이트 (훅 강제)

`-DONE.md` Write/Edit 시 [`../../scripts/hooks/phase-gate-validator.sh`](../../scripts/hooks/phase-gate-validator.sh)가 형식 검사. 누락 시 `exit 2`로 차단:

1. **YAML frontmatter 필수 필드**: `summary` / `phase` / `status` / `owner` / `grade`
2. **필수 H2 섹션** (복잡 이상): `TL;DR` / `AC 검증 결과` / `학습 일지 후보 키워드` / `5단계 보고`(🎯/🤔/🛠️/🧪/➡️ 구조)
3. **5단계 보고 5 라벨 + HTML 시각화 페어** (복잡 이상) ([`reporting-format.md`](reporting-format.md))
4. **`AC 검증 결과` 섹션 비어있지 않음**: 완료조건을 *실제로 실행한* 명령어 + 결과 박제 (추측·요약 X)

Phase는 자동 진행, 박제 시 빼먹기는 훅이 물리적으로 차단.

---

## 3. Phase 완료 시 세션 마감 권유

### 발동 시점

**마일스톤 마감 또는 영호 직접 확인 지점**에서만. Phase 자동 진행 중에는 권유 없이 `-DONE.md`/HTML 박제만 하고 진행.

### 출력 양식

```
**📚 Phase 완료 — 세션 마감 권유합니다**

`/session:end` — commit + (선택)PR + 다음 액션 결정까지 한 흐름
- 세션 마감 깜빡 위험 있으니 잊지 말기
- `pin-injector.sh` 훅이 commit 안 된 -DONE.md 검출 시 매 입력 경고 주입 (안전망)
```

### 권유 규칙

- **권유이지 강제 X**. 패스 시 즉시 존중
- **같은 Phase에 두 번 권유 X**
- **단순/보통 등급은 권유 X** (-DONE.md 박제 자체가 X)
- **복잡/대규모 등급만 권유 발동**

---

## 4. 라이프사이클 전체 (시각화)

```
[작업 시작]
   │
   ├─ /work:plan 호출 → AI가 current-pin 생성 (압축 5+1 필드)
   │   └─ 등급 결정 → PHASE 줄에 박힘
   │
[코드 작업 반복]
   │
   ├─ Edit/Write → AI가 핀의 "현재 작업 / 다음 액션"만 갱신
   │
   ├─ 위험 깃발 잡힘 → risk-detector.sh Hook이 자동 등급 상향
   │   └─ PHASE 줄에 상향 사유 박힘
   │
[Phase 완료 감지]
   │
   ├─ 복잡/대규모 등급:
   │   ├─ HTML 시각화 박제 (5단계 보고 구조 내장 — 인라인 출력 아님)
   │   ├─ -DONE.md 작성 (AI, 짝꿍 페어 경로) → 훅 검산
   │   ├─ commit
   │   ├─ 세션 마감 권유
   │   └─ AI가 핀 archived 또는 cleared
   │
   └─ 단순/보통 등급:
       ├─ commit message로 박제 충분
       └─ AI가 핀 cleared
```

---

## 5. work-pin = 단일 작업 좌표

work-pin(`.claude/state/current-pin.txt`, 매 응답 자동 주입)이 *유일한* 세션 간 핸드오프 표면. 안 변하는 사용자 컨텍스트(신분/목표/일정)는 memory가 보유.

→ 단 **work-pin 자체 비대**가 위험 → 30~40줄 목표 유지 + 마감 commit 이력·완료 Phase 상세는 CHANGELOG/`-DONE.md`로 위임 (핀에 누적 X).

### 5.1 진행 단계 stale hole 발견 게이트

**한계**: work-pin "현재 작업/다음 액션"이 실제 git/gh 진행 단계(commit / push / PR 생성 / PR 머지)와 어긋난 채 박힐 수 있음.

**게이트**: `/session:start` 0-부수 단계가 `git log -3` + `gh pr list --head $(branch)` + `git status -sb` 자동 호출 → work-pin 키워드 vs 실제 상태 대략 매칭 → 차이 발견 시 STOP + 본인 수동 갱신 안내.

**핵심 정신**: 발견만 자동, 갱신은 본인 수동 (Hook is for alert, not action). 사용자 명시 위임("drift 봉합해줘") 시 예외.

---

## 6. 변경 시 동기화 책임

본 정책 수정 시 *반드시* 함께 갱신: [`../../scripts/hooks/pin-injector.sh`](../../scripts/hooks/pin-injector.sh) (핀 주입) / [`../../scripts/hooks/phase-gate-validator.sh`](../../scripts/hooks/phase-gate-validator.sh) (-DONE.md 게이트) / [`../templates/pin-template.txt`](../templates/pin-template.txt) (압축 필드 + 루프 상태) / [`../templates/done-md-template.md`](../templates/done-md-template.md) (등급별 필수 섹션) / [`reporting-format.md`](reporting-format.md) (5단계 라벨 정합) / [`grade-and-risk.md`](grade-and-risk.md) (등급 박제 조건) / [`loop-driver.md`](loop-driver.md) · [`work-judge.md`](work-judge.md) (루프 상태 필드·갱신 주체).

---

## 갱신 이력

- 2026-06-26 — AgentDeck 이식 (ClaudeDev → manifest 기반). 경로 적응(훅 `scripts/hooks/`, Phase `phases/`, 상태 `.claude/state/`), ClaudeDev ADR 번호·CONTEXT 역사 정리, knowledge 트랙 → memory(auto-memory)로 대체(D1), owner 솔로 정합. work-pin 라이프사이클·등급별 박제·drift 게이트는 프로세스 골격이라 그대로.
