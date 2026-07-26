# Harness Core — 엔진 중립 안전 정본 (v1)

> **지위**: 하네스 3층 구조(ADR-034)의 **공통 코어** — 어떤 코딩 엔진(Claude Code · Codex · 미래 엔진)이 와도 참인 안전 규칙의 *의미* 정본.
> **소비자**: `CLAUDE.md`(Claude 어댑터) · `AGENTS.md`(Codex 어댑터)는 본 문서를 참조하고, *어떻게 강제하는가*(훅·permission profile·execpolicy)만 각자 소유한다.
> **기계 매핑**: 조항별 어댑터 구현·검증 지점 = [`core-manifest.json`](core-manifest.json) (conformance 게이트가 미매핑·버전 불일치를 FAIL — HR1 P06).
> **개정 규칙**: 조항 의미 변경 = 사용자(영호) 단독 결정 + 해당 조항 버전 상향 + manifest·양 어댑터 동기 갱신. 본 문서는 *추출*이지 신규 입법이 아니다 — 원 출처는 각 조항에 표기.
>
> **경로 표기 갱신은 버전 상향 대상이 아니다** (방침 확정 2026-07-25, HR2 P09). 폴더 개명(ADR-028 개정 1, `02.Source` → `02_Source` 외 4종)으로 CORE-04 본문의 경로 표기가 바뀌었지만, 조항의 **의미**("IPC 계약은 `shared` 한 곳에서 정의한다")는 그대로다. 위 개정 규칙의 조건은 *"조항 **의미** 변경"* 이므로 해당하지 않는다 — CORE-04는 **v1 유지**. 같은 이유로 `core-manifest.json`의 경로 갱신도 조항 버전과 무관하다(다만 conformance가 경로 **실재**를 검사하므로 갱신 자체는 필수). ⚠️ 판단 기준은 *"이 줄을 읽고 행동이 달라지는가"* 다 — 달라지지 않으면 표기 갱신, 달라지면 의미 변경이다.

---

## CORE-01 신뢰 경계 (trust boundary) — v1

**규칙**: 파일시스템·자식 프로세스·데이터 저장·네트워크 권한은 **Electron main 프로세스 단독**. renderer는 untrusted(신뢰하지 않는 실행 환경)이며 preload가 화이트리스트한 IPC로만 권한 작업을 요청한다. `nodeIntegration:false`, `contextIsolation:true` 불변.
**위반 예**: renderer에서 fs/Node API 직접 호출, preload에 비화이트리스트 채널 노출.
**출처**: CLAUDE.md CRITICAL "신뢰 경계 불가침" · AGENTS.md §4 · ADR-007.

## CORE-02 엔진 추상화 — v1

**규칙**: 코딩 엔진 호출은 반드시 `AgentBackend` 인터페이스 경유. UI·영속화·IPC 핸들러는 구체 엔진(Claude/Codex)을 직접 알면 안 되며, 엔진 고유 출력은 어댑터에서 공통 `AgentEvent`로 정규화한다. 엔진 고유 리터럴은 어댑터 내부에만.
**출처**: CLAUDE.md CRITICAL "엔진 추상화 우회 금지" · AGENTS.md §4 · ADR-003.

## CORE-03 시크릿 보호 — v1

**규칙**: API 키·시크릿을 코드·테스트 픽스처·로그·문서·영속 데이터에 평문으로 남기지 않는다. `.env*`·`secrets/**`는 읽지 않는다. 시크릿 저장은 `.env`(git-ignored) 또는 OS 자격증명 소유자(현행: Claude Code OAuth/env — 앱은 비보관·읽기 전용, ADR-008).
**출처**: CLAUDE.md CRITICAL "API 키·시크릿 하드코딩 금지" · AGENTS.md §4 · ADR-008.

## CORE-04 IPC 계약 단일 정의 — v1

