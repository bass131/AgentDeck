# M05 G12 이동 표 — shared·main·agents (162행)

- 소유: `99c_Goal-G12-테스트-미러-배치.md` · 근거: `99d_G12-재실측.md` · 경로는 `02_Project/01_TestCode/` 기준
- 읽는 법: 한 행이 `git mv` 하나다. 셋째 열은 첫 줄 주석으로 내릴 작업 ID(없으면 —)와, 규칙 기본값이 아닌 판정의 근거(`rule0`·`tie:name`·`tie:non-generic`·`tie:first-import`·`type-only`·`override`)다.
- 기계 생성: 세션 스크래치의 읽기 전용 분석기가 만들었다. 대소문자 무시 대상 중복 0, 기존 파일과 충돌 0, 「제자리」 밖 파일 누락 0(표 셋 합 435행).
- 순서: shared(이동 1) → main(이동 2a) → agents와 헬퍼(이동 2b).

| 지금 경로 | 새 경로 | 작업 ID(첫 줄 주석) |
|---|---|---|
| `shared/engine-install-contract.test.ts` | `shared/01_Ipc/ipcContract.engine-install.test.ts` | — |
| `shared/engine-update-contract.test.ts` | `shared/01_Ipc/ipcContract.engine-update.test.ts` | — |
| `shared/git-contract.test.ts` | `shared/01_Ipc/ipcContract.git.test.ts` | — |
| `shared/cp1-p01-list-root-contract.test.ts` | `shared/01_Ipc/ipcContract.list-root.test.ts` | `cp1-p01` |
| `shared/gap1-p13-set-mode-contract.test.ts` | `shared/01_Ipc/ipcContract.set-mode.test.ts` | `gap1-p13` · tie:name |
| `shared/lm1-set-model-contract.test.ts` | `shared/01_Ipc/ipcContract.set-model.test.ts` | `lm1` · tie:name |
| `shared/cp1-p05-subagent-persist-contract.test.ts` | `shared/01_Ipc/ipcContract.subagent-persist.test.ts` | `cp1-p05` |
| `shared/ipcContract.test.ts` | `shared/01_Ipc/ipcContract.test.ts` | — |
| `shared/g10-ipc-typemap.test.ts` | `shared/01_Ipc/ipcContract.typemap.test.ts` | `g10` |
| `shared/zoom-readonly-contract.test.ts` | `shared/01_Ipc/ipcContract.zoom-readonly.test.ts` | — |
| `shared/zoom-setter-contract.test.ts` | `shared/01_Ipc/ipcContract.zoom-setter.test.ts` | — |
| `shared/gap1-p03-agent-event-contract.test.ts` | `shared/03_Agent/agentEvents.contract.test.ts` | `gap1-p03` · type-only |
| `shared/model-canon.test.ts` | `shared/03_Agent/knownModels.canon.test.ts` | — |
| `main/backendStatus.test.ts` | `main/00_App/backendStatus.test.ts` | — |
| `main/appAssembly.test.ts` | `main/00_App/context.assembly.test.ts` | — |
| `main/mainDomains.smoke.test.ts` | `main/00_App/mainDomains.smoke.test.ts` | — · override |
| `main/permission-respond-handler.test.ts` | `main/01_Ipc/agent.permission-respond-handler.test.ts` | — |
| `main/question-respond-handler.test.ts` | `main/01_Ipc/agent.question-respond-handler.test.ts` | — |
| `main/systemprompt-ipc.test.ts` | `main/01_Ipc/normalize.systemprompt.test.ts` | — |
| `main/handlers/personalization.test.ts` | `main/01_Ipc/personalization.test.ts` | — |
| `main/window-controls.test.ts` | `main/01_Ipc/window.controls.test.ts` | — |
| `main/handlers/folder-pick.test.ts` | `main/01_Ipc/workspace.folder-pick.test.ts` | — |
| `main/handlers/workspace-root-source.test.ts` | `main/01_Ipc/workspace.root-source.test.ts` | — |
| `main/userData.test.ts` | `main/02_Common/userData.test.ts` | — · rule0 |
| `main/orchestration-ipc-normalize.test.ts` | `main/03_Agent/agentRuns.orchestration-ipc-normalize.test.ts` | — · tie:first-import |
| `main/persistent-session.test.ts` | `main/03_Agent/agentRuns.persistent-session.test.ts` | — |
| `main/gap1-p13-set-mode-handler.test.ts` | `main/03_Agent/agentRuns.set-mode-handler.test.ts` | `gap1-p13` |
| `main/lm1-set-model-handler.test.ts` | `main/03_Agent/agentRuns.set-model-handler.test.ts` | `lm1` · tie:first-import |
| `main/gap1-p09-task-stop-handler.test.ts` | `main/03_Agent/agentRuns.task-stop-handler.test.ts` | `gap1-p09` |
| `main/lr4-p01-teardown-window-repro.test.ts` | `main/03_Agent/agentRuns.teardown-window-repro.test.ts` | `lr4-p01` · tie:first-import |
| `main/agentRuns.test.ts` | `main/03_Agent/agentRuns.test.ts` | — |
| `main/build-prompt.test.ts` | `main/04_Claude/buildPrompt.test.ts` | — |
| `main/claude-latest-version.test.ts` | `main/04_Claude/ClaudeCodeBackend.latest-version.test.ts` | — · tie:first-import |
| `main/uc1-p01-turn-orchestration.test.ts` | `main/04_Claude/permissionCoordinator.turn-orchestration.test.ts` | `uc1-p01` |
| `main/permissionModes.test.ts` | `main/04_Claude/permissionModes.test.ts` | — |
| `main/runArgs.test.ts` | `main/04_Claude/runArgs.test.ts` | — |
| `main/rmw1-p03-merge-semantics.test.ts` | `main/06_Sessions/multiStore.merge-semantics.test.ts` | `rmw1-p03` |
| `main/multiStore.test.ts` | `main/06_Sessions/multiStore.test.ts` | — |
| `main/lr4-p07-conversation-store-replmode.test.ts` | `main/06_Sessions/store.conversation-replmode.test.ts` | `lr4-p07` |
| `main/gap1-p02-model-persist.test.ts` | `main/06_Sessions/store.model-persist.test.ts` | `gap1-p02` |
| `main/cp1-p05-sanitize-subagents.test.ts` | `main/06_Sessions/store.sanitize-subagents.test.ts` | `cp1-p05` |
| `main/store.test.ts` | `main/06_Sessions/store.test.ts` | — |
| `main/attachments.test.ts` | `main/07_Workspace/attachments.test.ts` | — |
| `main/list-files.test.ts` | `main/07_Workspace/listFiles.test.ts` | — |
| `main/read.test.ts` | `main/07_Workspace/read.test.ts` | — |
| `main/roots-security.test.ts` | `main/07_Workspace/roots.security.test.ts` | — |
| `main/roots.test.ts` | `main/07_Workspace/roots.test.ts` | — |
| `main/skipDirs.test.ts` | `main/07_Workspace/skipDirs.test.ts` | — |
| `main/listDir.test.ts` | `main/07_Workspace/workspace.list-dir.test.ts` | — |
| `main/workspace.test.ts` | `main/07_Workspace/workspace.test.ts` | — |
| `main/fs-diff-head.test.ts` | `main/08_Git/diff.fs-head.test.ts` | — |
| `main/fs-diff-path-containment.test.ts` | `main/08_Git/diff.fs-path-containment.test.ts` | — |
| `main/diff.test.ts` | `main/08_Git/diff.test.ts` | — |
| `main/git-mask.test.ts` | `main/08_Git/git.mask.test.ts` | — |
| `main/git.test.ts` | `main/08_Git/git.test.ts` | — |
| `main/git-write.test.ts` | `main/08_Git/git.write.test.ts` | — |
| `main/lsp-jsonrpc.test.ts` | `main/09_Lsp/jsonrpc.test.ts` | — |
| `main/lsp-manager.test.ts` | `main/09_Lsp/manager.test.ts` | — · tie:name |
| `main/credentials.test.ts` | `main/10_Engine/credentials.test.ts` | — |
| `main/engineCheckUpdate.test.ts` | `main/10_Engine/engineCheckUpdate.test.ts` | — |
| `main/engineState.test.ts` | `main/10_Engine/engineState.test.ts` | — |
| `main/engineVersions.test.ts` | `main/10_Engine/engineVersions.test.ts` | — |
| `main/sdk-version-read.test.ts` | `main/10_Engine/sdkVersion.read.test.ts` | — |
| `main/usage.test.ts` | `main/10_Engine/usage.test.ts` | — |
| `main/commands.test.ts` | `main/11_Settings/commands.test.ts` | — |
| `main/disabledOverlay.test.ts` | `main/11_Settings/disabledOverlay.test.ts` | — |
| `main/frontmatter.test.ts` | `main/11_Settings/frontmatter.test.ts` | — |
| `main/mcp.test.ts` | `main/11_Settings/mcp.test.ts` | — |
| `main/mergeSlashCommands.test.ts` | `main/11_Settings/mergeSlashCommands.test.ts` | — |
| `main/prefs.test.ts` | `main/11_Settings/prefs.test.ts` | — |
| `main/profile.test.ts` | `main/11_Settings/profile.test.ts` | — |
| `main/handlers/settings-root-scan.test.ts` | `main/11_Settings/skills.root-scan.test.ts` | — |
| `main/skills.test.ts` | `main/11_Settings/skills.test.ts` | — |
| `main/window-geometry.test.ts` | `main/12_Window/geometry.test.ts` | — |
| `main/window-zoom-restore.test.ts` | `main/12_Window/zoom.restore.test.ts` | — |
| `agents/registry.test.ts` | `main/00_App/registry.test.ts` | — |
| `agents/helpers/fakeQuery.ts` | `main/00_Helpers/fakeQuery.ts` | — |
| `agents/helpers/sdkFixtures.ts` | `main/00_Helpers/sdkFixtures.ts` | — |
| `agents/gap1-p12-orphan-pump.test.ts` | `main/03_Agent/agentRuns.orphan-pump.test.ts` | `gap1-p12` · tie:first-import |
| `agents/echo-backend.test.ts` | `main/03_Agent/EchoBackend.test.ts` | — |
| `agents/bgTaskObserver.test.ts` | `main/04_Claude/bgTaskObserver.test.ts` | — |
| `agents/gap1-p09-bg-task-tail.test.ts` | `main/04_Claude/bgTaskTail.test.ts` | `gap1-p09` |
| `agents/gap1-p09-bg-tail-wiring.test.ts` | `main/04_Claude/bgTaskTail.wiring.test.ts` | `gap1-p09` |
| `agents/claudeAgentRun.test.ts` | `main/04_Claude/claudeAgentRun.test.ts` | — |
| `agents/abort.test.ts` | `main/04_Claude/ClaudeCodeBackend.abort.test.ts` | — · tie:non-generic |
| `agents/gap1-p11-autonomous-done-theft.repro.test.ts` | `main/04_Claude/ClaudeCodeBackend.autonomous-done-theft-repro.test.ts` | `gap1-p11` |
| `agents/gap1-p10-dispatch-grace-cancel-lock.test.ts` | `main/04_Claude/ClaudeCodeBackend.dispatch-grace-cancel-lock.test.ts` | `gap1-p10` |
| `agents/claude-backend-dynamic-load.test.ts` | `main/04_Claude/ClaudeCodeBackend.dynamic-load.test.ts` | — |
| `agents/claude-file-changed.test.ts` | `main/04_Claude/ClaudeCodeBackend.file-changed.test.ts` | — |
| `agents/gap1-p12-grace-expired-misemission.test.ts` | `main/04_Claude/ClaudeCodeBackend.grace-expired-misemission.test.ts` | `gap1-p12` |
| `agents/gap1-p09-idle-close-bgtask.test.ts` | `main/04_Claude/ClaudeCodeBackend.idle-close-bgtask.test.ts` | `gap1-p09` |
| `agents/lr4-p03-idle-grace.test.ts` | `main/04_Claude/ClaudeCodeBackend.idle-grace.test.ts` | `lr4-p03` |
| `agents/lr3-p02-idle-live.test.ts` | `main/04_Claude/ClaudeCodeBackend.idle-live.test.ts` | `lr3-p02` |
| `agents/lr3-p02-idle-session-lifetime.test.ts` | `main/04_Claude/ClaudeCodeBackend.idle-session-lifetime.test.ts` | `lr3-p02` |
| `agents/bf1-interrupt-error-mislabel.test.ts` | `main/04_Claude/ClaudeCodeBackend.interrupt-error-mislabel.test.ts` | `bf1` · tie:first-import |
| `agents/fb2-p01-interrupt-scope-selfrearm.test.ts` | `main/04_Claude/ClaudeCodeBackend.interrupt-scope-selfrearm.test.ts` | `fb2-p01` |
| `agents/bf3-p02-interrupt-toolexec-error.test.ts` | `main/04_Claude/ClaudeCodeBackend.interrupt-toolexec-error.test.ts` | `bf3-p02` |
| `agents/gap1-p15-r1-s1-interrupt-unhandled-rejection.test.ts` | `main/04_Claude/ClaudeCodeBackend.interrupt-unhandled-rejection.test.ts` | `gap1-p15-r1-s1` |
| `agents/gap1-dogfood-interturn-anchor.repro.test.ts` | `main/04_Claude/ClaudeCodeBackend.interturn-anchor-repro.test.ts` | `gap1-dogfood` |
| `agents/gap1-p13-live-mode-switch.test.ts` | `main/04_Claude/ClaudeCodeBackend.live-mode-switch.test.ts` | `gap1-p13` |
| `agents/lm1-live-model-switch.test.ts` | `main/04_Claude/ClaudeCodeBackend.live-model-switch.test.ts` | `lm1` |
| `agents/loop-tracking.test.ts` | `main/04_Claude/ClaudeCodeBackend.loop-tracking.test.ts` | — |
| `agents/claude-backend-mcp-denied.test.ts` | `main/04_Claude/ClaudeCodeBackend.mcp-denied.test.ts` | — |
| `agents/message-id-pump.test.ts` | `main/04_Claude/ClaudeCodeBackend.message-id-pump.test.ts` | — |
| `agents/model-alias-sonnet5-live-probe.test.ts` | `main/04_Claude/ClaudeCodeBackend.model-alias-sonnet5-live-probe.test.ts` | — |
| `agents/model-fallback-handler.test.ts` | `main/04_Claude/ClaudeCodeBackend.model-fallback-handler.test.ts` | — |
| `agents/model-fallback-notice.test.ts` | `main/04_Claude/ClaudeCodeBackend.model-fallback-notice.test.ts` | — |
| `agents/orchestration-permission-gate.test.ts` | `main/04_Claude/ClaudeCodeBackend.orchestration-permission-gate.test.ts` | — · tie:first-import |
| `agents/claude-permission.test.ts` | `main/04_Claude/ClaudeCodeBackend.permission.test.ts` | — · tie:name |
| `agents/persistent-contract.test.ts` | `main/04_Claude/ClaudeCodeBackend.persistent-contract.test.ts` | — · tie:first-import |
| `agents/persistent-pump.test.ts` | `main/04_Claude/ClaudeCodeBackend.persistent-pump.test.ts` | — |
| `agents/lr3-p01-probe.live.test.ts` | `main/04_Claude/ClaudeCodeBackend.probe-live.test.ts` | `lr3-p01` |
| `agents/bf3-p03-push-race-window.test.ts` | `main/04_Claude/ClaudeCodeBackend.push-race-window.test.ts` | `bf3-p03` |
| `agents/claude-question.test.ts` | `main/04_Claude/ClaudeCodeBackend.question.test.ts` | — |
| `agents/resume-session.test.ts` | `main/04_Claude/ClaudeCodeBackend.resume-session.test.ts` | — |
| `agents/gap1-p11-runmanager-session-routing.test.ts` | `main/04_Claude/ClaudeCodeBackend.runmanager-session-routing.test.ts` | `gap1-p11` |
| `agents/claude-backend-sdk.test.ts` | `main/04_Claude/ClaudeCodeBackend.sdk.test.ts` | — |
| `agents/gap1-p11-send-token-accounting.test.ts` | `main/04_Claude/ClaudeCodeBackend.send-token-accounting.test.ts` | `gap1-p11` |
| `agents/gap1-p04b-session-state-idle-authority.test.ts` | `main/04_Claude/ClaudeCodeBackend.session-state-idle-authority.test.ts` | `gap1-p04b` |
| `agents/lm1-setmodel-live-probe.test.ts` | `main/04_Claude/ClaudeCodeBackend.setmodel-live-probe.test.ts` | `lm1` |
| `agents/claude-backend-skill-overrides.test.ts` | `main/04_Claude/ClaudeCodeBackend.skill-overrides.test.ts` | — |
| `agents/fb2-p07-subagent-live-probe.test.ts` | `main/04_Claude/ClaudeCodeBackend.subagent-live-probe.test.ts` | `fb2-p07` |
| `agents/ng1-ng2b-subagent-naming-live-probe.test.ts` | `main/04_Claude/ClaudeCodeBackend.subagent-naming-live-probe.test.ts` | `ng1-ng2b` |
| `agents/subagent-pump-isolation.test.ts` | `main/04_Claude/ClaudeCodeBackend.subagent-pump-isolation.test.ts` | — |
| `agents/claude-backend-supported-commands.test.ts` | `main/04_Claude/ClaudeCodeBackend.supported-commands.test.ts` | — · override |
| `agents/claude-backend-systemprompt.test.ts` | `main/04_Claude/ClaudeCodeBackend.systemprompt.test.ts` | — |
| `agents/task-tools.golden.test.ts` | `main/04_Claude/ClaudeCodeBackend.task-tools-golden.test.ts` | — |
| `agents/wakeup-tracking.test.ts` | `main/04_Claude/ClaudeCodeBackend.wakeup-tracking.test.ts` | — |
| `agents/workflow-result-lifecycle.test.ts` | `main/04_Claude/ClaudeCodeBackend.workflow-result-lifecycle.test.ts` | — |
| `agents/gap1-p09-bg-task.golden.test.ts` | `main/04_Claude/claudeStream.bg-task-golden.test.ts` | `gap1-p09` |
| `agents/claudeStream.golden.test.ts` | `main/04_Claude/claudeStream.golden.test.ts` | — |
| `agents/gap1-p05-hook-cockpit.golden.test.ts` | `main/04_Claude/claudeStream.hook-cockpit-golden.test.ts` | `gap1-p05` |
| `agents/orchestration-stream.test.ts` | `main/04_Claude/claudeStream.orchestration.test.ts` | — |
| `agents/gap1-p08-search-result.golden.test.ts` | `main/04_Claude/claudeStream.search-result-golden.test.ts` | `gap1-p08` |
| `agents/gap1-p15-r1-s6-search-result-hardening.test.ts` | `main/04_Claude/claudeStream.search-result-hardening.test.ts` | `gap1-p15-r1-s6` |
| `agents/subagent-transcript-stream.test.ts` | `main/04_Claude/claudeStream.subagent-transcript.test.ts` | — |
| `agents/gap1-p06-thinking-fulltext.test.ts` | `main/04_Claude/claudeStream.thinking-fulltext.test.ts` | `gap1-p06` |
| `agents/m5-token-streaming.test.ts` | `main/04_Claude/claudeStream.token-streaming.test.ts` | `m5` |
| `agents/gap1-p04-turn-signals.golden.test.ts` | `main/04_Claude/claudeStream.turn-signals-golden.test.ts` | `gap1-p04` |
| `agents/descriptionUtils.test.ts` | `main/04_Claude/descriptionUtils.test.ts` | — |
| `agents/bf3-p04-interleave-banner.test.ts` | `main/04_Claude/eventNormalizer.interleave-banner.test.ts` | `bf3-p04` |
| `agents/cp1-p07-subagent-backlog.test.ts` | `main/04_Claude/eventNormalizer.subagent-backlog.test.ts` | `cp1-p07` |
| `agents/subagent-meta-normalize.test.ts` | `main/04_Claude/eventNormalizer.subagent-meta.test.ts` | — |
| `agents/subagent-model-normalize.test.ts` | `main/04_Claude/eventNormalizer.subagent-model.test.ts` | — |
| `agents/eventNormalizer.test.ts` | `main/04_Claude/eventNormalizer.test.ts` | — |
| `agents/gap1-p15-r1-s5-filechange-containment.test.ts` | `main/04_Claude/fileChangeTracker.containment.test.ts` | `gap1-p15-r1-s5` |
| `agents/fileChangeTracker.test.ts` | `main/04_Claude/fileChangeTracker.test.ts` | — |
| `agents/idleCloseGovernor.test.ts` | `main/04_Claude/idleCloseGovernor.test.ts` | — |
| `agents/modelFallback.test.ts` | `main/04_Claude/modelFallback.test.ts` | — |
| `agents/orchestrationMetaParse.test.ts` | `main/04_Claude/orchestrationMeta.parse.test.ts` | — |
| `agents/gap1-p07-plan-approval-backend.test.ts` | `main/04_Claude/permissionCoordinator.plan-approval-backend.test.ts` | `gap1-p07` |
| `agents/gap1-p02-permission-reclassify.test.ts` | `main/04_Claude/permissionCoordinator.reclassify.test.ts` | `gap1-p02` |
| `agents/permissionCoordinator.test.ts` | `main/04_Claude/permissionCoordinator.test.ts` | — |
| `agents/progressTrackers.test.ts` | `main/04_Claude/progressTrackers.test.ts` | — |
| `agents/queryFn.test.ts` | `main/04_Claude/queryFn.test.ts` | — |
| `agents/gap1-p05-hook-events-option.test.ts` | `main/04_Claude/sdkOptions.hook-events.test.ts` | `gap1-p05` |
| `agents/orchestration-sdkoptions.test.ts` | `main/04_Claude/sdkOptions.orchestration.test.ts` | — |
| `agents/lr1-resume-bug-held-open-resume.test.ts` | `main/04_Claude/sdkOptions.resume-bug-held-open.test.ts` | `lr1` |
| `agents/gap1-p04-session-state-env.test.ts` | `main/04_Claude/sdkOptions.session-state-env.test.ts` | `gap1-p04` |
| `agents/sdkOptions.test.ts` | `main/04_Claude/sdkOptions.test.ts` | — |
| `agents/sendTokenLedger.test.ts` | `main/04_Claude/sendTokenLedger.test.ts` | — |
| `agents/subagentMeta.test.ts` | `main/04_Claude/subagentMeta.test.ts` | — |
