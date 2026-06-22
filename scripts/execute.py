#!/usr/bin/env python3
"""
AgentDeck 하네스 — Phase 순차 실행기 (하네스 프레임워크 Layer 3).

phases/<milestone>/NN-<slug>.md 들을 번호 순서로 `claude -p`(헤드리스)에 넘겨
순차 실행한다. Phase마다 *새 Claude 세션* → 각 Phase 지시서가 작업 범위를
문서로 제한하므로 에이전트가 범위 밖 작업을 하지 않는다.

상태 추적:
  phases/<milestone>/<NN-slug>.status.json  =  {"status": "...", "note": "..."}
    completed → 자동 커밋 → 다음 Phase
    error     → 기록 + 중단
    blocked   → 사용자 개입 필요 + 중단

사용:
  python scripts/execute.py 01_mvp           # 순차 실행
  python scripts/execute.py 01_mvp --dry-run # 프롬프트만 출력(실행 X)
  python scripts/execute.py 01_mvp --from 03 # 특정 Phase부터
"""
from __future__ import annotations
import argparse, json, os, re, shutil, subprocess, sys
from pathlib import Path
from datetime import datetime, timezone

ROOT = Path(__file__).resolve().parent.parent
PHASES_DIR = ROOT / "phases"

PREAMBLE = """\
너는 AgentDeck 하네스의 Phase 실행자다. 아래 Phase 지시서 *하나만* 완수한다.

규칙(절대):
- 먼저 CLAUDE.md(헌법)와 docs/(PRD·ARCHITECTURE·ADR·UI_GUIDE)를 읽고 규칙·구조를 준수한다.
- 이 Phase의 '변경 대상'·도메인 경계 *밖*은 건드리지 않는다. 범위 밖 필요 발견 시 status=blocked로 보고하고 멈춘다.
- 새 기능은 테스트 먼저(TDD). 비가역 작업(push/PR/배포/package)은 하지 않는다.
- .claude/, docs/ADR.md, CLAUDE.md(하네스 자체)는 수정하지 않는다.
- 완료조건(AC)을 만족했는지 스스로 검증한다(typecheck/test 등).

종료 시 *반드시* 다음 파일을 쓴다(JSON):
  {status_path}
형식: {{"status": "completed|error|blocked", "note": "<한 줄 요약 또는 사유>"}}
  - completed: AC 모두 충족 + 빌드/타입검사 통과
  - error:     실패(빌드/테스트/명세 미달) — note에 사유
  - blocked:   범위 밖 의존/사람 결정 필요 — note에 무엇이 막혔는지

────────────────────── Phase 지시서 ──────────────────────
{phase_body}
"""


def find_claude() -> str | None:
    for name in ("claude", "claude.cmd", "claude.exe"):
        p = shutil.which(name)
        if p:
            return p
    return None


def phase_files(milestone: str) -> list[Path]:
    d = PHASES_DIR / milestone
    if not d.is_dir():
        sys.exit(f"❌ phases/{milestone}/ 폴더가 없습니다.")
    files = sorted(
        [f for f in d.glob("*.md") if re.match(r"\d+-", f.name) and not f.name.startswith("_")],
        key=lambda f: f.name,
    )
    if not files:
        sys.exit(f"❌ phases/{milestone}/ 에 Phase 파일(NN-slug.md)이 없습니다.")
    return files


def status_path(f: Path) -> Path:
    return f.with_suffix(".status.json")


def read_status(f: Path) -> dict | None:
    sp = status_path(f)
    if sp.exists():
        try:
            return json.loads(sp.read_text(encoding="utf-8"))
        except Exception:
            return None
    return None


def run_phase(claude: str, f: Path, dry: bool) -> dict:
    sp = status_path(f)
    if sp.exists():
        sp.unlink()  # 이전 상태 제거 → 이번 실행 결과로 판정
    prompt = PREAMBLE.format(status_path=sp.as_posix(), phase_body=f.read_text(encoding="utf-8"))

    if dry:
        print(f"\n----- DRY RUN: {f.name} 프롬프트 -----\n{prompt[:1200]}\n... (생략) -----")
        return {"status": "dry-run", "note": ""}

    # 헤드리스 실행. 권한은 settings.json(ask 게이트) 적용.
    cmd = [claude, "-p", prompt]
    try:
        subprocess.run(cmd, cwd=ROOT, check=False)
    except KeyboardInterrupt:
        sys.exit("\n⏹️  사용자 중단.")

    st = read_status(f)
    if st is None:
        return {"status": "error", "note": "status.json 미생성 — Phase가 완료 신호를 남기지 않음"}
    return st


def git_commit(milestone: str, f: Path, note: str) -> None:
    slug = f.stem
    msg = f"feat({milestone}): {slug}\n\n{note}".strip()
    subprocess.run(["git", "add", "-A"], cwd=ROOT, check=False)
    r = subprocess.run(["git", "commit", "-m", msg], cwd=ROOT, capture_output=True, text=True)
    if r.returncode == 0:
        print("   ✓ 자동 커밋")
    else:
        print("   (커밋할 변경 없음 또는 커밋 스킵)")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("milestone", help="예: 01_mvp")
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--from", dest="from_n", default=None, help="시작 Phase 번호(예: 03)")
    args = ap.parse_args()

    claude = find_claude()
    if not claude and not args.dry_run:
        sys.exit("❌ `claude` CLI를 찾을 수 없습니다. Claude Code 설치 후 PATH 확인. (--dry-run 으로 프롬프트만 확인 가능)")

    files = phase_files(args.milestone)
    if args.from_n:
        files = [f for f in files if f.name[: len(args.from_n)] >= args.from_n]

    pending = [f for f in files if (read_status(f) or {}).get("status") != "completed"]

    print("=" * 56)
    print("  AgentDeck Harness Executor")
    print(f"  Milestone: {args.milestone} | Phases: {len(files)} | Pending: {len(pending)}")
    print("=" * 56)

    for f in files:
        st0 = read_status(f)
        if st0 and st0.get("status") == "completed":
            print(f"  ⏭️  {f.stem} (이미 완료)")
            continue

        print(f"\n▶ {f.stem} 실행…")
        start = datetime.now(timezone.utc)
        st = run_phase(claude, f, args.dry_run)
        secs = int((datetime.now(timezone.utc) - start).total_seconds())
        status = st.get("status", "error")
        note = st.get("note", "")

        if status == "dry-run":
            continue
        if status == "completed":
            print(f"  ✓ {f.stem} [{secs}s] — {note}")
            git_commit(args.milestone, f, note)
        elif status == "blocked":
            print(f"  🟡 BLOCKED: {f.stem} — {note}")
            print("     사용자 개입 필요. Phase 지시서 보강 후 재실행하세요.")
            sys.exit(1)
        else:
            print(f"  ❌ ERROR: {f.stem} — {note}")
            print(f"     상태 기록: {status_path(f).name}. 원인 확인 후 재실행하면 해당 Phase부터 재개됩니다.")
            sys.exit(1)

    if not args.dry_run:
        print("\n" + "=" * 56)
        print(f"  Milestone '{args.milestone}' 완료!")
        print("=" * 56)


if __name__ == "__main__":
    main()
