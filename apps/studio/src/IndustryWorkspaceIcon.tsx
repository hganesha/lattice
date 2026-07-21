import type { ComponentType, SVGProps } from 'react'
import {
  IconBuilding,
  IconFactory,
  IconHeartPulse,
  IconLandmark,
  IconNetwork,
  IconScale,
  IconUmbrella,
  IconZap,
} from './icons'

interface IndustryWorkspaceIconProps {
  domain: string | undefined
}

const industryIcons: Record<string, ComponentType<SVGProps<SVGSVGElement>>> = {
  core: IconNetwork,
  energy: IconZap,
  financial_services: IconLandmark,
  healthcare: IconHeartPulse,
  insurance: IconUmbrella,
  legal: IconScale,
  manufacturing: IconFactory,
  real_estate: IconBuilding,
}

export function IndustryWorkspaceIcon({ domain }: IndustryWorkspaceIconProps) {
  const normalizedDomain = domain ?? 'core'
  const DomainIcon = industryIcons[normalizedDomain] ?? IconNetwork
  return <DomainIcon data-industry-icon={normalizedDomain} />
}
