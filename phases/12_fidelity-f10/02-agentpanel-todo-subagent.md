# Phase 02: agentpanel-todo-subagent

## 목표
에이전트 패널 **할 일 진행바+체크박스** + **서브에이전트 카드 + SubAgentModal** + **변경파일 +/−·NEW/EDIT 태그**. 정적 샘플/optional prop.

## 담당 도메인 / 에이전트
renderer (src/renderer). 등급: 보통.

## 의존 Phase
F10-01.

## 위험 깃발
없음 (renderer. 새 IPC 0. todo/서브에이전트 실데이터=M4).

## 변경 대상 (이 경계 밖 금지)
- `src/renderer/src/components/AgentPanel.tsx`:
  - **Todos**: 진행바(`.progress > i{width:pct%}`) + todo 행(.todo .box[done IconCheck]·.lab·running spin, .done/.running/.planned). optional prop `todos`(기본 []) — 빈 시 기존 "아직 할 일이 없어요" 유지.
  - **SubAgent 카드**: `.subagent`(sa-ic saIcon 역할키워드 + sa-main[sa-name/sa-sub] + sa-status[running spin/done check/queued dot] + sa-chev) → 클릭 SubAgentModal. optional prop `subagents`(기본 []) — 빈 시 "아직 서브에이전트가 없어요".
  - **변경파일 FileRow**: FileBadge + path(dir+name) + stat + fchev. **라이브 store changedFiles=경로만 → stat(+add/−del·NEW/EDIT 태그) 미렌더(경로+badge+chev만)**. stat/tag 시각은 **샘플 ChangedFile 단위테스트에서만 시연**(add/del/tag=M4 diff 데이터). FileRow는 add/del/tag optional prop 받아 있을 때만 렌더.
  - **⚠️ 기존 단언 갱신**: `tests/renderer/agentpanel.test.tsx`의 changedFiles 행 단언(`.ag-file-item` 등)을 새 `.file`/FileRow 마크업에 맞춰 갱신. **`.ag-sec` 3개·빈상태 텍스트 불변 유지**(shell.e2e `.ag-sec` 3 단언 보존). `<AgentPanel/>` 무인자 호출 유지 — Shell.tsx 변경 0(prop은 단위테스트에서만 주입).
- `src/renderer/src/components/SubAgentModal.tsx`(신규 또는 AgentPanel 내부) — sa-overlay>sa-card: head(sa-card-ic+titles[name/role]+sa-card-status 대기/실행/완료+close) + body(activity sec[결과/설명, 텍스트] + 도구 sec[sa-tool verb/target/status, 빈 "사용한 도구가 없어요"]). Esc/바깥 닫기.
- `src/renderer/src/lib/agentSampleData.ts`(신규) — SAMPLE_TODOS({id,label,status:'done'|'running'|'planned'})[] + SAMPLE_SUBAGENTS({name,role,status:'queued'|'running'|'done',activity?,tools[]})[]. 단위테스트/시각 데모용. window.api 0.
- `src/renderer/src/components/AgentPanel.css`(또는 기존) — progress/todos/todo(.box/.lab/.done/.running/.planned) · subagent/sa-ic/sa-main/sa-name/sa-sub/sa-status/sa-check/sa-dot/sa-chev · sa-overlay/sa-card/sa-card-* · file/path/dir/stat/add/del/tag(.new/.edit)/fchev. 색 토큰.
- `src/renderer/src/components/icons.tsx` — IconBot 추가(없으면).

## 작업 단계
1. agentSampleData.ts.
2. Todos(진행바+행) + SubAgent 카드 + SubAgentModal + FileRow 태그.
3. optional props(todos/subagents 기본 []) — 라이브 빈상태 유지. populated=단위테스트 샘플 주입.
4. CSS. 인라인 색 0(progress width·동적 % 인라인 허용, 색 아님).
5. 단위 테스트.

## 완료조건 (AC — 측정 가능)
- [ ] `npm run typecheck` green.
- [ ] 테스트: SAMPLE_TODOS 주입 → progress width + todo 행(done 체크/running spin) · SAMPLE_SUBAGENTS 주입 → subagent 카드 + 클릭 시 SubAgentModal(활동+도구 섹션) · Esc 닫기 · FileRow 태그(NEW/EDIT) · 빈 prop → 기존 빈상태 유지. PASS.
- [ ] scope grep: AgentPanel window.api todo/subagent 호출 0(정적/prop).
- [ ] `<AgentPanel/>` 무인자 호출 유지(Shell.tsx 변경 0) · `.ag-sec` 3개·빈상태 텍스트 불변 · agentpanel.test 갱신 후 PASS.
- [ ] `npm run test`·`test:e2e` 회귀 0.

## 참조
원본 AgentPanel.tsx Todos L31/SubAgent L95/SubAgentModal L118/FileRow L57 · REPLICA_GAP F10.
