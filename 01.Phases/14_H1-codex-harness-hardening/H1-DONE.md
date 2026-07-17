---
summary: Codex Harness의 Hook·권한·모델 계층을 검증 가능하게 수리하고 custom agent 관측 한계를 degraded로 확정했다.
phase: H1-codex-harness-hardening
work-id: H1-codex-harness-hardening
status: done
grade: 대규모
owner: youngho
gate_version: 1
report_html: 00.Documents/reports/milestones/H1-Codex하네스-강화.html
completed_at: 2026-07-10
commit: dbc99ad
---

# H1 — Codex Harness 실행 계약과 비용 계층 보강 완료

## TL;DR

Claude Code Harness를 정본으로 보존하면서 Codex 전용 Hook, permission profile, custom agent model mapping과 검증기를 정합화했다. 메인은 Full Access, SubAgent는 역할별 최소 권한으로 분리했고 Windows Hook 실패 배너와 sandbox 초기화 충돌을 제거했다. 현 host가 custom agent selector와 실제 model telemetry를 노출하지 않는 한계는 사용자 승인에 따라 degraded mode로 수용한다.

## 5단계 보고

- 🎯 **무엇을 만들었나** — 네 lifecycle Hook, 세 SubAgent permission profile, Sol·Terra·Luna 9역할 매핑, execpolicy와 static/live Harness doctor를 완성했다.
- 🤔 **왜 필요한가** — 문서·설정·실제 런타임이 어긋난 상태에서는 Hook 보호, 역할 경계와 모델 비용 절감을 신뢰할 수 없기 때문이다.
- 🛠️ **어떻게 만들었나** — root는 Full Access로 단순화하고 SubAgent에 최소 권한을 집중했다. stale digest는 fail-open no-op으로 바꿔 실패 소음을 제거하고, `.codex/state` 보호 경로 write 승격은 root runtime 관리로 전환했다.
- 🧪 **테스트 결과** — Harness 27/27, doctor permissions 3/3·hooks 4/4·models 3/3, typecheck 0, Vitest 4,566 PASS, lint 0, Desktop Hook 네 이벤트 live PASS를 확인했다.
- ➡️ **다음 스텝** — native custom agent selector와 model telemetry가 제공되면 역할별 실제 모델 적용을 다시 검증한다. 그전에는 TOML mapping을 미래 호환 설정으로만 유지한다.

## AC 검증 결과

```text
$ node --test .codex/hooks/agentdeck-hook.test.mjs .codex/harness-contract.test.mjs
tests 27, pass 27, fail 0

$ node .codex/harness-doctor.mjs --live
STATIC: PASS
LIVE-CANARY: PASS — permissions 3/3, hooks 4/4, models 3/3

$ npm run typecheck
0 errors

$ npm run test
Test Files 308 passed, 5 skipped / Tests 4566 passed, 8 skipped

$ npm run lint
0 problems

$ codex execpolicy check --rules .codex/rules/agentdeck.rules git push origin branch
decision: prompt

$ codex execpolicy check --rules .codex/rules/agentdeck.rules curl https://example.com
decision: forbidden
```

수동 live acceptance:

- `UserPromptSubmit`: PASS
- `PreToolUse`: PASS
- `PostToolUse`: PASS
- `SubagentStart`: PASS
- generic 및 `task_name=secretary` probe: custom role/model 미관측, root Full Access 상속 확인

## 결정 흐름

- root read-only 유지 대 root Full Access 중, Windows sandbox 초기화 마찰을 제거하기 위해 root Full Access를 채택하고 최소 권한은 SubAgent에 집중했다.
- stale digest exit 1 대 fail-open no-op 중, Hook이 보안 경계가 아니라 guardrail이라는 계약에 맞춰 no-op과 doctor 검증 조합을 채택했다.
- CLI wrapper 신설 대 degraded 수용 중, native thread 연결을 잃는 별도 wrapper는 범위를 확대하므로 degraded 수용을 채택했다.

## 막혔던 지점

- 모든 Hook이 실패로 표시됨 → Windows sandbox helper와 stale digest exit 1이 겹친 문제 → root Full Access, digest no-op, 네 이벤트 순차 재활성화로 해결했다.
- `agentdeck-operations` 초기화 실패 → `.codex/state/**` write 승격이 Codex 보호 경로와 충돌 → secretary는 pin 갱신안을 반환하고 root가 runtime state를 반영하도록 수정했다.
- custom role/model 검증 불가 → Codex 0.144.0의 `spawn_agent`와 app-server schema에 selector/telemetry 없음 → degraded mode로 명시했다.
- 최종 doctor의 자식 프로세스 시작 실패가 `TypeError`로 가려짐 → stdout·stderr 부재와 spawn error를 안전하게 진단하는 회귀 테스트를 추가했다.

## 학습 일지 후보 키워드

- Codex lifecycle Hook trust와 cachebuster
- Windows permission profile protected paths
- fail-open guardrail과 sandbox security boundary
- custom agent model observability
- main Full Access와 SubAgent least privilege
