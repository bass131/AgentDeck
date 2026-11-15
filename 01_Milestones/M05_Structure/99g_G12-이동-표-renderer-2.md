# M05 G12 이동 표 — renderer 2: `05_Conversation`~`12_Window` (153행)

- 소유: `99c_Goal-G12-테스트-미러-배치.md` · 근거: `99d_G12-재실측.md` · 경로는 `02_Project/01_TestCode/` 기준
- 읽는 법: 한 행이 `git mv` 하나다. 셋째 열은 첫 줄 주석으로 내릴 작업 ID(없으면 —)와, 규칙 기본값이 아닌 판정의 근거(`rule0`·`tie:name`·`tie:non-generic`·`tie:first-import`·`override`)다.
- 기계 생성: 세션 스크래치의 읽기 전용 분석기가 만들었다. 검사 결과는 `99e`와 같다(표 셋 합 435행, 중복·충돌·누락 0).
- 이동 3b다. `renderer/00_Helpers/`는 이동 3a에서 이미 옮겨져 있다.

| 지금 경로 | 새 경로 | 작업 ID(첫 줄 주석) |
|---|---|---|
| `renderer/gap1-p09-bg-task-render.test.tsx` | `renderer/05_Conversation/BackgroundTaskView.bg-render.test.tsx` | `gap1-p09` |
| `renderer/cmdresult-render.test.tsx` | `renderer/05_Conversation/CmdResultCard.render.test.tsx` | — |
| `renderer/composer-disabled.test.tsx` | `renderer/05_Conversation/Composer.disabled.test.tsx` | — |
| `renderer/input-history-b9.test.tsx` | `renderer/05_Conversation/Composer.input-history.test.tsx` | `b9` |
| `renderer/composer-slash-ipc.test.tsx` | `renderer/05_Conversation/Composer.slash-ipc.test.tsx` | — |
| `renderer/composer-slash-run-invalidate.test.tsx` | `renderer/05_Conversation/Composer.slash-run-invalidate.test.tsx` | — |
| `renderer/composer.test.tsx` | `renderer/05_Conversation/Composer.test.tsx` | — · rule0 |
| `renderer/composer-trays.test.tsx` | `renderer/05_Conversation/Composer.trays.test.tsx` | — |
| `renderer/ComposerBar.test.tsx` | `renderer/05_Conversation/ComposerBar.test.tsx` | — |
| `renderer/ComposerContext.test.tsx` | `renderer/05_Conversation/ComposerContext.test.tsx` | — |
| `renderer/composerHighlight.test.ts` | `renderer/05_Conversation/composerHighlight.test.ts` | — |
| `renderer/composer-notes.test.ts` | `renderer/05_Conversation/composerNotes.test.ts` | — |
| `renderer/effort-picker-gating.test.ts` | `renderer/05_Conversation/ComposerPicker.effort-gating.test.ts` | — |
| `renderer/ComposerPicker.test.tsx` | `renderer/05_Conversation/ComposerPicker.test.tsx` | — |
| `renderer/g9b-composer-view.test.tsx` | `renderer/05_Conversation/ComposerView.test.tsx` | `g9b` · rule0 |
| `renderer/b8-context-strip.test.ts` | `renderer/05_Conversation/contextChips.strip.test.ts` | `b8` |
| `renderer/mention-notes.test.tsx` | `renderer/05_Conversation/Conversation.mention-notes.test.tsx` | — · tie:non-generic |
| `renderer/m4-4-permission-conversation.test.tsx` | `renderer/05_Conversation/Conversation.permission.test.tsx` | `m4-4` · tie:name |
| `renderer/m4-4-question-conversation.test.tsx` | `renderer/05_Conversation/Conversation.question.test.tsx` | `m4-4` · tie:name |
| `renderer/queue-drain.test.tsx` | `renderer/05_Conversation/Conversation.queue-drain.test.tsx` | — · tie:non-generic |
| `renderer/slash-intercept.test.tsx` | `renderer/05_Conversation/Conversation.slash-intercept.test.tsx` | — · tie:non-generic |
| `renderer/subagent-singlechat-wiring.test.tsx` | `renderer/05_Conversation/Conversation.subagent-singlechat-wiring.test.tsx` | — · tie:non-generic |
| `renderer/conversation.test.tsx` | `renderer/05_Conversation/Conversation.test.tsx` | — |
| `renderer/m4-4-conversation-thinking.test.tsx` | `renderer/05_Conversation/Conversation.thinking.test.tsx` | `m4-4` · tie:name |
| `renderer/conversationCapsule.smoke.test.ts` | `renderer/05_Conversation/conversationCapsule.smoke.test.ts` | — · override |
| `renderer/fb2-p0-abort-stream-cleanup.test.ts` | `renderer/05_Conversation/helpers.abort-stream-cleanup.test.ts` | `fb2-p0` |
| `renderer/gap1-p16-s1-hook-badge-derive.test.ts` | `renderer/05_Conversation/hookBadge.derive.test.ts` | `gap1-p16-s1` |
| `renderer/imageAttach.test.ts` | `renderer/05_Conversation/imageAttach.test.ts` | — |
| `renderer/images.test.ts` | `renderer/05_Conversation/images.test.ts` | — |
| `renderer/ImageTray.test.tsx` | `renderer/05_Conversation/ImageTray.test.tsx` | — |
| `renderer/MentionPalette.test.tsx` | `renderer/05_Conversation/MentionPalette.test.tsx` | — |
| `renderer/mentions.test.ts` | `renderer/05_Conversation/mentions.test.ts` | — |
| `renderer/tg1-p06-messagebubble-avatar.test.tsx` | `renderer/05_Conversation/MessageBubble.avatar.test.tsx` | `tg1-p06` |
| `renderer/messagebubble-streaming.test.tsx` | `renderer/05_Conversation/MessageBubble.streaming.test.tsx` | — |
| `renderer/ux-fixes-bcd-e.test.tsx` | `renderer/05_Conversation/MessageBubble.ux-fixes.test.tsx` | `bcd-e` |
| `renderer/lm1-live-model-picker.test.ts` | `renderer/05_Conversation/PickerGroup.live-model.test.ts` | `lm1` |
| `renderer/g9b-picker-group.test.tsx` | `renderer/05_Conversation/PickerGroup.test.tsx` | `g9b` |
| `renderer/readLanguage.test.ts` | `renderer/05_Conversation/readLanguage.test.ts` | — |
| `renderer/phase-b-diff-store.test.ts` | `renderer/05_Conversation/reducer.diff-store.test.ts` | `phase-b` |
| `renderer/gap1-p05-hook-cockpit-reducer.test.ts` | `renderer/05_Conversation/reducer.hook-cockpit.test.ts` | `gap1-p05` |
| `renderer/gap1-p16-s3-hookruns-runid.test.ts` | `renderer/05_Conversation/reducer.hookruns-runid.test.ts` | `gap1-p16-s3` |
| `renderer/gap1-p15-r1-s3-interrupted-marker.test.tsx` | `renderer/05_Conversation/reducer.interrupted-marker.test.tsx` | `gap1-p15-r1-s3` |
| `renderer/model-fallback-reducer.test.ts` | `renderer/05_Conversation/reducer.model-fallback.test.ts` | — |
| `renderer/orchestration-reducer.test.ts` | `renderer/05_Conversation/reducer.orchestration.test.ts` | — |
| `renderer/gap1-p07-plan-approval-store.test.ts` | `renderer/05_Conversation/reducer.plan-approval-store.test.ts` | `gap1-p07` |
| `renderer/gap1-p04-reliability-signals-reducer.test.ts` | `renderer/05_Conversation/reducer.reliability-signals.test.ts` | `gap1-p04` |
| `renderer/repl-mode.test.ts` | `renderer/05_Conversation/reducer.repl-mode.test.ts` | — · override |
| `renderer/lr4-p07-repl-per-session-single.test.ts` | `renderer/05_Conversation/reducer.repl-per-session-single.test.ts` | `lr4-p07` · tie:first-import |
| `renderer/repl-ui-toggle.test.tsx` | `renderer/05_Conversation/reducer.repl-ui-toggle.test.tsx` | — · tie:non-generic |
| `renderer/fb-run-failed-cleanup.test.tsx` | `renderer/05_Conversation/reducer.run-failed-cleanup.test.tsx` | `fb` · tie:first-import |
| `renderer/subagent-inline-thread.test.ts` | `renderer/05_Conversation/reducer.subagent-inline-thread.test.ts` | — |
| `renderer/fb2-p07-subagent-model-order-replay.test.ts` | `renderer/05_Conversation/reducer.subagent-model-order-replay.test.ts` | `fb2-p07` |
| `renderer/subagent-result-clean.test.ts` | `renderer/05_Conversation/reducer.subagent-result-clean.test.ts` | — |
| `renderer/subagent-transcript-reducer.test.ts` | `renderer/05_Conversation/reducer.subagent-transcript.test.ts` | — |
| `renderer/reducer.test.ts` | `renderer/05_Conversation/reducer.test.ts` | — |
| `renderer/m4-4-thinking-todos.test.ts` | `renderer/05_Conversation/reducer.thinking-todos.test.ts` | `m4-4` |
| `renderer/gap1-p06-thinking-reducer.test.ts` | `renderer/05_Conversation/reducer.thinking.test.ts` | `gap1-p06` |
| `renderer/thread-interleave.test.ts` | `renderer/05_Conversation/reducer.thread-interleave.test.ts` | — |
| `renderer/w7-time-bash.test.ts` | `renderer/05_Conversation/reducer.time-bash.test.ts` | `w7` |
| `renderer/todos-persistence.test.ts` | `renderer/05_Conversation/reducer.todos-persistence.test.ts` | — |
| `renderer/repl-indicator.test.ts` | `renderer/05_Conversation/replIndicator.test.ts` | — |
| `renderer/lr4-p07-repl-mode-default.test.ts` | `renderer/05_Conversation/replModeDefault.test.ts` | `lr4-p07` · override |
| `renderer/SchedStrip.test.tsx` | `renderer/05_Conversation/SchedStrip.test.tsx` | — |
| `renderer/gap1-p08-search-result-render.test.tsx` | `renderer/05_Conversation/SearchResultView.render.test.tsx` | `gap1-p08` |
| `renderer/SlashPalette.test.tsx` | `renderer/05_Conversation/SlashPalette.test.tsx` | — |
| `renderer/slashTokenHighlight.test.ts` | `renderer/05_Conversation/slashTokenHighlight.test.ts` | — |
| `renderer/smooth-markdown.test.tsx` | `renderer/05_Conversation/SmoothMarkdown.test.tsx` | — |
| `renderer/stream-render-parity.test.tsx` | `renderer/05_Conversation/softLinebreak.stream-render-parity.test.tsx` | — |
| `renderer/tg1-p04-status-line.test.tsx` | `renderer/05_Conversation/StatusLine.test.tsx` | `tg1-p04` |
| `renderer/tg1-p04-status-line-format.test.ts` | `renderer/05_Conversation/statusLineFormat.test.ts` | `tg1-p04` |
| `renderer/tg1-p02-thinking-elapsed-store.test.ts` | `renderer/05_Conversation/thinkingElapsed.store.test.ts` | `tg1-p02` |
| `renderer/g9b-thread-view.test.tsx` | `renderer/05_Conversation/ThreadView.test.tsx` | `g9b` |
| `renderer/w7-bash-dom.test.tsx` | `renderer/05_Conversation/ToolCallCard.bash-dom.test.tsx` | `w7` |
| `renderer/phase-b-diff-toolcard.test.tsx` | `renderer/05_Conversation/ToolCallCard.diff-toolcard.test.tsx` | `phase-b` |
| `renderer/gap1-p01-read-codeviewer.test.tsx` | `renderer/05_Conversation/ToolCallCard.read-codeviewer.test.tsx` | `gap1-p01` |
| `renderer/toolcard.test.tsx` | `renderer/05_Conversation/ToolCallCard.toolcard.test.tsx` | — |
| `renderer/tg1-p03-turn-blocks.test.ts` | `renderer/05_Conversation/turnBlocks.test.ts` | `tg1-p03` |
| `renderer/useComposerKeyHandler.test.ts` | `renderer/05_Conversation/useComposerKeyHandler.test.ts` | — |
| `renderer/useComposerKeywordMirror.test.ts` | `renderer/05_Conversation/useComposerKeywordMirror.test.ts` | — |
| `renderer/useImageAttach.test.ts` | `renderer/05_Conversation/useImageAttach.test.ts` | — |
| `renderer/useInputHistory.test.ts` | `renderer/05_Conversation/useInputHistory.test.ts` | — |
| `renderer/useMentionPalette.test.ts` | `renderer/05_Conversation/useMentionPalette.test.ts` | — |
| `renderer/useSlashPalette.test.tsx` | `renderer/05_Conversation/useSlashPalette.test.tsx` | — |
| `renderer/workingPhrases.test.ts` | `renderer/05_Conversation/workingPhrases.test.ts` | — |
| `renderer/p14a-working-phrases.test.tsx` | `renderer/05_Conversation/workingPhrases.thinking-item.test.tsx` | `p14a` · override |
| `renderer/chat-polish-f14.test.tsx` | `renderer/05_Conversation/zoom.chat-polish.test.tsx` | `f14` |
| `renderer/cp1-p05-subagent-persist.test.ts` | `renderer/06_Sessions/conversationPayload.subagent-persist.test.ts` | `cp1-p05` |
| `renderer/rmw1-p01-lost-update-race.test.tsx` | `renderer/06_Sessions/useMultiPersist.lost-update-race.test.tsx` | `rmw1-p01` · tie:first-import |
| `renderer/bf3-p05-multipersist-restore-race.test.tsx` | `renderer/06_Sessions/useMultiPersist.restore-race.test.tsx` | `bf3-p05` · tie:name |
| `renderer/gap1-p15-r2-a-codeviewer-line-scroll.test.tsx` | `renderer/07_Workspace/CodeViewer.line-scroll.test.tsx` | `gap1-p15-r2-a` |
| `renderer/lsp-gap-fix.test.tsx` | `renderer/07_Workspace/CodeViewer.lsp-gap-fix.test.tsx` | — |
| `renderer/lsp-codeviewer.test.tsx` | `renderer/07_Workspace/CodeViewer.lsp.test.tsx` | — |
| `renderer/codeviewer.test.tsx` | `renderer/07_Workspace/CodeViewer.test.tsx` | — |
| `renderer/components.test.tsx` | `renderer/07_Workspace/DiffViewer.components.test.tsx` | — |
| `renderer/editor-font.test.ts` | `renderer/07_Workspace/editorFont.test.ts` | — |
| `renderer/filebadge.test.tsx` | `renderer/07_Workspace/FileBadge.test.tsx` | — |
| `renderer/fileCapsule.smoke.test.ts` | `renderer/07_Workspace/fileCapsule.smoke.test.ts` | — · override |
| `renderer/p14b-explorer-expand-persist.test.tsx` | `renderer/07_Workspace/FileExplorer.expand-persist.test.tsx` | `p14b` |
| `renderer/m7-explorer-lazy.test.ts` | `renderer/07_Workspace/FileExplorer.lazy.test.ts` | `m7` |
| `renderer/reference-folder.test.tsx` | `renderer/07_Workspace/FileExplorer.reference-folder.test.tsx` | — |
| `renderer/explorer.test.tsx` | `renderer/07_Workspace/FileExplorer.revamp.test.tsx` | — · override |
| `renderer/f15-fileexplorer.test.tsx` | `renderer/07_Workspace/FileExplorer.test.tsx` | `f15` · override |
| `renderer/gap1-p15-r2-a-click-to-line.test.tsx` | `renderer/07_Workspace/FileModal.click-to-line.test.tsx` | `gap1-p15-r2-a` |
| `renderer/f15-filemodal.test.tsx` | `renderer/07_Workspace/FileModal.test.tsx` | `f15` |
| `renderer/fileType.test.ts` | `renderer/07_Workspace/fileType.test.ts` | — |
| `renderer/markdown-image.test.tsx` | `renderer/07_Workspace/ImagePreview.markdown.test.tsx` | — |
| `renderer/imageviewer.test.tsx` | `renderer/07_Workspace/ImageViewer.test.tsx` | — |
| `renderer/recentfiles.test.tsx` | `renderer/07_Workspace/RecentFiles.test.tsx` | — |
| `renderer/w6-selection-ask.test.tsx` | `renderer/07_Workspace/SelectionAskBar.test.tsx` | `w6` |
| `renderer/viewer.test.ts` | `renderer/07_Workspace/viewer.test.ts` | — |
| `renderer/viewerCapsule.smoke.test.ts` | `renderer/07_Workspace/viewerCapsule.smoke.test.ts` | — · override |
| `renderer/gitCapsule.smoke.test.ts` | `renderer/08_Git/gitCapsule.smoke.test.ts` | — · override |
| `renderer/gitmodal.test.tsx` | `renderer/08_Git/GitModal.test.tsx` | — |
| `renderer/gates-profile-f12.test.tsx` | `renderer/10_Engine/EngineGate.gates-profile.test.tsx` | `f12` |
| `renderer/engine-gate-p3.test.tsx` | `renderer/10_Engine/EngineGate.test.tsx` | `p3` |
| `renderer/engineUpdateNotice.test.tsx` | `renderer/10_Engine/EngineUpdateNotice.test.tsx` | — |
| `renderer/engineUpdateTrigger.test.ts` | `renderer/10_Engine/engineUpdateTrigger.test.ts` | — |
| `renderer/noticeCapsule.smoke.test.ts` | `renderer/10_Engine/noticeCapsule.smoke.test.ts` | — · override |
| `renderer/onboarding-f12.test.tsx` | `renderer/10_Engine/UpdateNotes.onboarding.test.tsx` | `f12` |
| `renderer/whatsNewCapsule.smoke.test.ts` | `renderer/10_Engine/whatsNewCapsule.smoke.test.ts` | — · override |
| `renderer/whatsNewTrigger.test.ts` | `renderer/10_Engine/whatsNewTrigger.test.ts` | — |
| `renderer/restore-last-active-conversation.test.ts` | `renderer/11_Settings/prefs.restore-last-active-conversation.test.ts` | — · tie:non-generic |
| `renderer/prefs.test.ts` | `renderer/11_Settings/prefs.test.ts` | — |
| `renderer/settings-engine-lsp-p5c.test.tsx` | `renderer/11_Settings/SettingsModal.engine-lsp.test.tsx` | `p5c` |
| `renderer/settings-mcp-ipc.test.tsx` | `renderer/11_Settings/SettingsModal.mcp-ipc.test.tsx` | — |
| `renderer/settings-skill-ipc.test.tsx` | `renderer/11_Settings/SettingsModal.skill-ipc.test.tsx` | — |
| `renderer/settings-tabs.test.tsx` | `renderer/11_Settings/SettingsModal.tabs.test.tsx` | — |
| `renderer/settings-theme.test.tsx` | `renderer/11_Settings/SettingsModal.theme.test.tsx` | — |
| `renderer/multi-concurrent.test.tsx` | `renderer/12_Window/MultiWorkspace.concurrent.test.tsx` | — · tie:name |
| `renderer/multiagent-f13.test.tsx` | `renderer/12_Window/MultiWorkspace.multiagent.test.tsx` | `f13` |
| `renderer/multi-no-sample-leak.test.tsx` | `renderer/12_Window/MultiWorkspace.no-sample-leak.test.tsx` | — |
| `renderer/panel-image-attach.test.tsx` | `renderer/12_Window/MultiWorkspace.panel-image-attach.test.tsx` | — · tie:non-generic |
| `renderer/m3-persist-multiworkspace.test.tsx` | `renderer/12_Window/MultiWorkspace.persist.test.tsx` | `m3` · tie:name |
| `renderer/phase13-multiworkspace-refactor.test.tsx` | `renderer/12_Window/MultiWorkspace.refactor.test.tsx` | `phase13` · tie:name |
| `renderer/multi-session-persist-2.test.tsx` | `renderer/12_Window/MultiWorkspace.session-persist-2.test.tsx` | — · tie:name |
| `renderer/multi-usage-wiring.test.tsx` | `renderer/12_Window/MultiWorkspace.usage-wiring.test.tsx` | — · tie:name |
| `renderer/pane-resize.test.ts` | `renderer/12_Window/paneResize.test.ts` | — |
| `renderer/PaneSplitter.test.tsx` | `renderer/12_Window/PaneSplitter.test.tsx` | — |
| `renderer/w6-inject-nonce.test.tsx` | `renderer/12_Window/Shell.inject-nonce.test.tsx` | `w6` |
| `renderer/multi-isolation-guard.test.tsx` | `renderer/12_Window/Shell.multi-isolation-guard.test.tsx` | — · tie:non-generic |
| `renderer/shell-test-open.test.tsx` | `renderer/12_Window/Shell.test-open.test.tsx` | — · tie:name |
| `renderer/shellCapsule.smoke.test.ts` | `renderer/12_Window/shellCapsule.smoke.test.ts` | — · override |
| `renderer/sidebar-brand.test.tsx` | `renderer/12_Window/Sidebar.brand.test.tsx` | — · tie:name |
| `renderer/sidebar-multi-mode.test.tsx` | `renderer/12_Window/Sidebar.multi-mode.test.tsx` | — · tie:name |
| `renderer/sidebar-profile-foot.test.tsx` | `renderer/12_Window/Sidebar.profile-foot.test.tsx` | — · tie:name |
| `renderer/sidebar-sessions-real.test.tsx` | `renderer/12_Window/Sidebar.sessions-real.test.tsx` | — |
| `renderer/sidebar-sessions.test.tsx` | `renderer/12_Window/Sidebar.sessions.test.tsx` | — |
| `renderer/shell-chrome.test.tsx` | `renderer/12_Window/TitleBar.shell-chrome.test.tsx` | — |
| `renderer/shortcuts-f14.test.tsx` | `renderer/12_Window/useGlobalShortcuts.basics.test.tsx` | `f14` · override |
| `renderer/global-shortcuts-p6.test.tsx` | `renderer/12_Window/useGlobalShortcuts.test.tsx` | `p6` · override |
| `renderer/zoom-shortcut-p05.test.tsx` | `renderer/12_Window/useGlobalShortcuts.zoom.test.tsx` | `p05` |
| `renderer/useGlobalZoom.test.tsx` | `renderer/12_Window/useGlobalZoom.test.tsx` | — |
| `renderer/ZoomControl.test.tsx` | `renderer/12_Window/ZoomControl.test.tsx` | — |
