// AgentDeck 소스 → codemap.json 추출기
// 저장소(C:\Dev\AgentDeck)는 읽기만 한다. TypeScript 컴파일러는 저장소 node_modules에서 require로 빌려 쓴다.
// 사용: node extract.mjs [--src <00_Source 경로>] [--ts <typescript 경로>] [--out codemap.json]
import { createRequire } from 'node:module'
import fs from 'node:fs'
import path from 'node:path'

const args = process.argv.slice(2)
const arg = (k, d) => {
  const i = args.indexOf(k)
  return i >= 0 ? args[i + 1] : d
}
const SRC = path.resolve(arg('--src', 'C:/Dev/AgentDeck/02_Project/00_Source'))
const TS_PATH = arg('--ts', 'C:/Dev/AgentDeck/node_modules/typescript')
const OUT = path.resolve(arg('--out', 'codemap.json'))

const require = createRequire(import.meta.url)
const ts = require(TS_PATH)

const PROCESSES = ['main', 'preload', 'renderer', 'shared']
// 프로세스별 실제 소스 루트(renderer는 src 아래가 도메인)
const PROC_ROOT = { main: 'main', preload: 'preload', renderer: 'renderer/src', shared: 'shared' }
const ALIASES = {
  '@main/': 'main/',
  '@preload/': 'preload/',
  '@shared/': 'shared/',
  '@renderer/': 'renderer/src/'
}

// ───────── 파일 수집 ─────────
function walk(dir, acc = []) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    if (ent.name === 'node_modules' || ent.name.startsWith('.')) continue
    const p = path.join(dir, ent.name)
    if (ent.isDirectory()) walk(p, acc)
    else if (/\.(ts|tsx)$/.test(ent.name)) acc.push(p)
  }
  return acc
}
const toRel = (abs) => path.relative(SRC, abs).split(path.sep).join('/')
const allFiles = walk(SRC).map(toRel).sort()
const fileSet = new Set(allFiles)

