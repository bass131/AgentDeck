---
owner: 영호
milestone: HR2
title: 하네스 Opus 5 리뉴얼 + 폴더 언더스코어 개명
status: done
grade: 대규모 (마일스톤 전체 — phase별 상이, frontmatter 참조)
created: 2026-07-25
---

# HR2 — 하네스 Opus 5 리뉴얼 마일스톤 계획

> **배경**: 영호의 동기는 불편 해소가 아니라 *"새 모델(Opus 5)로 재세팅해서 리뉴얼하려는 의지"*(2026-07-25). 그러나 착수 전 실측 — 공식 문서 정독 + **Ultracode 워크플로 10에이전트**(실측 6축 + 적대 검증 4건) — 에서 정비를 넘어 **"이미 조용히 고장 나 있던 것"**이 다수 드러났다. 본 마일스톤은 리뉴얼과 그 봉합을 함께 닫는다.
>
> **검증 상태**: 적대 검증 4건 중 **CONFIRMED 1 · PARTIAL 1 · REFUTED 2**. REFUTED 2건(개명 안전성·검증문구 삭제)은 플랜 승인 전에 설계를 뒤집어 반영 완료. 승인 = 영호 2026-07-25.
>
> **plan-auditor 판정(2026-07-25)**: **수정 후 GO** — 결함 8건 지적, **전부 실측 재확인 후 봉합 완료**. 그중 2건은 착수 전 필수였다:
> - **결함 1** — P07이 `.claude/settings.json`을 직접 고치라고 지시했는데, 그건 OpenGate가 개폐 때마다 **통째로 덮어쓰는 파생물**이다(`OPEN-GATE.bat:9`·`CLOSE-GATE.bat:10` 실측). 거기에 deny를 도로 써 넣으면 permission 계층은 gate flag로 우회되지 않으므로 **그 자리에서 자기 세션이 잠겨 P07을 못 끝낸다**. → canonical을 `settings.SEALED.json` 단독으로 정정
> - **결함 2** — `GATE_FLAG`를 "상수 일원화" 선택지에 넣어 뒀는데, 새 경로로 일원화하면 P08 전이라 flag를 못 찾아 **P07이 막으려는 사고를 P07이 스스로 일으킨다**. → 구·신 2경로 OR 검사 강제로 정정
>
> 나머지 6건: ADR-028 누락(P01) · OpenGate 선결 조건 3곳 누락(P04·P08·P09) · P09 담당이 secretary 금지 영역 침범 · 무주공산 정본 문서 5종 · P05 reviewer 게이트 부재 · P04 판정 기준 사후화. 주의 9건도 함께 반영.

## 🎯 목표

**"문서가 말하는 하네스와 실제로 동작하는 하네스를 일치시킨다."**

리뉴얼(모델·역할·티어를 Opus 5 기준으로 재정합)은 절반이고, 나머지 절반은 **문서만 살아 있고 런타임에선 죽었거나 뚫려 있던 것**을 닫는 일이다.

## 🔬 실측이 드러낸 고장 (본 마일스톤의 근거)