**규칙**: IPC 채널명·요청/응답 타입은 `02_Source/shared`에서 한 번만 정의하고 main·renderer 양쪽이 import한다. 문자열 채널명 산재 금지. shared 변경 후 양쪽 `npm run typecheck` green 확인 의무.
**출처**: CLAUDE.md CRITICAL "IPC 계약 단일 정의" · AGENTS.md §4.

## CORE-05 TDD — v1

**규칙**: 새 기능 구현은 **실패하는 테스트 먼저** → 통과 구현 순서(TDD, Test-Driven Development).
**출처**: CLAUDE.md CRITICAL "새 기능 구현 시 테스트 먼저" · AGENTS.md §4.

## CORE-06 비가역 사람 게이트 — v2

**규칙**: `git push` · PR 생성/머지 · 배포 · 패키지 릴리스/publish · 데이터 스키마 마이그레이션 · 신뢰 경계 변경은 **사용자 명시 GO 없이 실행하지 않는다**(무인 실행 금지). 에이전트 자율 루프도 이 게이트에서 정지한다. 그중 **명령형 비가역 6종**(`git push` · `gh pr create` · `gh pr merge` · `gh release` · `npm publish` · `npm run package`)은 GO를 받은 뒤에도 **에이전트가 직접 실행하지 않는다** — 실행 주체 자체를 사람에게 넘긴다.
**출처**: CLAUDE.md "개발 프로세스"·"운영 모드 (c)버킷" · AGENTS.md §6 · `.claude/hooks/dangerous-cmd-guard.sh` 축② · `.claude/policies/pr-and-merge-gate.md` · `work-judge.md`.

> **v2 개정(2026-07-26, A 스프린트 백로그 6)**: 명령형 비가역의 **실행 주체를 사람으로 고정**하고, 강제 층을 권한 1층 → 훅+권한 2층으로 올린다. 사유는 실측이다 — permission `ask`가 세션 권한 모드에 통째로 의존해, 같은 날 `git push`가 **2회 연속 무프롬프트**로 통과했다. 같은 모드에서 CORE-11(봉인)은 멀쩡했는데, 그 차이가 곧 원인이었다: 봉인은 deny + `supervisor-guard` **2층**이고 CORE-06만 권한 **1층**이었다. 빠진 층을 `dangerous-cmd-guard` 축②로 채웠고, 훅 exit 2가 그 모드에서 살아 있다는 것도 같은 날 실측했다.
>
> **왜 "묻기"가 아니라 "닫기"인가** — 훅이 할 수 있는 건 통과와 차단뿐이고(사람에게 묻는 것은 권한 계층의 기능인데, 고치려는 대상이 바로 그 계층이다), payload만으로는 *"이 명령을 사람이 승인했는가"* 를 **원리적으로 알 수 없다**. 승인 flag를 두면 에이전트가 그 flag를 쓸 수 있어 방어가 스스로를 무효화한다 — OpenGate(ADR-038)가 굳이 배치파일인 이유와 같다. 그래서 에이전트에게는 **항상 닫고**, 사람은 `!` 프리픽스로 실행한다. 그 경로는 도구 호출이 아니라 로컬 셸 실행이라 `PreToolUse`를 타지 않으며(2026-07-26 실측), 사람 경로가 늘 열려 있으므로 기능 손실은 없다.
>
> **`permissions.ask` 6줄은 존치한다** — 훅이 먼저 자르므로 평소에는 발화하지 않지만, 훅이 죽거나 우회됐을 때 받는 **2차층**이다. 안 쓰이는 것처럼 보인다고 "정리"하는 대상이 아니다(같은 성격의 것으로 `settings.json`의 옛 폴더명 deny 4줄이 있다 — 부분 롤백 대비).
>
> ⚠️ **어댑터 대칭 미완**: v는 조항 레벨(어댑터 공통)이지만 **Codex 어댑터는 아직 v1 semantics**다(execpolicy `prompt` = 승인 후 에이전트가 실행). CORE-12로 Claude가 `.codex/**`·`AGENTS.md`를 손댈 수 없어 영호의 Codex 세션 몫이며 백로그 10번으로 등재했다. `conformance-check.mjs`는 조항 v와 본 문서 헤더만 대조하고 **어댑터별 준수는 보지 않으므로**, 이 gap은 게이트가 green인 채로 남는다 — 그래서 코드가 아니라 이 문장이 유일한 방어선이다.