// ───────── 이름 꼴 분류 ─────────
function nameStyle(raw) {
  let n = raw
  const prefix = n.startsWith('#') ? '#' : n.startsWith('_') ? '_' : ''
  n = n.replace(/^[#_]+/, '')
  let style
  if (/^[A-Z][A-Z0-9]*(_[A-Z0-9]+)+$/.test(n) || (/^[A-Z][A-Z0-9]+$/.test(n) && n.length > 1)) style = 'UPPER_SNAKE'
  else if (/^[A-Z][a-zA-Z0-9]*$/.test(n)) style = 'PascalCase'
  else if (/^[a-z][a-zA-Z0-9]*$/.test(n)) style = /[A-Z]/.test(n) ? 'camelCase' : 'lowercase'
  else if (/^[a-z][a-z0-9]*(-[a-z0-9]+)+$/.test(n)) style = 'kebab-case'
  else if (/^[a-z][a-z0-9]*(_[a-z0-9]+)+$/.test(n)) style = 'snake_case'
  else style = '기타'
  return { style, prefix }
}

const bump = (o, k, n = 1) => (o[k] = (o[k] ?? 0) + n)

// ───────── AST 도우미 ─────────
const clip = (s, n = 160) => {
  if (s == null) return null
  s = s.replace(/\s+/g, ' ').trim()
  return s.length > n ? s.slice(0, n - 1) + '…' : s
}
const mods = (node) => (ts.canHaveModifiers?.(node) ? ts.getModifiers(node) : node.modifiers) ?? []
const hasMod = (node, kind) => mods(node).some((m) => m.kind === kind)
const lineOf = (sf, pos) => sf.getLineAndCharacterOfPosition(pos).line + 1

function docOf(node, sf) {
  // JSDoc 첫 줄 우선, 없으면 바로 위 // 주석 첫 줄
  const jsDocs = node.jsDoc
  if (jsDocs && jsDocs.length) {
    const c = jsDocs[jsDocs.length - 1].comment
    const text = typeof c === 'string' ? c : Array.isArray(c) ? c.map((x) => x.text ?? '').join('') : ''
    const first = text.split(/\r?\n/).map((l) => l.trim()).find(Boolean)
    if (first) return { doc: clip(first, 200), docKind: 'jsdoc' }
  }
  const ranges = ts.getLeadingCommentRanges(sf.text, node.pos) ?? []
  // 선언 바로 위에 붙은 // 덩어리만 쓴다(빈 줄로 떨어진 파일 머리말·구분선은 제외)
  const start = node.getStart(sf)
  const adj = []
  let cursor = start
  for (let i = ranges.length - 1; i >= 0; i--) {
    const r = ranges[i]
    const gap = sf.text.slice(r.end, cursor)
    if ((gap.match(/\n/g) ?? []).length > 1) break
    adj.unshift(r)
    cursor = r.pos
  }
  const lineComments = adj.filter((r) => r.kind === ts.SyntaxKind.SingleLineCommentTrivia)
  if (lineComments.length) {
    const lines = lineComments.map((r) => sf.text.slice(r.pos, r.end).replace(/^\/\/\s?/, '').trim()).filter((t) => t && !/^[─━=\-*#\s]+$/.test(t) && !/^(eslint|@ts-|prettier)/.test(t))
    if (lines.length) return { doc: clip(lines[0], 200), docKind: 'line' }
  }
  const block = adj.find((r) => r.kind === ts.SyntaxKind.MultiLineCommentTrivia)
  if (block) {
    const t = sf.text.slice(block.pos, block.end).replace(/^\/\*+|\*+\/$/g, '')
    const first = t.split(/\r?\n/).map((l) => l.replace(/^\s*\*\s?/, '').trim()).find(Boolean)
    if (first) return { doc: clip(first, 200), docKind: 'block' }
  }
  return { doc: null, docKind: null }
}

function unwrapExpr(e) {
  while (
    e &&
    (ts.isAsExpression(e) ||
      ts.isParenthesizedExpression(e) ||
      (ts.isSatisfiesExpression && ts.isSatisfiesExpression(e)) ||
      ts.isTypeAssertionExpression?.(e) ||
      ts.isNonNullExpression(e))
  )
    e = e.expression
  return e
}

function inferType(init, sf) {
  if (!init) return null
  const e = unwrapExpr(init)
  if (ts.isStringLiteral(e) || ts.isNoSubstitutionTemplateLiteral(e) || ts.isTemplateExpression(e)) return '≈string'
  if (ts.isNumericLiteral(e) || (ts.isPrefixUnaryExpression(e) && ts.isNumericLiteral(e.operand))) return '≈number'
  if (e.kind === ts.SyntaxKind.TrueKeyword || e.kind === ts.SyntaxKind.FalseKeyword) return '≈boolean'
  if (e.kind === ts.SyntaxKind.NullKeyword) return '≈null'
  if (ts.isArrowFunction(e) || ts.isFunctionExpression(e)) return '≈(함수)'
  if (ts.isNewExpression(e)) return '≈' + clip(e.expression.getText(sf), 60)
  if (ts.isArrayLiteralExpression(e)) return '≈배열'
  if (ts.isObjectLiteralExpression(e)) return '≈객체'
  if (ts.isCallExpression(e)) return '≈' + clip(e.expression.getText(sf), 50) + '(…)'
  return '≈' + clip(e.getText(sf), 50)
}

function paramsOf(fn, sf) {
  return (fn.parameters ?? []).map((p) => {
    const nm = ts.isIdentifier(p.name) ? p.name.text : clip(p.name.getText(sf), 50)
    return {
      name: (p.dotDotDotToken ? '...' : '') + nm,
      optional: !!p.questionToken || !!p.initializer,
      type: p.type ? clip(p.type.getText(sf), 100) : inferType(p.initializer, sf)
    }
  })
}
const sigOf = (params, ret, opts = {}) =>
  `${opts.async ? 'async ' : ''}(${params.map((p) => `${p.name}${p.optional ? '?' : ''}${p.type ? ': ' + p.type.replace(/^≈/, '') : ''}`).join(', ')})${ret ? ': ' + ret : ''}`

function containsJsx(node) {
  let found = false
  const visit = (n) => {
    if (found) return
    if (ts.isJsxElement(n) || ts.isJsxSelfClosingElement(n) || ts.isJsxFragment(n)) {
      found = true
      return
    }
    // 중첩 클래스/함수 선언 안의 JSX도 컴포넌트 판별에 포함(렌더 함수 반환)
    ts.forEachChild(n, visit)
  }
  visit(node)
  return found
}

function memberName(m, sf) {
  if (!m.name) return null
  if (ts.isIdentifier(m.name) || ts.isPrivateIdentifier(m.name)) return m.name.text
  if (ts.isStringLiteral(m.name) || ts.isNumericLiteral(m.name)) return m.name.text
  return clip(m.name.getText(sf), 60)
}

function accessOf(m, name) {
  if (name && name.startsWith('#')) return '#private'
  if (hasMod(m, ts.SyntaxKind.PrivateKeyword)) return 'private'
  if (hasMod(m, ts.SyntaxKind.ProtectedKeyword)) return 'protected'
  if (hasMod(m, ts.SyntaxKind.PublicKeyword)) return 'public'
  return 'public(기본)'
}

let idSeq = 0
const nid = () => 'n' + ++idSeq

// ───────── 클래스 ─────────
function classMembers(cls, sf) {
  const out = []
  for (const m of cls.members) {
    const name = memberName(m, sf)
    const base = {
      id: nid(),
      name: name ?? '(이름 없음)',
      static: hasMod(m, ts.SyntaxKind.StaticKeyword),
      readonly: hasMod(m, ts.SyntaxKind.ReadonlyKeyword),
      abstract: hasMod(m, ts.SyntaxKind.AbstractKeyword),
      line: lineOf(sf, m.getStart(sf)),
      lines: lineOf(sf, m.end) - lineOf(sf, m.getStart(sf)) + 1,
      ...docOf(m, sf)
    }
    if (ts.isPropertyDeclaration(m)) {
      const isFnField = m.initializer && (ts.isArrowFunction(unwrapExpr(m.initializer)) || ts.isFunctionExpression(unwrapExpr(m.initializer)))
      out.push({
        ...base,
        kind: 'field',
        fieldFn: !!isFnField,
        access: accessOf(m, name),
        optional: !!m.questionToken,
        type: m.type ? clip(m.type.getText(sf), 120) : inferType(m.initializer, sf)
      })
    } else if (ts.isMethodDeclaration(m)) {
      const params = paramsOf(m, sf)
      const ret = m.type ? clip(m.type.getText(sf), 100) : null
      const isAsync = hasMod(m, ts.SyntaxKind.AsyncKeyword)
      out.push({ ...base, kind: 'method', access: accessOf(m, name), async: isAsync, params, returns: ret, type: sigOf(params, ret, { async: isAsync }) })
    } else if (ts.isConstructorDeclaration(m)) {
      const params = paramsOf(m, sf)
      out.push({ ...base, name: 'constructor', kind: 'ctor', access: accessOf(m, null), params, type: sigOf(params, null) })
      // 매개변수 속성(constructor(private x: T))은 필드로도 등록
      for (const p of m.parameters) {
        const pm = mods(p)
        if (pm.some((x) => [ts.SyntaxKind.PrivateKeyword, ts.SyntaxKind.ProtectedKeyword, ts.SyntaxKind.PublicKeyword, ts.SyntaxKind.ReadonlyKeyword].includes(x.kind))) {
          const pn = ts.isIdentifier(p.name) ? p.name.text : p.name.getText(sf)
          out.push({
            id: nid(),
            name: pn,
            kind: 'field',
            paramProp: true,
            access: accessOf(p, pn),
            static: false,
            readonly: hasMod(p, ts.SyntaxKind.ReadonlyKeyword),
            abstract: false,
            type: p.type ? clip(p.type.getText(sf), 120) : null,
            line: lineOf(sf, p.getStart(sf)),
            lines: 1,
            doc: '생성자 매개변수 속성',
            docKind: 'note'
          })
        }
      }
    } else if (ts.isGetAccessorDeclaration(m) || ts.isSetAccessorDeclaration(m)) {
      const isGet = ts.isGetAccessorDeclaration(m)
      out.push({
        ...base,
        kind: isGet ? 'getter' : 'setter',
        access: accessOf(m, name),
        type: isGet ? (m.type ? clip(m.type.getText(sf), 100) : null) : sigOf(paramsOf(m, sf), null)
      })
    } else if (ts.isIndexSignatureDeclaration(m)) {
      out.push({ ...base, name: '[index]', kind: 'index', access: 'public(기본)', type: clip(m.getText(sf), 120) })
    } else if (ts.isClassStaticBlockDeclaration?.(m)) {
      out.push({ ...base, name: 'static {}', kind: 'staticBlock', access: 'public(기본)', static: true })
    }
  }
  return out
}

function heritage(node, sf) {
  const ext = []
  const impl = []
  for (const h of node.heritageClauses ?? []) {
    const list = h.types.map((t) => clip(t.getText(sf), 80))
    if (h.token === ts.SyntaxKind.ExtendsKeyword) ext.push(...list)
    else impl.push(...list)
  }
  return { extends: ext, implements: impl }
}

// ───────── 인터페이스/타입 멤버 ─────────
function typeMembers(members, sf) {
  const out = []
  for (const m of members) {
    const name = memberName(m, sf)
    const base = {
      id: nid(),
      line: lineOf(sf, m.getStart(sf)),
      lines: lineOf(sf, m.end) - lineOf(sf, m.getStart(sf)) + 1,
      readonly: hasMod(m, ts.SyntaxKind.ReadonlyKeyword),
      optional: !!m.questionToken,
      access: 'public(기본)',
      ...docOf(m, sf)
    }
    if (ts.isPropertySignature(m)) {
      const t = m.type
      const isFn = t && ts.isFunctionTypeNode(t)
      out.push({ ...base, name, kind: isFn ? 'propFn' : 'prop', type: t ? clip(t.getText(sf), 140) : null })
    } else if (ts.isMethodSignature(m)) {
      const params = paramsOf(m, sf)
      const ret = m.type ? clip(m.type.getText(sf), 100) : null
      out.push({ ...base, name, kind: 'methodSig', params, returns: ret, type: sigOf(params, ret) })
    } else if (ts.isCallSignatureDeclaration(m) || ts.isConstructSignatureDeclaration(m)) {
      const params = paramsOf(m, sf)
      out.push({ ...base, name: ts.isCallSignatureDeclaration(m) ? '(호출)' : 'new', kind: 'methodSig', params, type: sigOf(params, m.type ? clip(m.type.getText(sf), 80) : null) })
    } else if (ts.isIndexSignatureDeclaration(m)) {
      out.push({ ...base, name: '[index]', kind: 'index', type: clip(m.getText(sf), 120) })
    }
  }
  return out
}

// ───────── 함수 본문 안 최상위 선언(컴포넌트/훅 설계 보기용) ─────────
const HOOK_STATE = new Set(['useState', 'useReducer'])
const HOOK_REF = new Set(['useRef'])
const HOOK_MEMO = new Set(['useMemo', 'useCallback'])
// 팩토리 함수가 돌려주는 객체 리터럴의 키(메서드·속성)를 「반환 객체」 멤버로 꺼낸다
function returnedObjectMembers(obj, sf) {
  const out = []
  const seen = new Set()
  for (const p of obj.properties) {
    if (!p.name && !ts.isShorthandPropertyAssignment(p)) continue
    const nm = p.name ? clip(p.name.getText(sf), 60) : null
    if (!nm || seen.has(nm)) continue
    seen.add(nm)
    const line = lineOf(sf, p.getStart(sf))
    const lines = lineOf(sf, p.end) - line + 1
    let innerKind = '반환 객체 속성'
    let type = null
    if (ts.isMethodDeclaration(p) || ts.isGetAccessorDeclaration(p) || ts.isSetAccessorDeclaration(p)) {
      innerKind = '반환 객체 메서드'
      type = sigOf(paramsOf(p, sf), p.type ? clip(p.type.getText(sf), 60) : null)
    } else if (ts.isPropertyAssignment(p)) {
      const init = unwrapExpr(p.initializer)
      if (init && (ts.isArrowFunction(init) || ts.isFunctionExpression(init))) {
        innerKind = '반환 객체 메서드'
        type = sigOf(paramsOf(init, sf), init.type ? clip(init.type.getText(sf), 60) : null)
      } else type = inferType(p.initializer, sf)
    } else if (ts.isShorthandPropertyAssignment(p)) {
      type = `= 안쪽의 ${nm}`
    }
    out.push({ id: nid(), name: nm, kind: 'inner', innerKind, type, line, lines, access: '반환' })
  }
  return out
}
function innerDecls(fnBody, sf) {
  const out = []
  if (!fnBody) return out
  // 화살표 함수가 객체를 바로 돌려주는 꼴: () => ({ ... })
  if (!ts.isBlock(fnBody)) {
    const e = unwrapExpr(fnBody)
    return e && ts.isObjectLiteralExpression(e) ? returnedObjectMembers(e, sf) : out
  }
  let returned = null
  for (const st of fnBody.statements) {
    if (!returned && ts.isReturnStatement(st) && st.expression) {
      const e = unwrapExpr(st.expression)
      if (e && ts.isObjectLiteralExpression(e)) returned = e
      continue
    }
    if (ts.isFunctionDeclaration(st) && st.name) {
      const params = paramsOf(st, sf)
      out.push({ id: nid(), name: st.name.text, kind: 'inner', innerKind: '내부 함수', type: sigOf(params, st.type ? clip(st.type.getText(sf), 60) : null), line: lineOf(sf, st.getStart(sf)), lines: lineOf(sf, st.end) - lineOf(sf, st.getStart(sf)) + 1, access: '지역' })
    } else if (ts.isVariableStatement(st)) {
      for (const d of st.declarationList.declarations) {
        const nm = ts.isIdentifier(d.name) ? d.name.text : clip(d.name.getText(sf), 60)
        const init = d.initializer ? unwrapExpr(d.initializer) : null
        let innerKind = '지역 값'
        let type = d.type ? clip(d.type.getText(sf), 80) : inferType(d.initializer, sf)
        if (init && ts.isCallExpression(init)) {
          const callee = init.expression.getText(sf).replace(/^React\./, '')
          if (HOOK_STATE.has(callee)) innerKind = '상태 훅'
          else if (HOOK_REF.has(callee)) innerKind = 'ref 훅'
          else if (HOOK_MEMO.has(callee)) innerKind = callee === 'useCallback' ? '콜백 훅' : '메모 훅'
          else if (/^use[A-Z]/.test(callee)) innerKind = '훅 호출'
        } else if (init && (ts.isArrowFunction(init) || ts.isFunctionExpression(init))) {
          innerKind = '내부 함수'
          type = sigOf(paramsOf(init, sf), init.type ? clip(init.type.getText(sf), 60) : null)
        }
        out.push({ id: nid(), name: nm, kind: 'inner', innerKind, type, line: lineOf(sf, d.getStart(sf)), lines: lineOf(sf, d.end) - lineOf(sf, d.getStart(sf)) + 1, access: '지역' })
      }
    } else if (ts.isExpressionStatement(st) && ts.isCallExpression(st.expression)) {
      const callee = st.expression.expression.getText(sf).replace(/^React\./, '')
      if (/^use[A-Z]/.test(callee)) {
        out.push({ id: nid(), name: callee, kind: 'inner', innerKind: callee === 'useEffect' || callee === 'useLayoutEffect' ? '효과 훅' : '훅 호출', type: null, line: lineOf(sf, st.getStart(sf)), lines: lineOf(sf, st.end) - lineOf(sf, st.getStart(sf)) + 1, access: '지역' })
      }
    }
  }
  if (returned) out.push(...returnedObjectMembers(returned, sf))
  return out
}

const COMPONENT_WRAPPERS = /^(React\.)?(memo|forwardRef|lazy)$/

// ───────── 파일 하나 분석 ─────────
function analyzeFile(rel) {
  const abs = path.join(SRC, rel)
  const text = fs.readFileSync(abs, 'utf8')
  const isTsx = rel.endsWith('.tsx')
  const sf = ts.createSourceFile(rel, text, ts.ScriptTarget.Latest, true, isTsx ? ts.ScriptKind.TSX : ts.ScriptKind.TS)
  const decls = []
  const imports = []
  let reExports = 0
  const exportedNames = new Set()
  let defaultExportName = null

  const push = (d) => decls.push(d)
  const common = (node, name) => ({
    id: nid(),
    name,
    line: lineOf(sf, node.getStart(sf)),
    lines: lineOf(sf, node.end) - lineOf(sf, node.getStart(sf)) + 1,
    exported: hasMod(node, ts.SyntaxKind.ExportKeyword),
    isDefault: hasMod(node, ts.SyntaxKind.DefaultKeyword),
    declare: hasMod(node, ts.SyntaxKind.DeclareKeyword),
    ...docOf(node, sf)
  })

  for (const st of sf.statements) {
    if (ts.isImportDeclaration(st)) {
      const spec = st.moduleSpecifier.text
      const ic = st.importClause
      const typeOnly = !!ic?.isTypeOnly || (ic?.namedBindings && ts.isNamedImports(ic.namedBindings) && ic.namedBindings.elements.length > 0 && ic.namedBindings.elements.every((e) => e.isTypeOnly) && !ic.name)
      const names = []
      if (ic?.name) names.push(ic.name.text)
      if (ic?.namedBindings) {
        if (ts.isNamespaceImport(ic.namedBindings)) names.push('* as ' + ic.namedBindings.name.text)
        else names.push(...ic.namedBindings.elements.map((e) => e.name.text))
      }
      imports.push({ spec, typeOnly: !!typeOnly, names, via: 'import' })
      continue
    }
    if (ts.isExportDeclaration(st)) {
      if (st.moduleSpecifier) {
        reExports++
        const names = st.exportClause && ts.isNamedExports(st.exportClause) ? st.exportClause.elements.map((e) => e.name.text) : ['*']
        imports.push({ spec: st.moduleSpecifier.text, typeOnly: !!st.isTypeOnly, names, via: 'reexport' })
      } else if (st.exportClause && ts.isNamedExports(st.exportClause)) {
        for (const e of st.exportClause.elements) exportedNames.add((e.propertyName ?? e.name).text)
      }
      continue
    }
    if (ts.isExportAssignment(st)) {
      if (ts.isIdentifier(st.expression)) defaultExportName = st.expression.text
      continue
    }
    if (ts.isClassDeclaration(st)) {
      const name = st.name?.text ?? '(default class)'
      const members = classMembers(st, sf)
      push({ ...common(st, name), kind: 'class', abstract: hasMod(st, ts.SyntaxKind.AbstractKeyword), ...heritage(st, sf), typeParams: st.typeParameters?.map((t) => t.getText(sf)) ?? [], children: members })
    } else if (ts.isInterfaceDeclaration(st)) {
      push({ ...common(st, st.name.text), kind: 'interface', ...heritage(st, sf), typeParams: st.typeParameters?.map((t) => t.getText(sf)) ?? [], children: typeMembers(st.members, sf) })
    } else if (ts.isTypeAliasDeclaration(st)) {
      const t = st.type
      let shape = 'alias'
      let children = []
      if (ts.isTypeLiteralNode(t)) {
        shape = 'object'
        children = typeMembers(t.members, sf)
      } else if (ts.isUnionTypeNode(t)) {
        shape = 'union'
        children = t.types.map((u) => ({ id: nid(), name: clip(u.getText(sf), 80), kind: 'variant', type: null, access: '-', line: lineOf(sf, u.getStart(sf)), lines: lineOf(sf, u.end) - lineOf(sf, u.getStart(sf)) + 1 }))
      } else if (ts.isIntersectionTypeNode(t)) {
        shape = 'intersection'
        for (const part of t.types) if (ts.isTypeLiteralNode(part)) children.push(...typeMembers(part.members, sf))
      } else if (ts.isFunctionTypeNode(t)) shape = 'function'
      else if (ts.isMappedTypeNode(t) || ts.isConditionalTypeNode(t)) shape = 'computed'
      push({ ...common(st, st.name.text), kind: 'type', shape, typeText: clip(t.getText(sf), 220), typeParams: st.typeParameters?.map((x) => x.getText(sf)) ?? [], children })
    } else if (ts.isEnumDeclaration(st)) {
      push({ ...common(st, st.name.text), kind: 'enum', const: hasMod(st, ts.SyntaxKind.ConstKeyword), children: st.members.map((m) => ({ id: nid(), name: memberName(m, sf), kind: 'enumMember', type: m.initializer ? clip(m.initializer.getText(sf), 60) : null, access: '-', line: lineOf(sf, m.getStart(sf)), lines: 1 })) })
    } else if (ts.isFunctionDeclaration(st)) {
      const name = st.name?.text ?? '(default function)'
      const params = paramsOf(st, sf)
      const ret = st.type ? clip(st.type.getText(sf), 100) : null
      const isAsync = hasMod(st, ts.SyntaxKind.AsyncKeyword)
      const isComp = isTsx && /^[A-Z]/.test(name) && st.body && containsJsx(st.body)
      const isHook = /^use[A-Z0-9]/.test(name)
      push({
        ...common(st, name),
        kind: isComp ? 'component' : 'function',
        hook: isHook,
        async: isAsync,
        generator: !!st.asteriskToken,
        params,
        returns: ret,
        signature: sigOf(params, ret, { async: isAsync }),
        propsType: isComp ? params[0]?.type ?? null : undefined,
        overload: !st.body,
        children: innerDecls(st.body, sf)
      })
    } else if (ts.isVariableStatement(st)) {
      const isConst = (st.declarationList.flags & ts.NodeFlags.Const) !== 0
      for (const d of st.declarationList.declarations) {
        const name = ts.isIdentifier(d.name) ? d.name.text : clip(d.name.getText(sf), 60)
        const c = { ...common(st, name), line: lineOf(sf, d.getStart(sf)), lines: lineOf(sf, d.end) - lineOf(sf, d.getStart(sf)) + 1 }
        const raw = d.initializer
        const init = raw ? unwrapExpr(raw) : null
        const asConst = raw && ts.isAsExpression(raw) && raw.type.getText(sf) === 'const'
        let valueKind = 'value'
        let extra = {}
        const declType = d.type ? clip(d.type.getText(sf), 120) : null
        if (init && (ts.isArrowFunction(init) || ts.isFunctionExpression(init))) {
          const params = paramsOf(init, sf)
          const ret = init.type ? clip(init.type.getText(sf), 100) : null
          const isAsync = hasMod(init, ts.SyntaxKind.AsyncKeyword)
          const isComp = isTsx && /^[A-Z]/.test(name) && containsJsx(init.body)
          valueKind = 'function'
          extra = {
            kind: isComp ? 'component' : 'function',
            arrow: ts.isArrowFunction(init),
            hook: /^use[A-Z0-9]/.test(name),
            async: isAsync,
            params,
            returns: ret,
            signature: sigOf(params, ret, { async: isAsync }),
            propsType: isComp ? params[0]?.type ?? (declType && /FC<(.+)>/.exec(declType)?.[1]) ?? null : undefined,
            children: innerDecls(init.body, sf)
          }
        } else if (init && ts.isCallExpression(init) && COMPONENT_WRAPPERS.test(init.expression.getText(sf)) && isTsx && /^[A-Z]/.test(name)) {
          const inner = init.arguments[0] ? unwrapExpr(init.arguments[0]) : null
          const params = inner && (ts.isArrowFunction(inner) || ts.isFunctionExpression(inner)) ? paramsOf(inner, sf) : []
          valueKind = 'function'
          extra = {
            kind: 'component',
            wrapper: init.expression.getText(sf),
            params,
            signature: `${init.expression.getText(sf)}(${sigOf(params, null)})`,
            propsType: params[0]?.type ?? (init.typeArguments ? clip(init.typeArguments.map((t) => t.getText(sf)).join(', '), 100) : null),
            children: inner && (ts.isArrowFunction(inner) || ts.isFunctionExpression(inner)) ? innerDecls(inner.body, sf) : []
          }
        } else if (init && ts.isObjectLiteralExpression(init)) {
          valueKind = 'object'
          extra = {
            kind: 'const',
            children: init.properties.map((p) => {
              const pn = p.name ? memberName(p, sf) : ts.isSpreadAssignment(p) ? '...' + clip(p.expression.getText(sf), 40) : '?'
              let pk = 'prop'
              let pt = null
              if (ts.isMethodDeclaration(p)) {
                pk = 'method'
                pt = sigOf(paramsOf(p, sf), p.type ? clip(p.type.getText(sf), 60) : null)
              } else if (ts.isPropertyAssignment(p)) {
                const v = unwrapExpr(p.initializer)
                if (ts.isArrowFunction(v) || ts.isFunctionExpression(v)) {
                  pk = 'method'
                  pt = sigOf(paramsOf(v, sf), v.type ? clip(v.type.getText(sf), 60) : null)
                } else pt = inferType(p.initializer, sf)
              } else if (ts.isShorthandPropertyAssignment(p)) pt = '(단축)'
              return { id: nid(), name: pn, kind: pk === 'method' ? 'objMethod' : 'objProp', type: pt, access: '-', line: lineOf(sf, p.getStart(sf)), lines: lineOf(sf, p.end) - lineOf(sf, p.getStart(sf)) + 1 }
            })
          }
        } else if (init && ts.isArrayLiteralExpression(init)) {
          valueKind = 'array'
          extra = { kind: 'const', length: init.elements.length }
        } else if (init && (ts.isStringLiteral(init) || ts.isNumericLiteral(init) || ts.isNoSubstitutionTemplateLiteral(init) || ts.isTemplateExpression(init) || init.kind === ts.SyntaxKind.TrueKeyword || init.kind === ts.SyntaxKind.FalseKeyword || (ts.isPrefixUnaryExpression(init) && ts.isNumericLiteral(init.operand)) || ts.isRegularExpressionLiteral(init))) {
          valueKind = 'primitive'
          extra = { kind: 'const' }
        } else if (init && ts.isCallExpression(init)) {
          const callee = clip(init.expression.getText(sf), 60)
          valueKind = /(^|\.)create\b|createStore|create\(|createContext/.test(callee) ? 'factory' : 'call'
          extra = { kind: 'const', callee }
        } else if (init && ts.isNewExpression(init)) {
          valueKind = 'instance'
          extra = { kind: 'const', callee: clip(init.expression.getText(sf), 60) }
        } else {
          extra = { kind: 'const' }
        }
        push({
          ...c,
          ...extra,
          varKind: isConst ? 'const' : st.declarationList.flags & ts.NodeFlags.Let ? 'let' : 'var',
          valueKind,
          asConst: !!asConst,
          declType,
          valueText: init && valueKind !== 'function' ? clip(raw.getText(sf), 140) : null,
          children: extra.children ?? []
        })
      }
    } else if (ts.isModuleDeclaration(st)) {
      push({ ...common(st, st.name.getText(sf)), kind: 'namespace', children: [] })
    }
  }

  // 나중에 export { a, b } / export default X 로 내보낸 것도 export로 표시
  for (const d of decls) {
    if (exportedNames.has(d.name)) d.exported = true
    if (defaultExportName === d.name) {
      d.exported = true
      d.isDefault = true
    }
  }

  // 동적 import('…') 수집
  const visit = (n) => {
    if (ts.isCallExpression(n) && n.expression.kind === ts.SyntaxKind.ImportKeyword && n.arguments[0] && ts.isStringLiteralLike(n.arguments[0])) {
      imports.push({ spec: n.arguments[0].text, typeOnly: false, names: [], via: 'dynamic' })
    }
    if (ts.isImportTypeNode?.(n) && ts.isLiteralTypeNode(n.argument) && ts.isStringLiteral(n.argument.literal)) {
      imports.push({ spec: n.argument.literal.text, typeOnly: true, names: [], via: 'import-type' })
    }
    ts.forEachChild(n, visit)
  }
  visit(sf)

  return { decls, imports, reExports, lines: sf.getLineAndCharacterOfPosition(sf.end).line + 1 + (text.endsWith('\n') ? -1 : 0) }
}

// ───────── import 경로 풀기 ─────────
function resolveSpec(fromRel, spec) {
  let base = null
  if (spec.startsWith('.')) base = path.posix.normalize(path.posix.join(path.posix.dirname(fromRel), spec))
  else {
    for (const [a, to] of Object.entries(ALIASES)) if (spec.startsWith(a)) base = to + spec.slice(a.length)
  }
  if (base == null) return { external: true }
  if (/\.(css|scss|svg|png|jpe?g|gif|json|md|woff2?)(\?.*)?$/.test(base)) return { external: false, asset: true, target: null }
  const cands = [base, base + '.ts', base + '.tsx', base + '.d.ts', base + '/index.ts', base + '/index.tsx']
  for (const c of cands) if (fileSet.has(c)) return { external: false, target: c }
  return { external: false, target: null, unresolved: base }
}

// ───────── 위치 분해: 프로세스 / 도메인 / 하위 폴더 ─────────
function locate(rel) {
  const proc = rel.split('/')[0]
  const root = PROC_ROOT[proc]
  const inner = rel.startsWith(root + '/') ? rel.slice(root.length + 1) : rel.slice(proc.length + 1)
  const parts = inner.split('/')
  const file = parts.pop()
  let domain = '(루트)'
  if (parts.length && /^\d\d_/.test(parts[0])) domain = parts.shift()
  else if (parts.length) domain = parts.shift()
  return { proc, domain, folders: parts, file, rootPrefix: rel.startsWith(root + '/') ? root : proc }
}

// ───────── 실행 ─────────
const fileInfo = {}
const root = { id: 'root', kind: 'root', name: 'AgentDeck 00_Source', children: [] }
const procNodes = {}
for (const p of PROCESSES) {
  procNodes[p] = { id: 'p_' + p, kind: 'process', name: p, path: PROC_ROOT[p], children: [] }
  root.children.push(procNodes[p])
}
const getChild = (parent, kind, name, extra = {}) => {
  let c = parent.children.find((x) => x.kind === kind && x.name === name)
  if (!c) {
    c = { id: nid(), kind, name, children: [], ...extra }
    parent.children.push(c)
  }
  return c
}

for (const rel of allFiles) {
  const loc = locate(rel)
  const a = analyzeFile(rel)
  const pnode = procNodes[loc.proc]
  if (!pnode) continue
  let parent = pnode
  if (loc.domain !== '(루트)') parent = getChild(pnode, 'domain', loc.domain, { path: `${loc.rootPrefix}/${loc.domain}` })
  let acc = loc.domain !== '(루트)' ? `${loc.rootPrefix}/${loc.domain}` : loc.rootPrefix
  for (const f of loc.folders) {
    acc += '/' + f
    parent = getChild(parent, 'folder', f, { path: acc })
  }
  const fnode = {
    id: nid(),
    kind: 'file',
    name: loc.file,
    path: rel,
    ext: path.extname(loc.file),
    lines: a.lines,
    reExports: a.reExports,
    children: a.decls
  }
  parent.children.push(fnode)
  fileInfo[rel] = { id: fnode.id, proc: loc.proc, domain: loc.domain, lines: a.lines, imports: [], importedBy: [], external: [] }
  fnode._imports = a.imports
}

// 폴더를 먼저, 그다음 파일(각각 이름순)
forEachNodeEarly(root)
function forEachNodeEarly(n) {
  if (['root', 'process', 'domain', 'folder'].includes(n.kind)) {
    const rank = (c) => (c.kind === 'domain' || c.kind === 'folder' ? 0 : 1)
    n.children.sort((x, y) => rank(x) - rank(y) || (x.kind === 'process' ? 0 : x.name < y.name ? -1 : x.name > y.name ? 1 : 0))
    n.children.forEach(forEachNodeEarly)
  }
}

// import 연결
const unresolved = []
const forEachNode = (n, fn, parent = null) => {
  fn(n, parent)
  for (const c of n.children ?? []) forEachNode(c, fn, n)
}
forEachNode(root, (n) => {
  if (n.kind !== 'file') return
  const fi = fileInfo[n.path]
  for (const imp of n._imports) {
    const r = resolveSpec(n.path, imp.spec)
    if (r.external) {
      const pkg = imp.spec.startsWith('@') ? imp.spec.split('/').slice(0, 2).join('/') : imp.spec.split('/')[0]
      if (!fi.external.includes(pkg)) fi.external.push(pkg)
    } else if (r.target) {
      const existing = fi.imports.find((x) => x.path === r.target)
      if (existing) {
        existing.names = [...new Set([...existing.names, ...imp.names])]
        existing.typeOnly = existing.typeOnly && imp.typeOnly
        if (!existing.via.includes(imp.via)) existing.via.push(imp.via)
        if (!existing.specs.includes(imp.spec)) existing.specs.push(imp.spec)
      } else fi.imports.push({ path: r.target, spec: imp.spec, specs: [imp.spec], names: imp.names, typeOnly: imp.typeOnly, via: [imp.via] })
    } else if (r.asset) {
      fi.assets ??= []
      fi.assets.push(imp.spec)
    } else unresolved.push({ from: n.path, spec: imp.spec })
  }
  delete n._imports
})
for (const [rel, fi] of Object.entries(fileInfo)) for (const imp of fi.imports) fileInfo[imp.path].importedBy.push({ path: rel, typeOnly: imp.typeOnly })

// 도메인 의존 행렬(전체 "proc/domain" 키)
const domKey = (fi) => `${fi.proc}/${fi.domain}`
const domainKeys = [...new Set(Object.values(fileInfo).map(domKey))].sort((x, y) => PROCESSES.indexOf(x.split('/')[0]) - PROCESSES.indexOf(y.split('/')[0]) || x.localeCompare(y))
const depMatrix = {}
const depMatrixRuntime = {}
const procMatrix = {}
const importSpecStyle = { '같은 도메인 안': {}, '다른 도메인으로': {} }
const importTypeOnly = {}
for (const [, fi] of Object.entries(fileInfo)) {
  const from = domKey(fi)
  for (const imp of fi.imports) {
    const toFi = fileInfo[imp.path]
    const to = domKey(toFi)
    if (fi.proc !== toFi.proc) {
      procMatrix[fi.proc] ??= {}
      procMatrix[fi.proc][toFi.proc] = (procMatrix[fi.proc][toFi.proc] ?? 0) + 1
    }
    const specKind = imp.spec.startsWith('@') ? '별칭(@main/·@shared/·@renderer/)' : '상대 경로(./ ../)'
    bump(importSpecStyle[from === to ? '같은 도메인 안' : '다른 도메인으로'], specKind)
    bump(importTypeOnly, imp.typeOnly ? 'import type 만' : '값 import 포함')
    if (from === to) continue
    depMatrix[from] ??= {}
    depMatrix[from][to] = (depMatrix[from][to] ?? 0) + 1
    if (!imp.typeOnly) {
      depMatrixRuntime[from] ??= {}
      depMatrixRuntime[from][to] = (depMatrixRuntime[from][to] ?? 0) + 1
    }
  }
}

// ───────── 통계·컨벤션 ─────────
const counts = { process: 0, domain: 0, folder: 0, file: 0, class: 0, interface: 0, type: 0, enum: 0, function: 0, component: 0, hook: 0, const: 0, namespace: 0, field: 0, method: 0 }
const nameStats = {} // 선언 종류 → 이름 꼴 → 수
const deviations = []
const privateStyle = {} // 분류 → 수
const privateExamples = {}
const memberNameStats = {}
const fileNameStats = { '.ts': {}, '.tsx': {} }
const fileNameDeviations = []
const perFile = []
const domainStats = {}

const underscoreModule = []
const docStyle = {}
const memberDocStyle = {}
const exportStyle = {}
const fnForm = {}
const typeForm = {}
const addDev = (d) => deviations.push(d)

function expectedFor(d) {
  switch (d.kind) {
    case 'class':
    case 'interface':
    case 'type':
    case 'enum':
    case 'component':
      return ['PascalCase']
    case 'function':
      return ['camelCase', 'lowercase']
    case 'const':
      if (d.varKind !== 'const') return null // 모듈 수준 let 상태는 분포만 본다
      if (d.valueKind === 'primitive' || ((d.valueKind === 'object' || d.valueKind === 'array') && d.asConst)) return ['UPPER_SNAKE']
      if (d.valueKind === 'factory' && /^use[A-Z]/.test(d.name)) return ['camelCase']
      return null // 객체·호출 결과는 규칙을 강제하지 않고 분포만 본다
    default:
      return null
  }
}

forEachNode(root, (n, parent) => {
  if (n.kind in counts && !['function', 'process', 'domain'].includes(n.kind)) bump(counts, n.kind)
  if (n.kind === 'function') bump(counts, 'function')
  if ((n.kind === 'function' || n.kind === 'component') && n.hook) bump(counts, 'hook')
  if (n.kind === 'file') {
    const base = n.name.replace(/\.(d\.)?tsx?$/, '')
    const st = nameStyle(base).style
    bump(fileNameStats[n.ext] ?? (fileNameStats[n.ext] = {}), st)
    const fi = fileInfo[n.path]
    const k = `${fi.proc}/${fi.domain}`
    domainStats[k] ??= { files: 0, lines: 0, decls: 0, classes: 0, components: 0, functions: 0, types: 0, consts: 0 }
    const ds = domainStats[k]
    ds.files++
    ds.lines += n.lines
    ds.decls += n.children.length
    for (const d of n.children) {
      if (d.kind === 'class') ds.classes++
      else if (d.kind === 'component') ds.components++
      else if (d.kind === 'function') ds.functions++
      else if (d.kind === 'interface' || d.kind === 'type') ds.types++
      else if (d.kind === 'const') ds.consts++
    }
    perFile.push({ path: n.path, lines: n.lines, decls: n.children.length, exported: n.children.filter((d) => d.exported).length })
    // 파일 이름 기대 꼴: 컴포넌트를 default/주 export로 가진 .tsx → PascalCase, 그 외 .ts → camelCase
    if (base !== 'index' && base !== 'env') {
      const hasComp = n.children.some((d) => d.kind === 'component' && d.exported)
      const exportedClass = n.children.find((d) => d.kind === 'class' && d.exported)
      let expect = null
      if (n.ext === '.tsx' && hasComp) expect = 'PascalCase'
      else if (exportedClass && exportedClass.name === base) expect = 'PascalCase'
      else if (n.ext === '.ts') expect = 'camelCase'
      const ok = expect == null || st === expect || (expect === 'camelCase' && st === 'lowercase')
      if (!ok) fileNameDeviations.push({ path: n.path, style: st, expected: expect, id: n.id, reason: exportedClass ? `export 클래스 ${exportedClass.name}` : hasComp ? '컴포넌트 파일' : '.ts 모듈' })
    }
  }
  if (parent && parent.kind === 'file') {
    const { style, prefix } = nameStyle(n.name)
    const k = n.kind === 'const' ? `${n.varKind}(${n.valueKind}${n.asConst ? ', as const' : ''})` : n.kind === 'function' && n.hook ? 'hook' : n.kind
    nameStats[k] ??= {}
    bump(nameStats[k], style)
    const exp = expectedFor(n)
    if (prefix === '_') {
      // 모듈 수준 _ 접두: 파일 안에서만 쓰는 상태(let)·타입 단언용 상수 등. 규칙 위반으로 보지 않고 따로 모은다.
      const why = n.varKind === 'let' ? '모듈 상태(let)' : n.declType && n.valueText === 'true' ? '컴파일 타임 타입 단언' : n.kind
      underscoreModule.push({ id: n.id, name: n.name, kind: k, why, exported: n.exported, path: parent.path, line: n.line })
    } else if (exp && !exp.includes(style)) addDev({ id: n.id, name: n.name, kind: k, style, expected: exp[0], path: parent.path, line: n.line })
    // 주석 방식(최상위 선언)
    bump(docStyle, n.docKind ?? 'none')
    // export 방식
    if (n.exported) bump(exportStyle, n.isDefault ? 'default' : 'named')
    // 함수 정의 형태
    if (n.kind === 'function' || n.kind === 'component') bump(fnForm, `${n.kind === 'component' ? '컴포넌트' : n.hook ? '훅' : '함수'} · ${n.varKind ? (n.wrapper ? n.wrapper + '(…)' : 'const 화살표') : 'function 선언'}`)
    if (n.kind === 'interface') bump(typeForm, 'interface')
    if (n.kind === 'type') bump(typeForm, `type (${n.shape})`)
  }
  if (parent && parent.kind === 'class') bump(memberDocStyle, n.docKind ?? 'none')
  if (parent && parent.kind === 'class' && n.kind !== 'ctor' && n.kind !== 'index' && n.kind !== 'staticBlock') {
    const { style, prefix } = nameStyle(n.name)
    const mk = n.kind === 'field' ? (n.fieldFn ? '필드(함수값)' : '필드') : n.kind === 'method' ? '메서드' : n.kind === 'getter' || n.kind === 'setter' ? '접근자' : n.kind
    memberNameStats[mk] ??= {}
    bump(memberNameStats[mk], (n.static && style === 'UPPER_SNAKE' ? 'static ' : '') + style)
    if (n.kind === 'field') bump(counts, 'field')
    if (n.kind === 'method') bump(counts, 'method')
    let cat
    if (n.access === '#private') cat = '# (ES private)'
    else if (n.access === 'private' && prefix === '_') cat = 'private 키워드 + _ 접두'
    else if (n.access === 'private') cat = 'private 키워드만'
    else if (n.access === 'protected' && prefix === '_') cat = 'protected + _ 접두'
    else if (n.access === 'protected') cat = 'protected'
    else if (prefix === '_') cat = '_ 접두만 (키워드 없음)'
    else cat = n.access === 'public' ? 'public 명시' : 'public(기본)'
    bump(privateStyle, cat)
    privateExamples[cat] ??= []
    if (privateExamples[cat].length < 12) privateExamples[cat].push({ id: n.id, label: `${parent.name}.${n.name}`, kind: n.kind })
  }
})

// 파일당 줄 수·선언 수 분포
const bucket = (v, edges) => {
  for (let i = 0; i < edges.length; i++) if (v <= edges[i]) return i
  return edges.length
}
const lineEdges = [50, 100, 200, 300, 500, 800]
const declEdges = [1, 3, 5, 10, 20]
const lineHist = Array(lineEdges.length + 1).fill(0)
const declHist = Array(declEdges.length + 1).fill(0)
for (const f of perFile) {
  lineHist[bucket(f.lines, lineEdges)]++
  declHist[bucket(f.decls, declEdges)]++
}
const sortedLines = perFile.map((f) => f.lines).sort((a, b) => a - b)
const median = (arr) => (arr.length ? arr[Math.floor(arr.length / 2)] : 0)

// 프로세스·도메인 수
forEachNode(root, (n) => {
  if (n.kind === 'process') counts.process++
})
counts.domain = Object.keys(domainStats).filter((k) => !k.endsWith('/(루트)')).length

// 큰 클래스·큰 컴포넌트 상위
const topDecls = []
forEachNode(root, (n, parent) => {
  if (parent && parent.kind === 'file' && ['class', 'component', 'function'].includes(n.kind)) topDecls.push({ id: n.id, name: n.name, kind: n.kind, lines: n.lines, members: n.children.length, path: parent.path })
})
topDecls.sort((a, b) => b.lines - a.lines)

// ───────── 손으로 쓴 설명·투어·컨벤션 예시 합치기 ─────────
const warnings = []
const readJson = (p) => (fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf8')) : null)
const nodeKeyOf = (n) => (n.kind === 'process' ? n.name : n.path)
const descriptions = readJson(path.resolve(arg('--desc', 'descriptions.json'))) ?? {}
let descUsed = 0
const treeKeys = new Set()
forEachNode(root, (n) => {
  const key = nodeKeyOf(n)
  if (key) treeKeys.add(key)
  if (key && descriptions[key]) {
    n.desc = descriptions[key]
    descUsed++
  }
})
for (const k of Object.keys(descriptions)) if (!k.startsWith('_') && !treeKeys.has(k)) warnings.push(`설명 키를 트리에서 찾지 못함: ${k}`)
const srcCache = new Map()
const srcLines = (rel) => {
  if (!srcCache.has(rel)) srcCache.set(rel, fs.readFileSync(path.join(SRC, rel), 'utf8').split(/\r?\n/))
  return srcCache.get(rel)
}
const fileNodeByPath = new Map()
forEachNode(root, (n) => {
  if (n.kind === 'file') fileNodeByPath.set(n.path, n)
})
// 코드 조각은 줄 번호가 아니라 anchor 글자로 찾는다(소스가 바뀌어도 다시 찾게)
function resolveSnippet(sn, where) {
  if (!fileSet.has(sn.file)) {
    warnings.push(`${where}: 파일 없음 ${sn.file}`)
    return { ...sn, missing: true }
  }
  const lines = srcLines(sn.file)
  const hits = []
  lines.forEach((l, i) => {
    if (l.includes(sn.anchor)) hits.push(i)
  })
  if (!hits.length) {
    warnings.push(`${where}: anchor를 찾지 못함 — ${sn.file}: ${sn.anchor}`)
    return { ...sn, missing: true }
  }
  if (hits.length > 1) warnings.push(`${where}: anchor가 ${hits.length}번 나옴, 첫 번째를 씀 — ${sn.file}: ${sn.anchor}`)
  const start = Math.max(0, hits[0] - (sn.offset ?? 0))
  const end = Math.min(lines.length - 1, start + (sn.lines ?? 10) - 1)
  return { file: sn.file, start: start + 1, end: end + 1, text: lines.slice(start, end + 1).join('\n') }
}
function checkNode(key, where) {
  if (!key) return
  const [file, decl] = key.split('::')
  const f = fileNodeByPath.get(file)
  if (!f || (decl && !f.children.some((d) => d.name === decl))) warnings.push(`${where}: 노드 없음 ${key}`)
}
const guideRaw = readJson(path.resolve(arg('--guide', 'guide.json')))
let guide = null
if (guideRaw) {
  guide = {
    tour: {
      ...guideRaw.tour,
      stops: guideRaw.tour.stops.map((st, i) => {
        checkNode(st.node, `투어 ${i + 1}`)
        return { ...st, snippets: st.snippets.map((sn) => resolveSnippet(sn, `투어 ${i + 1}`)) }
      })
    },
    conventions: guideRaw.conventions.map((c, i) => {
      checkNode(c.node, `컨벤션 ${i + 1}`)
      return { ...c, snippets: c.snippets.map((sn) => resolveSnippet(sn, `컨벤션 ${i + 1}`)) }
    })
  }
}

// ───────── 관찰: 한 파일 안에 성격이 다른 것이 섞인 곳 ─────────
// 규칙 위반이 아니라 「읽을 때 헷갈릴 수 있는 곳」을 모은다. 판정은 최상위 선언의 종류와 소스 순서만 본다.
const isTypeDecl = (c) => ['interface', 'type', 'enum', 'namespace'].includes(c.kind)
const mixing = { interleave: [], uiLogic: [], uiHook: [], uiState: [], stateHook: [] }
forEachNode(root, (f) => {
  if (f.kind !== 'file') return
  const ds = [...f.children].sort((a, b) => a.line - b.line)
  const ref = (c) => ({ name: c.name, line: c.line })
  // 1) 타입과 로직이 번갈아 나온다: 로직(함수·상수 등) 뒤에 타입이 나오고, 그 뒤에 다시 로직이 있다.
  //    바로 다음 선언의 props·state 타입(XProps·XState)을 그 앞에 두는 것은 흔한 관례라 뺀다.
  const colocated = new Set()
  ds.forEach((c, i) => {
    const nx = ds[i + 1]
    if (isTypeDecl(c) && nx && !isTypeDecl(nx) && (c.name === nx.name + 'Props' || c.name === nx.name + 'State')) colocated.add(c)
  })
  let seenLogic = false
  const mid = []
  ds.forEach((c, i) => {
    if (!isTypeDecl(c)) { seenLogic = true; return }
    if (colocated.has(c)) return
    if (seenLogic && ds.slice(i + 1).some((x) => !isTypeDecl(x))) mid.push(ref(c))
  })
  if (mid.length) mixing.interleave.push({ path: f.path, id: f.id, count: mid.length, decls: mid.length, total: ds.length, items: mid })
  const comps = ds.filter((c) => c.kind === 'component')
  const hooks = ds.filter((c) => c.kind === 'function' && c.hook)
  if (comps.length) {
    // 2) 화면(컴포넌트) 파일이 일반 로직 함수도 export한다
    const logic = ds.filter((c) => c.exported && c.kind === 'function' && !c.hook)
    if (logic.length) mixing.uiLogic.push({ path: f.path, id: f.id, items: logic.map(ref), comps: comps.length })
    // 3) 화면 파일에 훅 정의가 같이 있다
    if (hooks.length) mixing.uiHook.push({ path: f.path, id: f.id, items: hooks.map(ref), comps: comps.length })
    // 4) 화면 파일 안에 모듈 수준 상태가 있다: let 변수, 스토어·컨텍스트 생성, 에디터 상태 정의(StateField 등)
    const st = ds.filter((c) => c.kind === 'const' && (c.varKind === 'let' || /^(create|createStore|createContext)$|^State(Field|Effect)\.define$/.test(c.callee ?? '')))
    if (st.length) mixing.uiState.push({ path: f.path, id: f.id, items: st.map((c) => ({ ...ref(c), how: c.varKind === 'let' ? 'let' : c.callee })), comps: comps.length })
  }
  // 5) 상태 폴더(state/)의 파일에 React 훅이 있다 — 상태 규칙과 React 연결이 한 파일에 있다
  if (/\/state\//.test(f.path) && hooks.length) mixing.stateHook.push({ path: f.path, id: f.id, items: hooks.map(ref) })
})
mixing.interleave.sort((a, b) => b.count - a.count || a.path.localeCompare(b.path))

const out = {
  meta: {
    generatedAt: new Date().toISOString(),
    source: SRC.split(path.sep).join('/'),
    tsVersion: ts.version,
    files: allFiles.length,
    totalLines: perFile.reduce((s, f) => s + f.lines, 0),
    rulesSource: '저장소 문서(CLAUDE.md·AGENTS.md·00_Documents)에 코드 이름 규칙이 명문화돼 있지 않아, 일반 TypeScript·React 관례로 기대 꼴을 추론했다.'
  },
  tree: root,
  files: fileInfo,
  domains: domainKeys,
  depMatrix,
  depMatrixRuntime,
  procMatrix,
  domainStats,
  counts,
  conventions: {
    underscoreModule,
    docStyle,
    memberDocStyle,
    exportStyle,
    fnForm,
    typeForm,
    importSpecStyle,
    importTypeOnly,
    nameStats,
    memberNameStats,
    deviations,
    fileNameStats,
    fileNameDeviations,
    privateStyle,
    privateExamples,
    lineHist: { edges: lineEdges, counts: lineHist },
    declHist: { edges: declEdges, counts: declHist },
    medianLines: median(sortedLines),
    maxLines: sortedLines.at(-1) ?? 0,
    biggestFiles: [...perFile].sort((a, b) => b.lines - a.lines).slice(0, 15).map((f) => ({ ...f, id: fileInfo[f.path].id })),
    biggestDecls: topDecls.slice(0, 15),
    mixing
  },
  unresolved,
  guide,
  warnings
}
fs.writeFileSync(OUT, JSON.stringify(out))
console.log(`codemap.json 작성: 파일 ${allFiles.length}, 노드 id ${idSeq}`)
console.log(JSON.stringify(counts))
if (unresolved.length) console.log('풀지 못한 import', unresolved.length, unresolved.slice(0, 10))
console.log(`섞임 관찰: 타입·로직 번갈아 ${mixing.interleave.length}, 화면+로직 export ${mixing.uiLogic.length}, 화면+훅 ${mixing.uiHook.length}, 화면+모듈 상태 ${mixing.uiState.length}, state/+훅 ${mixing.stateHook.length}`)
console.log(`설명 ${descUsed}개 연결, 투어 정거장 ${guide?.tour.stops.length ?? 0}, 컨벤션 예시 ${guide?.conventions.length ?? 0}`)
if (warnings.length) {
  console.log('경고:')
  for (const w of warnings) console.log('  ' + w)
}
