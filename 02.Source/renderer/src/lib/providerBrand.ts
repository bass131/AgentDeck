/**
 * providerBrand.ts — provider(엔진)→브랜드 로고 단일 매핑 (TG1 P09).
 *
 * 배경: Welcome 히어로·SettingsModal 엔진 탭/현재 엔진 카드·GitModal AI 커밋 버튼·
 * 대화 아바타(Conversation.tsx 턴 헤더·PanelView.tsx 턴 헤더·MessageBubble.tsx 공유
 * 리프)에 "provider → 어떤 로고" 하드코딩 분기가 각각 흩어져 있었다(P06 reviewer 🟡
 * "엔진-아바타 이중 소스" 지적). 이 모듈이 그 분기를 한 곳으로 수렴한다(SSOT).
 *
 * 설계 원칙(01.Phases/18_TG1-thinking-gui/09-provider-brand-logos.md 설계 지침):
 *   - 이 모듈은 순수 함수 + descriptor 반환만 한다. JSX 렌더는 소비처(또는 공통 렌더
 *     컴포넌트 ProviderBrandIcon.tsx)가 담당 — 여기서 <img>/아이콘을 만들지 않는다.
 *   - Claude Spark(Clay 단색)는 테마 무관 공용 — provider가 'claude-code'면 theme
 *     인자와 무관하게 항상 같은 에셋.
 *   - OpenAI Blossom은 브랜드 가이드라인상 재채색 금지("DON'T add any colors") —
 *     다크/라이트 대응은 공식 Black(라이트 배경용)/White(다크 배경용) 두 변형을
 *     테마별로 스왑하는 방식만 허용된다(SOURCE.md 고지).
 *   - 미지·미래 provider는 fallback(로고 없음) — 매핑에 없는 값에 남의 로고를
 *     잘못 붙이지 않기 위한 안전장치(폴백 설계). 소비처가 기존 자체 아이콘
 *     (IconClaude류)을 그대로 그린다.
 *
 * TG1 P09 스코프: Codex('codex') 분기는 **dormant**다 — Track 1 라이브 소비처는
 * 전부 'claude-code'만 넘기므로 이 분기는 실제로 타지 않고 단위 테스트로만
 * exercise된다(Track 2 X1 전환 UI가 붙기 전까지).
 */
import type { Theme } from './theme'
import claudeSparkClay from '../assets/brand/claude-spark-clay.svg'
import openaiBlossomBlack from '../assets/brand/openai-blossom-black.svg'
import openaiBlossomWhite from '../assets/brand/openai-blossom-white.svg'

/** 공식 로고 에셋이 있는 provider descriptor. */
export interface ProviderBrandLogo {
  kind: 'logo'
  /** import된 에셋 URL(Vite 정적 자산 처리) — 그대로 <img src>에 사용. */
  src: string
  /** 장식용 로고 — 호출부가 이미 aria-hidden 래퍼를 두르는 기존 관례상 항상 빈 문자열. */
  alt: string
  /** 사람이 읽는 표시 이름(엔진 라벨 등에 사용). */
  displayName: string
}

/** 매핑에 없는(미지/미래) provider — 로고 없음, 소비처가 자체 폴백 아이콘을 그린다. */
export interface ProviderBrandFallback {
  kind: 'fallback'
  /** 사람이 읽는 표시 이름 — 매핑이 없어도 provider 원문 그대로 보존. */
  displayName: string
}

export type ProviderBrandDescriptor = ProviderBrandLogo | ProviderBrandFallback

/**
 * provider 식별자 + 현재 테마 → 브랜드 descriptor.
 *
 * @param providerId 엔진 식별자. 알려진 값 = 'claude-code' | 'codex'(shared BackendId와
 *   문자열 그대로 일치 — 타입은 string으로 넓게 받아 미지 값도 안전하게 폴백시킨다).
 * @param theme 현재 앱 테마(lib/theme.ts Theme) — OpenAI Blossom 변형 선택에만 쓰인다.
 */
export function getProviderBrand(providerId: string, theme: Theme): ProviderBrandDescriptor {
  if (providerId === 'claude-code') {
    return { kind: 'logo', src: claudeSparkClay, alt: '', displayName: 'Claude' }
  }
  if (providerId === 'codex') {
    const src = theme === 'dark' ? openaiBlossomWhite : openaiBlossomBlack
    return { kind: 'logo', src, alt: '', displayName: 'Codex' }
  }
  return { kind: 'fallback', displayName: providerId }
}