## CORE-07 파괴 명령 금지 — v1

**규칙**: `git reset --hard` · force push · `git checkout .`/`git clean -fd` 류 광범위 폐기 · 대량 파일 삭제를 에이전트가 실행하지 않는다. 사용자가 "버려도 돼"라 해도 절차 안내만, 실행은 사용자. `git add .`/`-A` 금지 — 스테이징은 명시 파일만. 작업 범위 밖 변경과 사용자 미추적 파일은 보존한다.
**출처**: AGENTS.md §6 · `/session:start` 게이트 (C) · `.claude/hooks/dangerous-cmd-guard.sh` 정책 의미.

## CORE-08 구조·의존성 변경 = ADR — v1

**규칙**: 새 최상위 디렉토리 · 프로덕션 의존성 추가 · 기술 스택 변경은 기존 ADR 근거 또는 신규 ADR(트레이드오프 기록) + 사용자 판단이 선행한다. 결정을 바꾸려면 ADR부터.
**출처**: CLAUDE.md "기술 스택"·"아키텍처 규칙" · AGENTS.md §4.

## CORE-09 커밋 규율 — v1

**규칙**: 커밋은 검증(해당 게이트 green) 후, 명시 파일만 스테이징하여 Conventional Commits(`feat:`/`fix:`/`docs:`/`refactor:`/`test:`) 형식으로. 게이트 red 상태의 커밋 금지.
**출처**: CLAUDE.md "개발 프로세스" · AGENTS.md §6.

## CORE-10 등급·보고 의미 — v1

**규칙**: 작업은 정량 4등급(단순/보통/복잡/대규모 — 도메인 수·줄 수·가역성 순 판정)으로 분류하고, 위험 깃발(trust-boundary·backend-contract·shared-contract·irreversible·ui-visual·harness) 검출 시 등급 자동 상향. 복잡 이상 = `-DONE.md` 박제 + 5단계 보고(🎯/🤔/🛠️/🧪/➡️). 등급·깃발의 *정의*는 `.claude/policies/grade-and-risk.md`가 단일 진실원이며 본 조항은 그 의미의 엔진 중립성만 선언한다.
**출처**: `.claude/policies/grade-and-risk.md` · `reporting-format.md` · AGENTS.md §5(의미 참조).

## CORE-11 하네스 봉인 — v1

**규칙**: 하네스(헌법 `CLAUDE.md`·`AGENTS.md`·`.claude/**`·`.codex/**`·`.agents/skills/**`·`.gitattributes`) 자체 변경은 **사용자 단독 통제**. 사용자가 명시 승인한 유지보수 창에서만 편집하고, 작업 후 재봉인 + 봉인 복구 프로브. 하네스 변경은 CHANGELOG 기록 의무.
**출처**: CLAUDE.md "멀티에이전트 분담"·"하네스 게이트" · AGENTS.md §2·§9 · supervisor-guard 정책 의미.

## CORE-12 엔진 런타임 격리 — v1

**규칙**: 엔진별 Hook runtime과 상태는 완전 격리 — Claude는 `.claude/hooks/**`·`.claude/state/**`만, Codex는 `.codex/hooks/**`·`.codex/state/**`만 사용하며 서로 읽기·쓰기·실행하지 않는다. 공유하는 것은 **정책의 의미**(본 코어)뿐. 한쪽 훅 결함 수리를 다른 쪽 파일 복사로 하지 않는다(각자 payload 규약에 맞는 독립 구현·테스트).
**출처**: CLAUDE.md "엔진별 Hook 격리" · AGENTS.md §2·§9.

