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
import type { SlashCommandInfo, SkillInfo } from '../../../../shared/ipcContract'

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
