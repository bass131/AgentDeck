/**
 * attachments.ts — 붙여넣기/드롭 이미지 저장 순수 모듈
 *
 * CRITICAL (헌법 신뢰경계):
 *   - fs 쓰기는 main 단독. renderer는 경로를 지정하지 않는다.
 *   - main이 파일명(paste-{uuid}.{ext})을 생성하고 앱 전용 attachments 디렉토리에만 기록.
 *   - ext는 untrusted → 이미지 화이트리스트로 검증, 위험문자 제거(파일명 주입 차단).
 *   - 미지 ext → '.png' 대체.
 *
 * 원본 AgentCodeGUI index.ts 564-569 로직 미러.
 */

import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'

/**
 * 지원하는 이미지 확장자 → MIME 타입 매핑.
 * 원본 AgentCodeGUI IMG_EXTS(index.ts 28-38) 1:1 미러.
 */
export const IMAGE_EXTS: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.bmp': 'image/bmp',
  '.svg': 'image/svg+xml',
  '.avif': 'image/avif',
  '.ico': 'image/x-icon',
}

/**
 * ext 힌트를 안전한 확장자('.png' 등)로 정규화.
 *
 * 정규화 단계 (원본 index.ts 565-566 미러):
 *   1) 선두 점(.) 다중 제거 후 소문자 변환.
 *   2) '.' + 정제값 → 이미지 외 허용 문자([^.a-z0-9]) 제거.
 *      이 단계에서 경로 구분자('/', '\')·공백·'..'·특수문자가 모두 탈락.
 *   3) IMAGE_EXTS 화이트리스트 검사 → 미지이면 '.png' 대체.
 *
 * 화이트리스트 외 / 위험문자 포함 → '.png'.
 */
export function safeImageExt(ext: string): string {
  // 원본 정규화: '.' + strip leading dots + lowercase, then strip non-[.a-z0-9]
  const normalized = ('.' + String(ext || 'png').replace(/^\.+/, '').toLowerCase()).replace(
    /[^.a-z0-9]/g,
    ''
  )
  return normalized in IMAGE_EXTS ? normalized : '.png'
}

/**
 * bytes를 dir에 paste-{uuid}{ext}로 기록하고 절대 경로 반환.
 *
 * @param dir   저장 디렉토리 절대 경로. 호출자(IPC 핸들러)가 앱 전용 경로임을 보장한다.
 *              미존재 시 자동 생성(recursive:true).
 * @param bytes 이미지 raw 바이트 (ArrayBuffer 또는 Buffer)
 * @param ext   확장자 힌트 (untrusted) — safeImageExt로 정규화됨.
 * @returns     저장된 파일의 절대 경로
 */
export async function saveImageBytes(
  dir: string,
  bytes: ArrayBuffer | Buffer,
  ext: string
): Promise<string> {
  await mkdir(dir, { recursive: true })
  const safeExt = safeImageExt(ext)
  const filename = `paste-${randomUUID()}${safeExt}`
  const abs = join(dir, filename)
  const buf = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes as ArrayBuffer)
  await writeFile(abs, buf)
  return abs
}
