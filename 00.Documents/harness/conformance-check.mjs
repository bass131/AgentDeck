#!/usr/bin/env node
// CORE conformance 게이트 (HR1 P06, ADR-034) — 조항×어댑터 매핑 기계 검사.
//
// 검사 계약(core-manifest.json $comment가 선언):
//   ① CORE.md ↔ manifest 조항 양방향 일치 + 조항 버전(vN) 일치
//      — CORE.md의 중복 조항 헤더·비정규 헤더("## CORE-…"인데 형식 불일치)도 FAIL (조용한 무시 금지)
//   ② 조항마다 어댑터 2종(claude·codex) 매핑 존재
//   ③ impl 경로 전부 디스크 실재 — 저장소 루트 밖 경로는 증거로 불인정(FAIL)
//   ④ verify ≥1 선언(manual 허용·부재 불허) — type 화이트리스트,
//      test/hook은 ref 파일 실재, gate는 ref 파일 또는 npm script 실재, manual은 note 필수
//
// 판정 규칙은 본 파일이 소유하고, 의미 정본은 CORE.md·기록은 manifest가 소유한다.
// 사용: node 00.Documents/harness/conformance-check.mjs [--root <dir>]
//   --root 는 회귀 테스트가 픽스처 루트를 주입하는 용도(기본 = 저장소 루트).
//   표준 실행 흐름 연결: 99.Others/tests의 Vitest 스펙이 본 스크립트를 spawn — `npm run test`가 곧 게이트.
//   exit 0 = green / 1 = FAIL.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const rootArgIndex = process.argv.indexOf('--root')
const ROOT = rootArgIndex !== -1 && process.argv[rootArgIndex + 1]
  ? path.resolve(process.argv[rootArgIndex + 1])
  : path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const out = (line) => process.stdout.write(line + '\n')

// 저장소 루트 안으로 해석되는 경로만 인정 — `..`/절대경로로 밖의 파일을 증거 삼는 것 차단.
const resolveInRoot = (p) => {
  const abs = path.resolve(ROOT, String(p))
  return abs === ROOT || abs.startsWith(ROOT + path.sep) ? abs : null
}

const failures = []
const fail = (clauseId, msg) => failures.push(`${clauseId}: ${msg}`)

// ── 입력 로드 ────────────────────────────────────────────────────────────────
const manifestRel = '00.Documents/harness/core-manifest.json'
let manifest
try {
  manifest = JSON.parse(fs.readFileSync(path.join(ROOT, manifestRel), 'utf8'))
} catch (error) {
  out(`CONFORMANCE: FAIL — manifest 로드 불가(${manifestRel}): ${error.message}`)
  process.exit(1)
}

if (manifest.manifestVersion !== 1) {
  out(`CONFORMANCE: FAIL — manifestVersion ${manifest.manifestVersion} ≠ 1 (본 게이트의 판정 규칙은 v1 계약 기준 — manifest 스키마를 올렸다면 게이트도 함께 개정할 것)`)
  process.exit(1)
}

const corePath = resolveInRoot(manifest.core)
if (!corePath) {
  out(`CONFORMANCE: FAIL — manifest.core가 저장소 루트 밖을 가리킴: ${manifest.core}`)
  process.exit(1)
}
let coreText
try {
  coreText = fs.readFileSync(corePath, 'utf8')
} catch (error) {
  out(`CONFORMANCE: FAIL — core 문서 로드 불가(${manifest.core}): ${error.message}`)
  process.exit(1)
}

// ── ① 조항 파싱 — 중복·비정규 헤더는 FAIL (조용한 무시 금지) ────────────────
// 정규 형식: "## CORE-NN 제목 — vN". "## CORE-"로 시작하는데 형식이 어긋나면
// 파서가 조용히 버리는 대신 명시적으로 실패시킨다(false-green 차단).
const coreClauses = new Map()
for (const line of coreText.split(/\r?\n/)) {
  if (!/^##\s+CORE-/.test(line)) continue
  const m = /^## (CORE-\d{2}) .+? — v(\d+)\s*$/.exec(line)
  if (!m) {
    fail('CORE-헤더', `비정규 조항 헤더 — 형식("## CORE-NN 제목 — vN") 불일치: "${line.trim()}"`)
    continue
  }
  if (coreClauses.has(m[1])) {
    fail(m[1], 'CORE.md에 조항 헤더 중복 — 어느 쪽이 정본인지 판정 불능')
    continue
  }
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
// verify 타입 화이트리스트는 본 게이트가 소유한다 — manifest.verifyTypes를 그대로 신뢰하면
// manifest가 자기 계약을 재정의할 수 있다(Codex Sol 리뷰: bogus 타입을 양쪽에 추가하면
// REF_REQUIRED·manual 어디에도 안 걸려 note/ref 없이 false-green). manifest가 선언한 타입도
// 이 고정 집합의 부분집합이어야 한다.
const VALID_VERIFY_TYPES = new Set(['test', 'hook', 'gate', 'manual'])
for (const declared of manifest.verifyTypes ?? []) {
  if (!VALID_VERIFY_TYPES.has(declared)) {
    fail('manifest', `verifyTypes에 미인식 타입 "${declared}" — 게이트가 아는 타입(${[...VALID_VERIFY_TYPES].join('/')})만 허용`)
  }
}
const verifyTypes = VALID_VERIFY_TYPES
const npmScripts = (() => {
  try {
    return new Set(Object.keys(JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')).scripts ?? {}))
  } catch {
    return new Set()
  }
})()

const REF_REQUIRED = new Set(['test', 'hook', 'gate'])
const existsInRoot = (p, onEscape) => {
  const abs = resolveInRoot(p)
  if (!abs) {
    onEscape()
    return true // 탈출 FAIL을 이미 기록 — 실재 검사 중복 FAIL 방지
  }
  return fs.existsSync(abs)
}

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
      if (!existsInRoot(impl, () => fail(id, `${adapter}.impl 경로가 저장소 루트 밖: ${impl}`))) {
        fail(id, `${adapter}.impl 경로 실재하지 않음: ${impl}`)
      }
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
        } else if (!existsInRoot(verify.ref, () => fail(id, `${adapter}.verify ref가 저장소 루트 밖: ${verify.ref}`))) {
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
