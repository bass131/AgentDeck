// codemap.json + 소스 원문 + codemap.template.html → codemap.html (데이터 내장, 오프라인)
import fs from 'node:fs'
import path from 'node:path'
import zlib from 'node:zlib'

const data = fs.readFileSync('codemap.json', 'utf8')
const tpl = fs.readFileSync('codemap.template.html', 'utf8')
const MARK = '/*__CODEMAP_DATA__*/null'
const SRC_MARK = '/*__SOURCES_GZ__*/""'
for (const m of [MARK, SRC_MARK]) if (!tpl.includes(m)) throw new Error(`템플릿에 자리표시 ${m}가 없다`)

// </script> 와 U+2028/2029가 인라인 스크립트를 끊지 않게 JSON 문자열 이스케이프로 바꾼다
const BS = String.fromCharCode(92) // 역슬래시
const safe = data
  .replace(/</g, BS + 'u003c')
  .replace(new RegExp(String.fromCharCode(0x2028), 'g'), BS + 'u2028')
  .replace(new RegExp(String.fromCharCode(0x2029), 'g'), BS + 'u2029')

// 소스 원문: { 경로: 내용 } JSON을 gzip → base64로 내장한다. 브라우저가 DecompressionStream으로 푼다.
const parsed = JSON.parse(data)
const files = Object.keys(parsed.files)
const sources = {}
let rawBytes = 0
for (const rel of files) {
  const text = fs.readFileSync(path.join(parsed.meta.source, rel), 'utf8')
  rawBytes += Buffer.byteLength(text)
  sources[rel] = text
}
const gz = zlib.gzipSync(Buffer.from(JSON.stringify(sources)), { level: 9 })
const b64 = gz.toString('base64')

const html = tpl.replace(MARK, () => safe).replace(SRC_MARK, () => JSON.stringify(b64))
fs.writeFileSync('codemap.html', html)
const kb = (n) => (n / 1024).toFixed(0) + ' KB'
console.log(`소스 ${files.length}개 원문 ${kb(rawBytes)} → gzip ${kb(gz.length)} → base64 ${kb(b64.length)}`)
console.log(`codemap.html 작성: ${kb(Buffer.byteLength(html))}`)
