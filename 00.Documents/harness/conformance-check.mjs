#!/usr/bin/env node
// CORE conformance 게이트 (HR1 P06, ADR-034) — 조항×어댑터 매핑 기계 검사.
//
// 검사 계약(core-manifest.json $comment가 선언):
//   ① CORE.md ↔ manifest 조항 양방향 일치 + 조항 버전(vN) 일치
//   ② 조항마다 어댑터 2종(claude·codex) 매핑 존재
//   ③ impl 경로 전부 디스크 실재
//   ④ verify ≥1 선언(manual 허용·부재 불허) — type 화이트리스트,
//      test/hook은 ref 파일 실재, gate는 ref 파일 또는 npm script 실재, manual은 note 필수
//
// 판정 규칙은 본 파일이 소유하고, 의미 정본은 CORE.md·기록은 manifest가 소유한다.
// 사용: node 00.Documents/harness/conformance-check.mjs   (exit 0 = green / 1 = FAIL)
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const at = (p) => path.join(ROOT, p)
const out = (line) => process.stdout.write(line + '\n')

const failures = []
const fail = (clauseId, msg) => failures.push(`${clauseId}: ${msg}`)

// ── 입력 로드 ────────────────────────────────────────────────────────────────
const manifestPath = '00.Documents/harness/core-manifest.json'
let manifest
try {
  manifest = JSON.parse(fs.readFileSync(at(manifestPath), 'utf8'))
} catch (error) {
  out(`CONFORMANCE: FAIL — manifest 로드 불가(${manifestPath}): ${error.message}`)
  process.exit(1)
}

if (manifest.manifestVersion !== 1) {
  out(`CONFORMANCE: FAIL — manifestVersion ${manifest.manifestVersion} ≠ 1 (본 게이트의 판정 규칙은 v1 계약 기준 — manifest 스키마를 올렸다면 게이트도 함께 개정할 것)`)
  process.exit(1)
}

let coreText
try {
  coreText = fs.readFileSync(at(manifest.core), 'utf8')
} catch (error) {
  out(`CONFORMANCE: FAIL — core 문서 로드 불가(${manifest.core}): ${error.message}`)
  process.exit(1)
}

// ── ① 조항 양방향 일치 + 버전 일치 ──────────────────────────────────────────
// CORE.md 조항 헤더 형식: "## CORE-NN 제목 — vN"
const coreClauses = new Map()
for (const m of coreText.matchAll(/^## (CORE-\d{2}) .+? — v(\d+)\s*$/gm)) {
  coreClauses.set(m[1], Number(m[2]))
}
if (coreClauses.size === 0) {
  out(`CONFORMANCE: FAIL — ${manifest.core}에서 조항 헤더("## CORE-NN … — vN")를 하나도 파싱하지 못함 — 문서 형식이 바뀌었으면 본 게이트의 파서도 개정할 것`)
  process.exit(1)
}

const manifestClauses = new Map()
for (const clause of manifest.clauses ?? []) {
  if (manifestClauses.has(clause.id)) fail(clause.id, 'manifest에 조항 중복 선언')
  manifestClauses.set(clause.id, clause)
}

for (const id of coreClauses.keys()) {
  if (!manifestClauses.has(id)) fail(id, 'CORE.md에 있으나 manifest에 미매핑')
}
for (const id of manifestClauses.keys()) {
  if (!coreClauses.has(id)) fail(id, 'manifest에 있으나 CORE.md에 조항 없음(유령 매핑)')
}

// ── ②③④ 조항별 어댑터 검사 ─────────────────────────────────────────────────
const verifyTypes = new Set(manifest.verifyTypes ?? [])
const npmScripts = (() => {
  try {
    return new Set(Object.keys(JSON.parse(fs.readFileSync(at('package.json'), 'utf8')).scripts ?? {}))
  } catch {
    return new Set()
  }
})()

const REF_REQUIRED = new Set(['test', 'hook', 'gate'])

for (const [id, clause] of manifestClauses) {
  const coreV = coreClauses.get(id)
  if (coreV !== undefined && clause.v !== coreV) {
    fail(id, `버전 불일치 — manifest v${clause.v} ≠ CORE.md v${coreV} (조항 의미가 바뀌었으면 양쪽 동기 상향)`)
  }

  for (const adapter of ['claude', 'codex']) {
    const decl = clause[adapter]
    if (!decl || typeof decl !== 'object') {
      fail(id, `${adapter} 어댑터 매핑 부재`)
      continue
    }

    const impls = Array.isArray(decl.impl) ? decl.impl : []
    if (impls.length === 0) fail(id, `${adapter}.impl 비어 있음`)
    for (const impl of impls) {
      if (!fs.existsSync(at(impl))) fail(id, `${adapter}.impl 경로 실재하지 않음: ${impl}`)
    }

    const verifies = Array.isArray(decl.verify) ? decl.verify : []
    if (verifies.length === 0) {
      fail(id, `${adapter}.verify 부재 — manual이라도 선언 의무`)
      continue
    }
    for (const verify of verifies) {
      if (!verifyTypes.has(verify.type)) {
        fail(id, `${adapter}.verify type "${verify.type}" — 허용 목록(${[...verifyTypes].join('/')}) 밖`)
        continue
      }
      if (verify.type === 'manual') {
        if (!verify.note) fail(id, `${adapter}.verify(manual)에 note 없음 — 사람이 뭘 하는지 선언 의무`)
        continue
      }
      if (REF_REQUIRED.has(verify.type)) {
        if (!verify.ref) {
          fail(id, `${adapter}.verify(${verify.type})에 ref 없음`)
          continue
        }
        const npmMatch = /^npm run (\S+)$/.exec(verify.ref)
        if (npmMatch) {
          if (!npmScripts.has(npmMatch[1])) fail(id, `${adapter}.verify ref "npm run ${npmMatch[1]}" — package.json scripts에 없음`)
        } else if (!fs.existsSync(at(verify.ref))) {
          fail(id, `${adapter}.verify ref 실재하지 않음: ${verify.ref}`)
        }
      }
    }
  }
}

// ── 보고 ────────────────────────────────────────────────────────────────────
const ids = [...coreClauses.keys()].sort()
for (const id of ids) {
  const bad = failures.some((f) => f.startsWith(`${id}:`))
  const v = coreClauses.get(id)
  out(`${bad ? '✗' : '✓'} ${id} v${v}${bad ? '' : ' — claude·codex 매핑 OK'}`)
}
if (failures.length > 0) {
  out('')
  for (const f of failures) out(`FAIL ${f}`)
  out(`CONFORMANCE: FAIL — ${failures.length}건`)
  process.exit(1)
}
out(`CONFORMANCE: PASS — ${ids.length}/${ids.length} 조항 (매핑·버전·impl 실재·verify 선언 전부 green)`)
