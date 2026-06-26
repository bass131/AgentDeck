# 하네스 보강 적용 가이드 (사용자 수동 — `.claude/**` deny 때문)

> `.claude/settings.json` deny(`Edit(.claude/**)`·`Write(.claude/agents/**)`)가 **Write 도구를 하드 차단**
> 하므로, 대화상 "직접 적용 인가"에도 제가 `.claude/`에 직접 못 씁니다(헌법 게이트가 코드로 강제).
> 아래 2단계만 적용하면 Phase H1이 활성화됩니다. `scripts/hooks/`(denied 아님)의 훅 스크립트는
> 이미 작성·smoke 검증 완료 — settings.json 등록만 남았습니다.

## 1) CHANGELOG 배치
이 세션 셸에서:
```
! cp docs/harness-staging/CHANGELOG.md .claude/CHANGELOG.md
```

## 2) settings.json 훅 등록
`.claude/settings.json`의 `"hooks"` 블록(현재 라인 53~76)을 아래로 **교체**:
(추가: PreToolUse Edit|Write에 `risk-detector.sh`, PostToolUse Edit|Write에 `reviewer-auto-trigger.sh`)

```json
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Bash",
        "hooks": [
          { "type": "command", "command": "bash \"$CLAUDE_PROJECT_DIR/scripts/hooks/dangerous-cmd-guard.sh\"" }
        ]
      },
      {
        "matcher": "Edit|Write",
        "hooks": [
          { "type": "command", "command": "bash \"$CLAUDE_PROJECT_DIR/scripts/hooks/tdd-guard.sh\"" },
          { "type": "command", "command": "bash \"$CLAUDE_PROJECT_DIR/scripts/hooks/risk-detector.sh\"" }
        ]
      }
    ],
    "PostToolUse": [
      {
        "matcher": "",
        "hooks": [
          { "type": "command", "command": "bash \"$CLAUDE_PROJECT_DIR/scripts/hooks/circuit-breaker.sh\"" }
        ]
      },
      {
        "matcher": "Edit|Write",
        "hooks": [
          { "type": "command", "command": "bash \"$CLAUDE_PROJECT_DIR/scripts/hooks/reviewer-auto-trigger.sh\"" }
        ]
      }
    ]
  }
```

> **반영 시점**: 훅/권한 설정은 **세션 재시작 시 확실히 로드**됩니다. 적용 후 즉시 안 먹으면 Claude Code 재시작.

## (선택 A) 제가 이후로 `.claude/` 직접 적용하려면
`.claude/settings.json` deny에서 **이 두 줄 임시 제거** → 재시작 → 이후 H2(refactor-sweep 등) 직접 적용 가능 → 작업 끝나면 복원:
```
"Edit(.claude/**)",
"Write(.claude/agents/**)"
```

## (제안만 — 사용자 게이트) 헌법 포인터
`CLAUDE.md`의 `## 문서 지도`에 한 줄 추가 권장(승인 시):
```
- `.claude/CHANGELOG.md` — 헌법/ADR/하네스/공유계약 변경 박제 (compact·세션 경계 기억)
```

## 검증
- 적용 후 아무 `src/shared/ipc-contract.ts`나 `src/preload/` 편집 시 stderr에 `🚩 risk-detector …` + `🔍 reviewer-auto-trigger …` 보이면 활성.
- 훅 단독 smoke(이미 통과): `echo '{"tool_name":"Edit","tool_input":{"file_path":"src/preload/index.ts"}}' | bash scripts/hooks/risk-detector.sh`
