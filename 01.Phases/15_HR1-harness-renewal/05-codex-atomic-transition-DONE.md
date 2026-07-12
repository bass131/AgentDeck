---
summary: Codex 레이어 전체를 전담 보조 계약으로 단일 green 커밋 원자 전환 — AGENTS.md 재작성·권한 8→3·custom agent 9→2·훅 시크릿 차단 신설·doctor 3축+baseline 외부화, 스모크 통과·창 재봉인.
phase: 05-codex-atomic-transition
work-id: hr1-harness-renewal
status: done
grade: 대규모
owner: youngho
gate_version: 1
report_html: 00.Documents/reports/HR1-P05-전담보조-전환-완료.html
completed_at: 2026-07-13
commit: 851499c
---

# Phase 05 — Codex 전담 보조 원자 전환 완료 박제

**소요 시간**: 유지보수 창 개방 하 메인 직접 수술 (대규모)

## TL;DR

Codex 하네스 레이어 전체를 풀 드라이버 전제에서 "전담 보조"(리뷰·진단·rescue) 계약으로 **단일 green 커밋(851499c)에 원자 전환**하고 후속 3커밋(b2a08c4·2047272·6e9b9b1)으로 마무리했다. AGENTS.md 전면 재작성·권한 프로필 8→3·custom agent 9→2·브리지 8→2·훅 시크릿 직접 참조 차단 신설·doctor 3축 보고+baseline 외부화를 담았다. 계기는 두 가지 — 영호의 풀 드라이버 전제 철회(2026-07-12)와, 실측으로 드러난 보안 구멍(Windows sandbox는 쓰기만 강제·읽기 deny 미강제 → 시크릿 기계 차단이 사실상 0겹). 계약 테스트 30/30·doctor --live·라이브 스모크(영호 attended) 전부 통과했고 창은 재봉인됐다.

## 5단계 보고

- 🎯 **무엇을 만들었나** — Codex 레이어 전체를 전담 보조 계약으로 단일 green 커밋 원자 전환했다. AGENTS.md 전면 재작성(코어 CORE-NN 참조·위임 조직론 삭제·권한 진입 계약 명문화), 권한 프로필 8→3(root=`agentdeck-assistant` read-only+tmpdir / `agentdeck-rescue` 02.Source·tests 한정 쓰기 / readonly), custom agent 9→2(reviewer·plan-auditor, 영호가 effort xhigh 상향), 브리지 8→2, 훅 시크릿 직접 참조 차단 신설(digest 갱신), doctor 3축 보고(HOOK-GUARD/OS-READ-BOUNDARY/WRITE-BOUNDARY)+baseline 외부화(`00.Documents/harness/codex-baseline.json`), 계약 테스트 재작성, ADR-033 개정 1, manifest CORE-03 갱신, stash 브리지 5종 patch 아카이브 후 OID(99704c1b) 검증 drop.
- 🤔 **왜 필요한가** — 풀 드라이버 전제 철회(영호 2026-07-12)로 그 위에 쌓인 조직·권한·설정이 잉여가 됐고, 남기면 옛 결정 기반 사고의 씨앗이 된다. 겹쳐서, 실측 발견 — Windows sandbox는 쓰기만 강제하고 읽기 deny를 미강제해 시크릿 기계 차단이 사실상 0겹이었다(읽기 = 이미 유출). 그래서 훅에 시크릿 직접 참조 차단을 보상 통제로 신설했다. Sol(GPT-5.6) 3턴 설계 논의로 차단 2건(권한 진입 계약 부재·baseline 버전 미고정)을 봉합한 뒤 조건부 ship.
- 🛠️ **어떻게 만들었나** — 유지보수 창 개방 하 메인 직접 수술 + 영호 게이트 4지점(브리지 선별·stash drop GO·diff 전체 리뷰·라이브 스모크). 모든 변경을 단일 green 커밋에 담아 중간의 어정쩡한 상태가 저장소에 남지 않게 했다. 도입 당일 CLI 패치(0.144.0→0.144.1)로 `REVALIDATION_REQUIRED`가 첫 실전 발화 → 재실측(동일 판정) 후 baseline 기록 파일을 외부화(codex-baseline.json)해 패치 churn에 대처했다. 훅 시크릿 차단은 명령 문장 기반이라 우회 가능성을 인정하고 "안전망"으로만 ADR에 정직 기록(부분 보장 선언).
- 🧪 **테스트 결과** — 계약 테스트 30/30 pass(`node --test`), doctor --live exit 0(HOOK-GUARD PASS 3/3·OS-READ-BOUNDARY UNENFORCED_EXPECTED[0.144.1 baseline 일치]·WRITE-BOUNDARY PASS 5/5·LIVE-CONFORMANCE ACCEPTED_WITH_LIMITATION). 라이브 스모크(영호 attended): /hooks 재신뢰·root=assistant·브리지 2종 표시·시크릿 프로브 거부·rm -rf 프로브 차단·봉인 프로브=승인 후에도 훅 차단(심층 방어 증명) 전부 통과. custom agent 모델 라벨 실적용 확인은 P06 첫 실전 리뷰로 이월(0토큰 결정).
- ➡️ **다음 스텝** — P06 통합 검증(conformance 게이트·`agent-runs.ts` 주석·마감·PR 게이트) — 남은 유일 Phase. custom agent 모델 라벨 실적용 확인을 P06 첫 `$agentdeck-review`에서 수행. PR은 비가역이라 영호 사람 게이트 보존.