| # | 사실 | 근거 | 처리 Phase |
|---|---|---|---|
| 1 | **`model: opus` 별칭은 `claude-opus-4-8`로 스폰된다** | 2026-07-24 secretary 3스폰 트랜스크립트 model 필드 | P02 (full ID 전환) |
| 2 | **`coordinator`의 위임 권한이 이미 죽어 있다** | v2.1.220 + `SPAWN_DEPTH` 미설정 = 중첩 OFF. 서브에이전트 런타임에서 `Agent` 도구 부재 직접 관측 | P03 |
| 3 | **그 죽음이 기록되지 않았다** | `00_Documents/CHANGELOG.md:56` "coordinator Agent 유지 결정(영호 2026-07-11)"은 중첩이 켜져 있던 **v2.1.172~216 창 안**의 결정. 이후 재검토 기록 0 | P01·P03 |
| 4 | **`tee .claude/settings.json # it's fine`이 봉인을 통과한다** | `shell-policy.mjs:50` — 따옴표 불균형 시 토큰 0 반환. bash는 `#` 이후를 주석 처리하므로 **명령은 정상 실행** | P05 (최우선) |
| 5 | **`98.Management` 개명 = 자기 개방 구멍** | 개명 순간 OpenGate 폴더가 sealed 분류에서 빠져 에이전트가 `gate-open.flag`를 직접 생성 가능 | P07 |
| 6 | **개명이 봉인을 조용히 푼다** | `shell-policy.mjs:220-223,244` 정규식이 `00\.documents`로 이스케이프 — 매칭 실패 = `'unrelated'` = **fail-open** | P07 |
| 7 | **`.codex/harness-contract.test.mjs:131-136`이 coordinator의 `Agent` 보유를 기계 강제** | Agent 반납 시 red. CORE-12로 Claude 수정 불가 | P10 |
| 8 | **"소급 미수정" 선례는 이미 깨졌다** | 2026-07-11 리네임 후 e2e 4곳에 유령 경로 잔존 — `mkdirSync(recursive)`라 **에러 없이** 없는 폴더에 스크린샷을 쌓는다 | P09 |
| 9 | **plan-auditor는 훅 0건, reviewer는 advisory** | 실제 기계 강제는 TDD 하나뿐(+복잡 이상 `-DONE.md` AC 증적). `execution-owner.md:16,63`이 이를 "기계 게이트"로 **오분류** | P06 |
| 10 | **훅 테스트가 어떤 npm 게이트에도 안 물려 있다** | `vitest.config.ts:9` include는 `99.Others/tests/**`뿐. 실행법은 수동 `node --test`뿐(현 49/49 pass) | P05 |

## 📡 Opus 5 공식 가이드 실측 (2026-07-25 — 착수 직전 추가 근거)

영호가 가져온 자료 5건을 브라우저로 **원문까지 추적**해 확인했다. 결론부터: 5건 중 4건이 **같은 Anthropic 블로그의 요약·공유**였고, 나머지 1건(effort 경고)은 **근거가 약해 채택하지 않았다.**

