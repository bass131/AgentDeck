// check-readme-links 판정 사각 (M02 Phase 4 Step 4, 검수 발견 13번) — 네 결손을 실측한다.
//   ① 공백 든 링크 타깃을 아예 집계하지 않는다 (정규식이 공백 없는 타깃만 잡는다).
//   ② reference-style 링크(`[텍스트][라벨]` + `[라벨]: 경로`)를 집계하지 않는다.
//   ③ 저장소 밖 형제 경로(`../옆저장소/x.md`)를 실존한다는 이유로 통과시킨다.
//   ④ Windows에서 대소문자 불일치를 잡지 못한다 (`fs.existsSync`가 참을 낸다).
// 판정은 블랙박스다 — 임시 저장소를 만들고 CLAUDE_PROJECT_DIR로 스크립트를 구동해 종료 코드와
// 집계 수만 본다. 실물 표면은 루트 README 하나이므로 미러의 README.md만 쓴다.
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRunner } from './_lib/runner.mjs'

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
const SCRIPT = join(REPO_ROOT, '98_Management', '03_Tools', 'check-readme-links.cjs')
const r = createRunner('check-readme-links 판정 사각 (검수 발견 13번)')
const trash = []

// 미러 저장소를 만들고 스크립트를 1회 구동한다. opts.files는 미러 안, opts.outside는 미러 밖 형제다.
function check(readme, opts = {}) {
  const box = mkdtempSync(join(tmpdir(), 'agentdeck-links-'))
  trash.push(box)
  const root = join(box, 'repo')
  mkdirSync(root, { recursive: true })
  for (const [p, body] of Object.entries(opts.files || {})) {
    const abs = join(root, p)
    mkdirSync(dirname(abs), { recursive: true })
    writeFileSync(abs, body === true ? '내용\n' : body)
  }
  for (const [p, body] of Object.entries(opts.outside || {})) {
    const abs = join(box, p)
    mkdirSync(dirname(abs), { recursive: true })
    writeFileSync(abs, body === true ? '내용\n' : body)
  }
  if (readme !== null) writeFileSync(join(root, 'README.md'), readme)
  const out = spawnSync(process.execPath, [SCRIPT], {
    cwd: root, encoding: 'utf8', env: { ...process.env, CLAUDE_PROJECT_DIR: root },
  })
  const all = `${out.stdout || ''}\n${out.stderr || ''}`
  const m = all.match(/내부 링크 (\d+)건/)
  return { code: out.status, out: all, checked: m ? Number(m[1]) : -1 }
}

// ── ① 공백 든 링크 타깃 ────────────────────────────────────────────────
const sp1 = check('- [문서](00_Docs/내 문서.md)\n', { files: { '00_Docs/내 문서.md': true } })
r.judge('RL-01 공백 타깃 실존 → 집계 1건', sp1.checked, 1)
r.judge('RL-02 공백 타깃 실존 → exit 0', sp1.code, 0)
r.judge('RL-03 공백 타깃 부재 → exit 1', check('- [문서](00_Docs/없는 문서.md)\n').code, 1)
const ang = check('- [문서](<00_Docs/내 문서.md>)\n', { files: { '00_Docs/내 문서.md': true } })
r.judge('RL-04 각괄호 타깃 실존 → 집계 1건', ang.checked, 1)
r.judge('RL-05 각괄호 타깃 부재 → exit 1', check('- [문서](<00_Docs/없는 문서.md>)\n').code, 1)