## AC 검증 결과

Phase 완료조건을 실제로 실행한 명령과 결과:

```text
$ node --test .codex/hooks/agentdeck-hook.test.mjs .codex/harness-contract.test.mjs
tests 30, pass 30, fail 0

$ node .codex/harness-doctor.mjs --live
exit 0 — HOOK-GUARD PASS 3/3 · OS-READ-BOUNDARY UNENFORCED_EXPECTED(0.144.1 baseline 일치) · WRITE-BOUNDARY PASS 5/5 · LIVE-CONFORMANCE ACCEPTED_WITH_LIMITATION
```

라이브 스모크(영호 attended) — 전부 통과:

- `/hooks` 재신뢰
- root = `assistant`(읽기 전용 기본)
- 브리지 2종 표시
- 시크릿 프로브 거부
- `rm -rf` 프로브 차단
- 봉인 프로브 = 승인 후에도 훅 차단 (심층 방어 증명)

이월(0토큰 결정): custom agent 모델 라벨 실적용 확인 → P06 첫 `$agentdeck-review`.

## 결정 흐름 (회고 참고용)

- 점진 전환 vs 단일 원자 커밋 → **원자 커밋** 채택. 중간 세션 중단·충돌 앞에서 반쯤 바뀐 하네스가 저장소에 남지 않게. 대가는 커밋 하나가 커지는 것.
- sandbox 읽기 deny 미강제 발견 후: 방치(문서 규칙만) vs 보상 통제 신설 → **훅 시크릿 직접 참조 차단** 신설. deny가 프로필에만 있고 실제 강제가 없으면 강제는 없는 것.
- baseline 버전 고정 방식: 코드 상수 vs 외부 파일 → **외부 파일**(codex-baseline.json). CLI 패치 churn에 코드 변경 없이 재실측 신호만 갱신.
- stash 처분: 위치 참조(stash@{0}) vs 불변 OID → **OID(99704c1b) 정확 일치 재검증 후 drop**. patch는 아카이브 존치(복원점).

## 막혔던 지점 (있다면)

- 도입 당일 Codex CLI 패치(0.144.0→0.144.1) → `REVALIDATION_REQUIRED` 첫 실전 발화. 재실측 결과 판정 동일(읽기 여전히 미강제) → baseline 기록을 외부 파일로 옮겨 매 패치 churn을 흡수.
- Sol 차단 2건(권한 진입 계약 부재·baseline 버전 미고정)이 초기 설계에 없었음 → 진입 계약 명문화 + baseline 튜플 버전 박제로 봉합 후 조건부 ship.

## 학습 일지 후보 키워드

- 원자 커밋 단위 원자성 (브랜치 아님)
- 불변 앵커(OID) vs 가변 참조
- 최소권한·승인 승격
- 부분 보장 가드레일의 정직한 선언
- baseline 튜플과 좋은 드리프트
- 프로브는 뚫려도 무해하게 설계