## CORE-13 응대 원칙 (멘토링) — v2

**규칙**: 사용자(영호)는 학부생·멘토링 학습 중 — ① 친절·인내(당연함 가정 금지) ② 전문 용어·약어 첫 사용 시 풀어쓰기(외래어 음차 금지 — canary를 "카나리"로 쓰지 않음) ③ 결정엔 항상 trade-off(대안·이유·단점) ④ 완성된 한국어 문장(전보체 금지) ⑤ **응대 톤 = 같이 논의하고 수행하는 친근한 Pair Programmer·Pair Architect Engineer(반말체)**. 불확실한 사실은 추측하지 않고 실측·공식 문서로 확인.
**출처**: CLAUDE.md "응대 원칙" · AGENTS.md §3.

> **v2 개정(2026-07-25, HR2 P06)**: ⑤ 응대 톤을 추가한다. 영호가 `CLAUDE.md`에 직접 넣은 1줄을 의미 정본으로 끌어올린 것 — 어댑터에만 있고 코어에 없으면 다른 엔진이 그 톤을 모른다.
>
> ⚠️ **넣지 않기로 한 것 — 런타임 시스템 프롬프트와 중복**(착수 시 대조, 2026-07-25). 아래 세 규범은 Claude Code 시스템 프롬프트에 **거의 같은 문장으로 이미 존재**하므로 코어·어댑터 어디에도 기재하지 않는다(중복 기재는 상주 예산만 먹고 *"Then: Repeat yourself"* 안티패턴이 된다).
> - **범위 규율** — *"요청된 범위가 곧 산출물이다. 조용히 좁히거나 넓히거나 변형하지 않는다"*
> - **정정 절제** — *"사용자의 코드·결론·판단을 바꾸지 않는 오류는 굳이 정정 선언하지 않는다"*
> - **반복 제거** — *"이미 확립된 사실을 재유도하지 않고, 추구하지 않을 선택지를 나열하지 않는다"*
>
> ⚠️ 반복 제거를 **"짧게 써라"로 옮겨 적지 말 것** — 위 ④(완성된 한국어 문장·전보체 금지)와 정면 충돌한다. 걷어내는 대상은 *서론·중복 요약·이미 말한 것의 재진술*이지 문장의 완결성이 아니다.

---

## 부록 — 조항 요약표

| ID | v | 제목 | 강제 성격 |
|---|---|---|---|
| CORE-01 | 1 | 신뢰 경계 | 코드 구조 + 리뷰 + 깃발 |
| CORE-02 | 1 | 엔진 추상화 | 코드 구조 + 리뷰 + 깃발 |
| CORE-03 | 1 | 시크릿 보호 | 기계(profile deny·훅) + 리뷰 |
| CORE-04 | 1 | IPC 계약 단일 정의 | 기계(typecheck) + 깃발 |
| CORE-05 | 1 | TDD | 기계(훅) |
| CORE-06 | 2 | 비가역 사람 게이트 | 기계(훅 exit 2 + 권한/execpolicy prompt) + 사람 |
| CORE-07 | 1 | 파괴 명령 금지 | 기계(훅/execpolicy) |
| CORE-08 | 1 | 구조·의존성 = ADR | 문서 + 리뷰 |
| CORE-09 | 1 | 커밋 규율 | 문서 + secretary 절차 |
| CORE-10 | 1 | 등급·보고 의미 | 문서(정책 참조) |
| CORE-11 | 1 | 하네스 봉인 | 기계(훅·권한 deny) + 사람 |
| CORE-12 | 1 | 엔진 런타임 격리 | 기계(훅 경로) + 계약 테스트 |
| CORE-13 | 2 | 응대 원칙 | 문서 |
