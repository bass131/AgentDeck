/**
 * ProviderBrandIcon.tsx — provider→브랜드 descriptor(lib/providerBrand.ts)를 실제
 * 아이콘 슬롯에 그리는 공통 렌더 컴포넌트 (TG1 P09).
 *
 * 매핑 모듈은 순수 descriptor만 반환하므로(JSX 0), "그냥 벡터 아이콘 하나가 들어가는
 * 자리"(SettingsModal 엔진 탭·현재 엔진 카드, GitModal AI 커밋 버튼처럼 .ava 같은
 * 조건부 wrapper 클래스가 필요 없는 슬롯)를 대신 그리는 게 이 컴포넌트의 역할이다.
 *
 * 대화 아바타(Conversation.tsx 턴 헤더·PanelView.tsx 턴 헤더·MessageBubble.tsx 공유
 * 리프)는 브랜드 로고 여부에 따라 바깥 <span> wrapper의 className이 달라져야 해서
 * (.ava-spark 수식어 유무) 이 컴포넌트를 쓰지 않고 getProviderBrand()를 직접 호출한다
 * — 이 컴포넌트는 그런 조건부 wrapper가 필요 없는 "단순 아이콘 슬롯" 전용이다.
 *
 * provider 미지정 시 기본값 'claude-code' — Track 1 라이브 소비처는 전부 이 기본값만
 * 쓴다('codex'는 dormant, 단위 테스트로만 exercise).
 */
import type { JSX } from 'react'
import { getProviderBrand } from '../../lib/providerBrand'
import { getTheme } from '../../lib/theme'
import { IconClaude, type IconProps } from './icons'

export interface ProviderBrandIconProps extends IconProps {
  /** 엔진 식별자 — 미지정 시 'claude-code'. */
  provider?: string
}

export function ProviderBrandIcon({ provider = 'claude-code', size, ...rest }: ProviderBrandIconProps): JSX.Element {
  const brand = getProviderBrand(provider, getTheme())
  if (brand.kind === 'logo') {
    const px = size ?? 18
    return <img src={brand.src} alt={brand.alt} width={px} height={px} aria-hidden="true" />
  }
  return <IconClaude size={size} {...rest} />
}