| 자료 | 정체 | 채택 |
|---|---|---|
| [블로그 원문](https://claude.com/blog/the-new-rules-of-context-engineering-for-claude-5-generation-models) (Thariq Shihipar, Anthropic) | 정본 | ✅ |
| X @trq212 / @oikon48 / @yulmu_coffee ×2 | 위 블로그의 공유·요약(대조 결과 왜곡 없음) | ✅ (정본 경유) |
| X @ctgptlb *"effort 높이면 코딩 능력 떨어진다"* | 근거 링크·수치 없음. 출처 추정 벤치마크가 **방법론 미공개 + 자체 disclosure에서 미검증 인정 + `effort`를 `budget_tokens`로 설명하는 기술 오류** | ❌ 반증 |
| [공식 effort 문서](https://platform.claude.com/docs/en/build-with-claude/effort) · [Prompting Claude Opus 5](https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/prompting-claude-opus-5) | 추가 발굴한 1차 정본 | ✅ |

**플랜에 반영된 것 4가지**

1. **effort 배분 정정(P04)** — 1차 결정 "판정 렌즈만 xhigh"를 **"메인 세션 + `chief-tech-operator`만 xhigh, 나머지 기본 high"**로. 근거 = *"Code review and bug-finding: **Accuracy holds at lower effort settings**"* + *"step up to xhigh for **demanding coding and agentic work**"*.
2. **P04 판정선 교체** — "thinking 토큰 2배 차이"에서 **"산출물 결함 수"**로. 근거 = *"Effort controls thinking volume, not visible response length"* — 토큰이 갈리는 건 *동작한다*의 증거일 뿐 *좋아진다*의 증거가 아니다.
3. **P06 성격 확장 → 3분류 재편** — 공식이 *"'use a subagent to verify' 같은 지시를 제거하라. **legacy harness scaffolding that adds separate verification steps**도 마찬가지"*라고 명시. 우리 하네스가 정확히 그 구조다. 다만 같은 문서가 *"effective **writer-verifier patterns**"*를 강점으로 들므로 **①자기검증 독려(삭제) / ②컨텍스트 밖 실측(유지) / ③규율 축(유지+근거 재서술)** 3분류로 번역했다.
4. **P12 신설** — *"CLAUDE.md는 가볍게, repo의 gotcha에 토큰을 쓰고 **repo만 봐도 아는 뻔한 건 쓰지 마라**"* + Anthropic이 **자기 시스템 프롬프트 80%를 덜어내고도 코딩 평가 손실 없음**. 우리 CLAUDE.md는 118행이다. `/doctor` 진단 후 설계(영호 결정).

**⚠️ 이 마일스톤 자체가 만든 실측 반례 (P06 ③의 근거)**
plan-auditor가 Phase 정의에서 결함 8건을 잡았고 그중 2건은 **세션이 자기 권한을 잠그는 사고**였다. 메인은 Opus 5였고 자기 검증으로 못 잡았다 — 그 결함이 **메인이 읽지 않은 파일**에 있었기 때문이다. **자기 검증은 자기가 아는 것 안에서만 작동한다.**

---

## 🧭 범위 절단 결정 (영호 2026-07-25)

- **12 Phase 확정.** 초안은 6 Phase였으나 실측 후 ① ADR 선행(CORE-08)이 앞에 붙고 ② 개명이 5 Phase로 쪼개졌으며 ③ Opus 5 공식 가이드 실측 후 **P12(CLAUDE.md·Skills 다이어트)**가 추가됐다(영호 2026-07-25).
- ⚠️ **plan-auditor 주의 신호 명시**: 8+ Phase 마일스톤은 통상 분해 과다(재분할 대상) 신호일 수 있으나, 본 12 Phase는 **사용자(영호) 명시 결정**이다 — 개명 규모 실측(추적파일 698개·3,111줄·import 814건)을 보고 *"같은 마일스톤 유지, Phase를 쪼개기"*를 선택했다. 재분할 권고가 아니라 사용자 우선순위 반영임을 이 문서에 기록한다. (선례 = GAP1 16 Phase, `17_GAP1-core-parity/_milestone-plan.md:41`)
- **트랙 2분할** — 트랙 A(P01~P06 리뉴얼·봉합)와 트랙 B(P07~P11 개명)는 성격이 다르다. A가 green이 되기 전 B에 진입하지 않는다(직렬).
- **드롭: 루트 파일 정리(`03_Config` 신설)** — 실측상 보정 없이 옮길 수 있는 건 `dev.bat`·`LICENSE` 2개뿐이고, 나머지는 npm scripts에 `--config` 플래그가 붙고 상시 `npx vitest`/`npx playwright` 직접 실행이 깨진다. 영호 결정(2026-07-25) = **보류**. 초안이 파일럿으로 골랐던 `.eslintrc.cjs`는 오히려 **가장 위험한 선택**이었다(ignorePatterns가 config 디렉터리 기준 재기준화 → 루트 `out/`·`node_modules/` 무시 해제).
- **effort는 조건부** — P04는 라이브 A/B 프로브가 no-op을 보이면 **그 자리에서 드롭**하는 게이트형 Phase다. 이 저장소에서 effort는 여섯 번째 뒤집기라, 근거 없이 넣으면 다음 점검이 또 뺀다.

## 📊 Phase 표 (의존성 순)

| Phase | 제목 | 등급 | risk | loop_track | domain | 의존 |
|---|---|---|---|---|---|---|
| 01 | ADR 선행 (010·**028**·033·038) | 복잡 | harness·irreversible | human-gate | cross | — |
| 02 | 모델 정본 + 티어 4층 | 복잡 | harness | human-gate | cross | P01 |
| 03 | 역할 재편 (신설·축소·재정의) | 대규모 | harness | human-gate | cross | P02 |
| 04 | effort 도입 (메인+CTO만 xhigh · 품질 프로브 게이트) | 보통 | harness | human-gate | cross | P03 |
| 05 | 훅 보안 봉합 4건 + sed + 게이트 연결 | 대규모 | harness·trust-boundary | human-gate | cross | P01 |
| 06 | 검증 구조 **3분류 재편** + 강제 출처 라벨링 + CORE-13 | 대규모 | harness | human-gate | cross | P03 |
| 07 | 훅·봉인 경로 선행 (부트스트랩 자물쇠) | 복잡 | harness·trust-boundary | human-gate | cross | P05 |
| 08 | git mv + 빌드 체인 7파일 | 복잡 | harness·irreversible | human-gate | cross | P07 |
| 09 | 대량 치환 (import 814건 + 정본 문서 5종) | 대규모 | harness | human-gate | cross | P08 |
| 10 | Codex 대칭 갱신 (⚠️ 영호/Codex 전용) | 복잡 | harness | human-gate | cross | P08 |
| 11 | 발화 프로브 7종 + 마감 | 복잡 | harness | human-gate | qa | P09·P10·**P12** |
| 12 | 상주 컨텍스트 다이어트 (CLAUDE.md·listing·MEMORY) | 복잡¹ | harness | human-gate | cross | **P06**·P09 (+`/doctor` ✅) |

¹ **P12는 번호상 마지막이지만 실행은 P11(마감) *앞*이다.** 등급은 `/doctor` 진단(2026-07-25 완료) 후 **복잡**으로 확정 — 상주 예산 실측 **4,440 tok**(CLAUDE.md 2,608 / description listing 1,015 / MEMORY 인덱스 717 / 글로벌 100)이 나왔고, 대상이 헌법 본문이라 등급이 낮을 수 없다.
**⚠️ 의존이 하나 늘었다: P06.** 초안은 `P09 + /doctor`만 걸었으나, P06의 **강제 출처 라벨** 없이는 *"훅이 지키는 규칙"*과 *"문서 규범 전용 규칙"*이 겉보기로 구분되지 않는다 — 후자를 policies로 옮기면 그건 이동이 아니라 **조용한 삭제**다. 상세 = [`12-context-diet.md`](12-context-diet.md).
✅ `/doctor`는 영호가 직접 입력해 **완료**(빌트인 CLI라 에이전트 호출 불가). 선불 회수 **-134 tok**(`meetingnote` 스킬 비활성화, description 536자로 전 항목 중 최대였음).

**병렬 가능**: P05는 P01만 의존하므로 P02~P04와 병렬 가능(단 둘 다 봉인 안이라 같은 창에서 진행). P09 ↔ P10은 서로 독립(P10은 실행 주체가 다름). ~~P12~~ **P12는 P06 의존이 생겨 병렬 대상에서 빠진다.**

## 🔒 선결 조건 — OpenGate (ADR-038)

**P01~P09는 전부 봉인 안**(`.claude/**`·`CLAUDE.md`·`00.Documents/harness`·`adr`·`98.Management`)이다. — ⚠️ 초안은 "P01~P08"이라 적었으나 **P09도 `.claude/policies/**`·`.claude/agents/**`·`conformance-check.mjs`·`core-manifest.json`·`CORE.md`를 고친다**(plan-auditor 실측 정정).

- 개방 = **영호가 직접** `98.Management\Harness_OpenGate\OPEN-GATE.bat` 실행. **에이전트는 deny**(자기 개방 방지) — 상태 읽기·개방 요청만 가능.
- **TTL 4h** 자동 재봉인 → Phase 경계마다 재오픈 필요.
- 마감 시 `CLOSE-GATE.bat` + 재봉인 검증 + `/hooks` 재신뢰.
- ⚠️ **P07의 순서 함정**: `supervisor-guard.sh:30`의 `GATE_FLAG`가 `98.Management`를 하드코딩한다. 그 폴더를 먼저 옮기면 **창을 열어도 안 열리고** 남은 봉인 파일을 그 자리에서 못 고친다. 그래서 P07(훅 경로)이 P08(개명)보다 **반드시 앞**이다.

## 🐕 마일스톤 인수 시나리오

> 마감 게이트에서 1회 통주 — 담당 qa + 영호.

1. 새 경로 `00_Documents/00_Harness/CORE.md` Edit 시도 → **차단**
2. `02_Source` 파일 Edit 시도 → **Worker 위임 차단**
3. 읽기 전용 `sed -n '1,5p' .claude/agents/*.md` → **통과**(오탐 해소)
4. `sed -i` + `.claude` 경로 → **여전히 차단**(회귀 없음)
5. `tee .claude/settings.json # it's fine` → **차단**(fail-open 봉합)
6. OpenGate OPEN → 훅 통과 로그(`guard-blocks.log` open-gate) 기록
7. 훅 테스트 + `.codex` 테스트 전부 green, 루트에 옛 이름 폴더 재생성 0

## ✅ 마일스톤 완료 조건

- 12 Phase 전부 `status: done` (P10 포함 — 빠지면 Codex 쪽 가드만 조용히 죽은 채 남는다)
- 회귀 게이트 5종: `typecheck` 0 · `test` green · `lint` 0 · `build` 성공 · e2e 최소 1본
- 신설 `npm run test:hooks` green (훅 셀프테스트가 회귀 게이트에 연결됨 — P05 산출)
- 인수 시나리오 7항 전부 실측 통과 (*테스트 통과만으로 갈음하지 않는다*)
- CHANGELOG `[H]` 등재 + 재봉인 + `/hooks` 재신뢰
- 사람 게이트: push · PR (CORE-06)

## ⚠️ 마일스톤 함정

- **셀프테스트 false green** — 정규식과 테스트가 **둘 다** 옛 경로면 테스트는 계속 통과한다. P07의 완료 조건은 "테스트 green"이 아니라 **"새 경로로 봉인이 걸리는 것을 검증하는 테스트가 존재하고 green"**이다.
- **부분 수정이 가장 나쁘다** — `tdd-guard`는 `:30`(대상 판정)과 `:37-40`(테스트 탐색)을 **짝으로** 고쳐야 한다. 한쪽만 고치면 전 파일 과차단 또는 여전히 fail-open.
- **`.claude/settings.json`은 canonical이 아니라 파생물** — OpenGate가 개폐 때마다 `settings.OPEN.json`/`settings.SEALED.json`을 통째로 복사해 덮어쓴다(실측). 거기를 직접 고치면 ① 창이 열린 동안 deny를 써 넣는 순간 **permission 계층이 gate flag로 우회되지 않아 자기 세션이 잠기고** ② 성공해도 CLOSE 때 사라진다. **편집은 `settings.SEALED.json` 단독**, 반영 확인은 P11의 CLOSE 이후.
- **git mv의 이력 보존은 파일 단위 `--follow` 한정** — 디렉토리 로그·blame 연속성은 끊긴다(실측: 디렉토리 로그 1커밋). 항법 노트 신설로 보완한다.
- **승인 습관화** — P08이 `git mv`를 대량 승인시키는데, git 서브커맨드는 현재 봉인을 통과한다(P05에서 봉합). 승인 피로가 곧 우회 키 입력이 되지 않게 P05를 먼저 닫는다.

## 📚 이번 마일스톤에서 배울 핵심 개념

- **fail-open vs fail-closed** — 판정기가 실패했을 때 통과시키는가 막는가. 보안 가드에서 이 기본값 선택이 전부를 가른다.
- **사일런트 회귀** — 런타임 기본값이 바뀌었는데 문서·설정이 그대로면 에러 없이 기능만 죽는다(#2·#3). 정적 검사로는 안 잡히고 **발화 프로브**로만 잡힌다.
- **기계 강제 vs 문서 규범** — 같은 문장이라도 훅이 받쳐주면 게이트, 아니면 권고다. 이 구분 없이 문서를 정리하면 안전장치가 사라진다(#9).
- **부트스트랩 자물쇠** — 잠금을 여는 열쇠가 잠긴 방 안에 있는 상황. 순서로만 풀린다.
