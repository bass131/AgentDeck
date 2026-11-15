# M05 G12 이동 표 — renderer 1: 헬퍼와 `00_App`·`01_Ipc`·`02_Common`·`03_Agent` (119행)

- 소유: `99c_Goal-G12-테스트-미러-배치.md` · 근거: `99d_G12-재실측.md` · 경로는 `02_Project/01_TestCode/` 기준
- 읽는 법: 한 행이 `git mv` 하나다. 셋째 열은 첫 줄 주석으로 내릴 작업 ID(없으면 —)와, 규칙 기본값이 아닌 판정의 근거(`tie:name`·`tie:non-generic`·`tie:first-import`·`fs-read`·`override`)다.
- 기계 생성: 세션 스크래치의 읽기 전용 분석기가 만들었다. 검사 결과는 `99e`와 같다(표 셋 합 435행, 중복·충돌·누락 0).
- 이동 3a다. 헬퍼 셋을 옮기는 커밋은 헬퍼를 import하는 이 표 밖 파일(renderer 나머지, `integration/core-loop.test.ts`)의 import도 함께 고친다.

| 지금 경로 | 새 경로 | 작업 ID(첫 줄 주석) |
|---|---|---|
| `renderer/boot-gate.test.tsx` | `renderer/00_App/AppGate.boot.test.tsx` | — |
| `renderer/m4-4-agentpanel-store.test.tsx` | `renderer/00_App/appStore.agentpanel.test.tsx` | `m4-4` · tie:name |
| `renderer/adr020-cwd-anchor.test.ts` | `renderer/00_App/appStore.cwd-anchor.test.ts` | `adr020` |
| `renderer/p13-file-tree-refresh.test.ts` | `renderer/00_App/appStore.file-tree-refresh.test.ts` | `p13` |
| `renderer/image-attach.test.ts` | `renderer/00_App/appStore.image-attach.test.ts` | — |
| `renderer/gap1-p13-live-mode-picker.test.ts` | `renderer/00_App/appStore.live-mode-picker.test.ts` | `gap1-p13` |
| `renderer/loop-store.test.ts` | `renderer/00_App/appStore.loop.test.ts` | — · tie:name |
| `renderer/multi-session-store.test.ts` | `renderer/00_App/appStore.multi-session.test.ts` | — |
| `renderer/m4-4-permission-store.test.ts` | `renderer/00_App/appStore.permission.test.ts` | `m4-4` · tie:name |
| `renderer/m4-4-question-store.test.ts` | `renderer/00_App/appStore.question.test.ts` | `m4-4` · tie:name |
| `renderer/queue-drain.test.ts` | `renderer/00_App/appStore.queue-drain.test.ts` | — |
| `renderer/lr2-01-replmode-default.test.ts` | `renderer/00_App/appStore.replmode-default.test.ts` | `lr2-01` |
| `renderer/session-crud.test.ts` | `renderer/00_App/appStore.session-crud.test.ts` | — |
| `renderer/lr1-phase03-session-save.test.ts` | `renderer/00_App/appStore.session-save.test.ts` | `lr1-phase03` |
| `renderer/lr2-04-sessionkey-stability.test.ts` | `renderer/00_App/appStore.sessionkey-stability.test.ts` | `lr2-04` |
| `renderer/cp1-p05-subagent-persist-store.test.ts` | `renderer/00_App/appStore.subagent-persist.test.ts` | `cp1-p05` · tie:name |
| `renderer/m4-4-subagent-store.test.ts` | `renderer/00_App/appStore.subagent.test.ts` | `m4-4` · tie:name |
| `renderer/switch-continuity-repro.test.ts` | `renderer/00_App/appStore.switch-continuity-repro.test.ts` | — |
| `renderer/task-scope.test.ts` | `renderer/00_App/appStore.task-scope.test.ts` | — |
| `renderer/csp.test.ts` | `renderer/00_App/index.csp.test.ts` | — · override |
| `renderer/helpers/multiCmdMock.ts` | `renderer/00_Helpers/multiCmdMock.ts` | — |
| `renderer/helpers/storeReset.ts` | `renderer/00_Helpers/storeReset.ts` | — |
| `renderer/helpers/windowApiMock.ts` | `renderer/00_Helpers/windowApiMock.ts` | — |
| `renderer/g10-ipc-client.test.ts` | `renderer/01_Ipc/index.ipc-client.test.ts` | `g10` · override |
| `renderer/fullscreen-overlay.test.tsx` | `renderer/02_Common/FullscreenOverlay.test.tsx` | — |
| `renderer/modal.test.tsx` | `renderer/02_Common/Modal.test.tsx` | — |
| `renderer/tg1-p09-provider-brand.test.ts` | `renderer/02_Common/providerBrand.test.ts` | `tg1-p09` |
| `renderer/ProviderBrandIcon.test.tsx` | `renderer/02_Common/ProviderBrandIcon.test.tsx` | — |
| `renderer/theme.test.ts` | `renderer/02_Common/theme.test.ts` | — |
| `renderer/agentCapsule.smoke.test.ts` | `renderer/03_Agent/agentCapsule.smoke.test.ts` | — · override |
| `renderer/agentpanel-detail.test.tsx` | `renderer/03_Agent/AgentPanel.detail.test.tsx` | — |
| `renderer/agentpanel-fileopen.test.tsx` | `renderer/03_Agent/AgentPanel.fileopen.test.tsx` | — · tie:non-generic |
| `renderer/agentpanel-subagent-lifecycle.test.tsx` | `renderer/03_Agent/AgentPanel.subagent-lifecycle.test.tsx` | — · tie:non-generic |
| `renderer/m4-4-subagent-panel.test.tsx` | `renderer/03_Agent/AgentPanel.subagent.test.tsx` | `m4-4` · tie:name |
| `renderer/b2-task-scope-panel.test.tsx` | `renderer/03_Agent/AgentPanel.task-scope.test.tsx` | `b2` · tie:name |
| `renderer/agentpanel.test.tsx` | `renderer/03_Agent/AgentPanel.test.tsx` | — |
| `renderer/cp1-p06-agentpanel-tracking-prune.test.tsx` | `renderer/03_Agent/AgentPanel.tracking-prune.test.tsx` | `cp1-p06` |
| `renderer/lr4-p01-interrupt-stuck-repro.test.ts` | `renderer/03_Agent/backgroundRuns.interrupt-stuck-repro.test.ts` | `lr4-p01` |
| `renderer/switch-continuity-persistence.test.ts` | `renderer/03_Agent/backgroundRuns.switch-continuity-persistence.test.ts` | — · tie:non-generic |
| `renderer/switch-continuity-seamless.test.ts` | `renderer/03_Agent/backgroundRuns.switch-continuity-seamless.test.ts` | — · tie:non-generic |
| `renderer/cmdresult.test.ts` | `renderer/03_Agent/cmdCards.cmdresult.test.ts` | — |
| `renderer/gap1-p15-r2-gauge-cache.test.ts` | `renderer/03_Agent/gaugeCalc.cache.test.ts` | `gap1-p15-r2` |
| `renderer/m4-1-picker-gauge.test.ts` | `renderer/03_Agent/gaugeCalc.picker.test.ts` | `m4-1` · tie:name |
| `renderer/gap1-p05-hook-cockpit-render.test.tsx` | `renderer/03_Agent/HookTimeline.cockpit-render.test.tsx` | `gap1-p05` · override |
| `renderer/bf3-p07-banner-continuity-bgruns.test.ts` | `renderer/03_Agent/loopDisplay.banner-continuity-bgruns.test.ts` | `bf3-p07` |
| `renderer/cp1-p06-loop-display-registry-detail.test.ts` | `renderer/03_Agent/loopDisplayRegistry.detail.test.ts` | `cp1-p06` |
| `renderer/bl1-followup-goal-lifecycle-unify.test.tsx` | `renderer/03_Agent/loopStatus.goal-lifecycle-unify.test.tsx` | `bl1-followup` |
| `renderer/gap1-p15-r1-s4-goal-stop-affordance.test.tsx` | `renderer/03_Agent/LoopStatusBanner.goal-stop-affordance.test.tsx` | `gap1-p15-r1-s4` · tie:first-import |
| `renderer/loop-status-banner.test.tsx` | `renderer/03_Agent/LoopStatusBanner.test.tsx` | — |
| `renderer/modelLabel.test.ts` | `renderer/03_Agent/modelLabel.test.ts` | — |
| `renderer/orchestration-card.test.tsx` | `renderer/03_Agent/OrchestrationCard.test.tsx` | — |
| `renderer/uc1-p10-orchestration-denied-display.test.tsx` | `renderer/03_Agent/orchestrationDeniedCopy.display.test.tsx` | `uc1-p10` · tie:name |
| `renderer/uc1-p10-orchestration-denied.test.ts` | `renderer/03_Agent/orchestrationDeniedCopy.test.ts` | `uc1-p10` · tie:name |
| `renderer/uc1-p05-keyword-segments.test.ts` | `renderer/03_Agent/orchestrationKeyword.segments.test.ts` | `uc1-p05` |
| `renderer/uc1-p04-keyword-trigger.test.ts` | `renderer/03_Agent/orchestrationKeyword.trigger.test.ts` | `uc1-p04` |
| `renderer/panel-session.test.ts` | `renderer/03_Agent/panelSession.apply.test.ts` | — · override |
| `renderer/g9c-backlog46-dispose.test.tsx` | `renderer/03_Agent/panelSession.backlog46-dispose.test.tsx` | `g9c` |
| `renderer/bf3-p07-banner-continuity-panel.test.tsx` | `renderer/03_Agent/panelSession.banner-continuity.test.tsx` | `bf3-p07` |
| `renderer/fb2-p08-banner-revision.test.tsx` | `renderer/03_Agent/panelSession.banner-revision.test.tsx` | `fb2-p08` · tie:first-import |
| `renderer/cp1-p03-panel-cwd-wiring.test.tsx` | `renderer/03_Agent/panelSession.cwd-wiring.test.tsx` | `cp1-p03` · tie:name |
| `renderer/p15-panel-cwd.test.tsx` | `renderer/03_Agent/panelSession.cwd.test.tsx` | `p15` · tie:name |
| `renderer/g9c-difference-pins.test.tsx` | `renderer/03_Agent/panelSession.difference-pins.test.tsx` | `g9c` |
| `renderer/lr4-p05-goal-banner-liveness.test.ts` | `renderer/03_Agent/panelSession.goal-banner-liveness.test.ts` | `lr4-p05` |
| `renderer/panel-session-image.test.ts` | `renderer/03_Agent/panelSession.image.test.ts` | — |
| `renderer/panel-input-palettes.test.tsx` | `renderer/03_Agent/panelSession.input-palettes.test.tsx` | — · tie:name |
| `renderer/lr3-p07-multipanel-continuity.test.tsx` | `renderer/03_Agent/panelSession.multipanel-continuity.test.tsx` | `lr3-p07` · tie:first-import |
| `renderer/multipanel-scroll-reattach.test.tsx` | `renderer/03_Agent/panelSession.multipanel-scroll-reattach.test.tsx` | — · tie:first-import |
| `renderer/multipanel-working-indicator.test.tsx` | `renderer/03_Agent/panelSession.multipanel-working-indicator.test.tsx` | — · tie:first-import |
| `renderer/orchestration-panel-parity.test.ts` | `renderer/03_Agent/panelSession.orchestration-parity.test.ts` | — · tie:name |
| `renderer/orchestration-send-args.test.ts` | `renderer/03_Agent/panelSession.orchestration-send-args.test.ts` | — |
| `renderer/gap1-p01-panelview-todos.test.tsx` | `renderer/03_Agent/panelSession.panelview-todos.test.tsx` | `gap1-p01` · tie:first-import |
| `renderer/bf3-p06-permission-panel-wiring.test.tsx` | `renderer/03_Agent/panelSession.permission-wiring.test.tsx` | `bf3-p06` · tie:name |
| `renderer/m3-persist.test.ts` | `renderer/03_Agent/panelSession.persist.test.ts` | `m3` · tie:non-generic |
| `renderer/g9b-queue-core.test.tsx` | `renderer/03_Agent/panelSession.queue-core.test.tsx` | `g9b` |
| `renderer/lr4-p07-repl-per-session-multi-send.test.tsx` | `renderer/03_Agent/panelSession.repl-per-multi-send.test.tsx` | `lr4-p07` |
| `renderer/lr4-p07-repl-per-session-multi.test.ts` | `renderer/03_Agent/panelSession.repl-per-multi.test.ts` | `lr4-p07` |
| `renderer/lr1-resume-bug.test.tsx` | `renderer/03_Agent/panelSession.resume-bug.test.tsx` | `lr1` · tie:first-import |
| `renderer/resume-session.test.ts` | `renderer/03_Agent/panelSession.resume.test.ts` | — · tie:name |
| `renderer/g9a-run-core-alignment.test.tsx` | `renderer/03_Agent/panelSession.run-core-alignment.test.tsx` | `g9a` · tie:non-generic |
| `renderer/panel-session.test.tsx` | `renderer/03_Agent/panelSession.slot.test.tsx` | — · override |
| `renderer/subagent-transcript-panel-parity.test.ts` | `renderer/03_Agent/panelSession.subagent-transcript-parity.test.ts` | — |
| `renderer/panel-session-systemprompt.test.ts` | `renderer/03_Agent/panelSession.systemprompt.test.ts` | — |
| `renderer/m3-thread-restore-hook.test.tsx` | `renderer/03_Agent/panelSession.thread-restore-hook.test.tsx` | `m3` |
| `renderer/m3-thread-restore.test.ts` | `renderer/03_Agent/panelSession.thread-restore.test.ts` | `m3` |
| `renderer/g9b-panel-thread.test.tsx` | `renderer/03_Agent/panelSession.thread.test.tsx` | `g9b` · tie:first-import |
| `renderer/tg1-p06-panel-turn-blocks.test.tsx` | `renderer/03_Agent/panelSession.turn-blocks.test.tsx` | `tg1-p06` · tie:first-import |
| `renderer/bf3-p06-permission-inline-card.test.tsx` | `renderer/03_Agent/PermissionCard.inline.test.tsx` | `bf3-p06` · tie:name |
| `renderer/gap1-p07-plan-approval-card.test.tsx` | `renderer/03_Agent/PermissionCard.plan-approval.test.tsx` | `gap1-p07` · override |
| `renderer/gap1-p15-r1-s2-planpath-basename.test.tsx` | `renderer/03_Agent/PermissionCard.planpath-basename.test.tsx` | `gap1-p15-r1-s2` · tie:first-import |
| `renderer/phase18-audit-fix.test.tsx` | `renderer/03_Agent/pickerOptions.audit-fix.test.tsx` | `phase18` |
| `renderer/gap1-p02-model-persist.test.ts` | `renderer/03_Agent/pickerOptions.model-persist.test.ts` | `gap1-p02` |
| `renderer/p7-shift-tab-mode-cycle.test.tsx` | `renderer/03_Agent/pickerOptions.shift-tab-mode-cycle.test.tsx` | `p7` · tie:first-import |
| `renderer/promptCapsule.smoke.test.ts` | `renderer/03_Agent/promptCapsule.smoke.test.ts` | — · override |
| `renderer/dialogs-f11.test.tsx` | `renderer/03_Agent/PromptModal.dialogs.test.tsx` | `f11` |
| `renderer/provider-status-panel.test.tsx` | `renderer/03_Agent/ProviderStatusPanel.test.tsx` | — |
| `renderer/f14-modals.test.tsx` | `renderer/03_Agent/QuestionModal.modals.test.tsx` | `f14` |
| `renderer/g9a-run-core.test.ts` | `renderer/03_Agent/runCore.test.ts` | `g9a` |
| `renderer/g9c-branch-cleanup.test.tsx` | `renderer/03_Agent/sessionKeys.branch-cleanup.test.tsx` | `g9c` |
| `renderer/g9c-session-keys.test.ts` | `renderer/03_Agent/sessionKeys.test.ts` | `g9c` |
| `renderer/g9c-b1-sidebar-running.test.tsx` | `renderer/03_Agent/sessionRegistry.b1-sidebar-running.test.tsx` | `g9c` |
| `renderer/g9c-session-registry.test.ts` | `renderer/03_Agent/sessionRegistry.test.ts` | `g9c` |
| `renderer/gap1-p14-splitview-container.test.tsx` | `renderer/03_Agent/splitView.container.test.tsx` | `gap1-p14` |
| `renderer/gap1-p14-splitview-policy.test.ts` | `renderer/03_Agent/splitView.policy.test.ts` | `gap1-p14` |
| `renderer/bl1-p03-goal-banner-stale-watchdog.test.tsx` | `renderer/03_Agent/staleWatchdog.goal-banner.test.tsx` | `bl1-p03` |
| `renderer/cp1-p06-esc-interrupt-wiring.test.ts` | `renderer/03_Agent/stopAction.esc-interrupt-wiring.test.ts` | `cp1-p06` |
| `renderer/stop-action-fb2-p02.test.ts` | `renderer/03_Agent/stopAction.test.ts` | `fb2-p02` |
| `renderer/subagent-cell.test.tsx` | `renderer/03_Agent/SubAgentCell.test.tsx` | — |
| `renderer/subagentChat.test.ts` | `renderer/03_Agent/subagentChat.test.ts` | — |
| `renderer/tg1-p06-subagent-status-line.test.tsx` | `renderer/03_Agent/SubAgentChatStream.status-line.test.tsx` | `tg1-p06` |
| `renderer/subagent-fullscreen.test.tsx` | `renderer/03_Agent/SubAgentFullscreen.test.tsx` | — |
| `renderer/SubAgentInline.test.tsx` | `renderer/03_Agent/SubAgentInline.test.tsx` | — |
| `renderer/cp1-p06-subagentmodelbadge-reduced-motion.test.ts` | `renderer/03_Agent/SubAgentModelBadge.reduced-motion.test.ts` | `cp1-p06` · override |
| `renderer/SubAgentModelBadge.test.tsx` | `renderer/03_Agent/SubAgentModelBadge.test.tsx` | — |
| `renderer/gap1-p01-mcp-verb-label.test.tsx` | `renderer/03_Agent/toolKind.mcp-verb-label.test.tsx` | `gap1-p01` |
| `renderer/gap1-p02-toolkind.test.ts` | `renderer/03_Agent/toolKind.sdk-tools.test.ts` | `gap1-p02` · override |
| `renderer/toolKind.test.ts` | `renderer/03_Agent/toolKind.test.ts` | — |
| `renderer/multi-ultracode.test.tsx` | `renderer/03_Agent/ultracodeToggle.multi.test.tsx` | — |
| `renderer/bl1-p01-ultracode-offkeys-prune.test.ts` | `renderer/03_Agent/ultracodeToggle.offkeys-prune.test.ts` | `bl1-p01` |
| `renderer/lr4-p06-ultracode-toggle-persist.test.tsx` | `renderer/03_Agent/ultracodeToggle.persist.test.tsx` | `lr4-p06` |
