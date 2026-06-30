/**
 * SlashPalette.tsx — 슬래시 커맨드 팔레트 하위 컴포넌트.
 *
 * Composer.tsx Phase 14 분해: 슬래시 커맨드 메뉴 JSX 추출.
 * P10: 빌트인 커맨드 아이콘 매핑 + 커스텀 커맨드 scope 배지.
 * UI.md: 색은 상태 전달에만. 인라인 색상 0.
 */
import { type JSX } from 'react'
import type { ComponentType } from 'react'
import {
  IconBolt,
  IconFileText,
  IconRefresh,
  IconCompress,
  IconEye,
  IconShieldChk,
  IconBook,
} from '../common/icons'
import type { IconProps } from '../common/icons'
import type { SlashCommandInfo, SkillInfo } from '../../../../shared/ipc-contract'

// ── 빌트인 커맨드 아이콘 매핑 ─────────────────────────────────────────────────
// SlashCommandInfo에 icon 필드 없으므로 name 기반 룩업 + 기본 아이콘 fallback.

const BUILTIN_CMD_ICONS: Record<string, ComponentType<IconProps>> = {
  ask:              IconBolt,
  init:             IconFileText,
  clear:            IconRefresh,
  compact:          IconCompress,
  review:           IconEye,
  'security-review': IconShieldChk,
  help:             IconBook,
}

function slashIcon(name: string): ComponentType<IconProps> {
  return BUILTIN_CMD_ICONS[name] ?? IconBolt
}

interface SlashPaletteProps {
  slashOpen: boolean
  cmdHits: SlashCommandInfo[]
  skillHits: SkillInfo[]
  safeSlashIdx: number
  setSlashIdx: (i: number) => void
  pickSlash: (name: string) => void
}

export function SlashPalette({
  slashOpen,
  cmdHits,
  skillHits,
  safeSlashIdx,
  setSlashIdx,
  pickSlash,
}: SlashPaletteProps): JSX.Element | null {
  if (!slashOpen) return null

  return (
    <div className="slash-menu scroll" role="listbox">
      {cmdHits.length > 0 && <div className="slash-sec">명령어</div>}
      {cmdHits.map((c, i) => {
        const Ic = slashIcon(c.name)
        const isCustom = c.scope === 'user' || c.scope === 'project'
        return (
          <button
            key={'cmd:' + c.scope + ':' + c.name}
            type="button"
            role="option"
            aria-selected={i === safeSlashIdx}
            className={'slash-opt' + (i === safeSlashIdx ? ' on' : '')}
            onMouseEnter={() => setSlashIdx(i)}
            onMouseDown={(e) => {
              e.preventDefault()
              pickSlash(c.name)
            }}
          >
            <span className="slash-ic">
              <Ic size={15} />
            </span>
            <span className="slash-name">{c.name}</span>
            {c.argHint && <span className="slash-arg-hint">{c.argHint}</span>}
            {isCustom && <span className="slash-scope-badge">{c.scope}</span>}
            <span className="slash-desc">{c.description}</span>
          </button>
        )
      })}
      {skillHits.length > 0 && <div className="slash-sec">스킬</div>}
      {skillHits.map((s, i) => {
        const gi = cmdHits.length + i
        return (
          <button
            key={'skill:' + s.scope + ':' + s.name}
            type="button"
            role="option"
            aria-selected={gi === safeSlashIdx}
            className={'slash-opt' + (gi === safeSlashIdx ? ' on' : '')}
            onMouseEnter={() => setSlashIdx(gi)}
            onMouseDown={(e) => {
              e.preventDefault()
              pickSlash(s.name)
            }}
          >
            <span className="slash-ic skill">
              <IconBook size={15} />
            </span>
            <span className="slash-name">{s.name}</span>
            <span className="slash-desc">{s.description ?? '설명이 없습니다.'}</span>
          </button>
        )
      })}
    </div>
  )
}