// ── ② reference-style 링크 ────────────────────────────────────────────
const ref = check('본문은 [계획][plan]을 본다.\n\n[plan]: 01_Plan/계획.md\n', { files: { '01_Plan/계획.md': true } })
r.judge('RL-06 reference 정의 실존 → 집계 1건', ref.checked, 1)
r.judge('RL-07 reference 정의 실존 → exit 0', ref.code, 0)
r.judge('RL-08 reference 정의 부재 → exit 1', check('본문은 [계획][plan]을 본다.\n\n[plan]: 01_Plan/없다.md\n').code, 1)
const coll = check('본문은 [plan][]을 본다.\n\n[plan]: 01_Plan/계획.md\n', { files: { '01_Plan/계획.md': true } })
r.judge('RL-09 collapsed 참조 실존 → exit 0', coll.code, 0)
r.judge('RL-10 정의 없는 참조 라벨 → exit 1', check('본문은 [계획][plan]을 본다.\n').code, 1)
r.judge('RL-11 참조 정의의 각괄호 타깃', check('[a][p]\n\n[p]: <01_Plan/내 계획.md>\n', { files: { '01_Plan/내 계획.md': true } }).code, 0)

// ── ③ 저장소 밖 형제 경로 ──────────────────────────────────────────────
const sibling = check('- [옆](../Moodie/원본.md)\n', { outside: { 'Moodie/원본.md': true } })
r.judge('RL-12 실존하는 저장소 밖 형제 → exit 1', sibling.code, 1)
r.check('RL-13 반려 사유에 저장소 밖임이 적힌다', /저장소 밖|경계 밖/.test(sibling.out), sibling.out.slice(0, 200))
r.judge('RL-14 나갔다 되돌아오는 경로는 통과 (오탐 회귀)',
  check('- [문서](00_Docs/../00_Docs/x.md)\n', { files: { '00_Docs/x.md': true } }).code, 0)

// ── ④ 대소문자 불일치 ──────────────────────────────────────────────────
const cs = check('- [문서](00_Docs/Plan.md)\n', { files: { '00_Docs/plan.md': true } })
r.judge('RL-15 대소문자 불일치 → exit 1', cs.code, 1)
r.check('RL-16 반려 사유에 대소문자가 적힌다', /대소문자/.test(cs.out), cs.out.slice(0, 200))
r.judge('RL-17 대소문자 일치는 통과 (오탐 회귀)', check('- [문서](00_Docs/plan.md)\n', { files: { '00_Docs/plan.md': true } }).code, 0)
r.judge('RL-18 디렉터리 링크도 대소문자 판정', check('- [폴더](00_docs/)\n', { files: { '00_Docs/plan.md': true } }).code, 1)

// ── 회귀 불변식 (종전 동작 유지) ───────────────────────────────────────
const ext = check('- [외부](https://example.com/x.md)\n- [앵커](#절)\n', {})
r.judge('RL-19 외부 주소·순수 앵커는 집계 밖', ext.checked, 0)
r.judge('RL-20 외부 주소·순수 앵커는 exit 0', ext.code, 0)
r.judge('RL-21 `문서.md#절`의 앵커 절단', check('- [절](00_Docs/x.md#가)\n', { files: { '00_Docs/x.md': true } }).code, 0)
r.judge('RL-22 이미지 링크 집계', check('![그림](00_Docs/x.png)\n').code, 1)
r.judge('RL-23 제목 붙은 타깃', check('- [문서](00_Docs/x.md "제목")\n', { files: { '00_Docs/x.md': true } }).code, 0)
r.judge('RL-24 루트-절대 경로', check('- [문서](/00_Docs/x.md)\n', { files: { '00_Docs/x.md': true } }).code, 0)
r.judge('RL-25 `%20` 인코딩 타깃', check('- [문서](00_Docs/내%20문서.md)\n', { files: { '00_Docs/내 문서.md': true } }).code, 0)
r.judge('RL-26 README 부재 → exit 2', check(null, {}).code, 2)
r.judge('RL-27 깨진 링크 있으면 exit 1', check('- [문서](00_Docs/없다.md)\n').code, 1)

for (const box of trash) { try { rmSync(box, { recursive: true, force: true }) } catch { /* 임시 폴더 잔재는 무해 */ } }
process.exit(r.summary())
