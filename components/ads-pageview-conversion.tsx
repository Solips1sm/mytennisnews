"use client"
import { useEffect } from 'react'

type Props = {
  sendTo?: string
  value?: number
  currency?: string
}

/**
 * Fires a Google Ads page-view conversion on mount.
 * Defaults are read from NEXT_PUBLIC_GOOGLE_ADS_CONVERSION_* envs.
 */
export function AdsPageviewConversion({ sendTo, value, currency }: Props) {
  useEffect(() => {
    try {
      const envSendTo = process.env.NEXT_PUBLIC_GOOGLE_ADS_CONVERSION_SEND_TO
      const envVal = process.env.NEXT_PUBLIC_GOOGLE_ADS_CONVERSION_VALUE
      const envCurr = process.env.NEXT_PUBLIC_GOOGLE_ADS_CONVERSION_CURRENCY
      const finalSendTo = sendTo || envSendTo
      if (typeof window !== 'undefined' && typeof window.gtag === 'function' && finalSendTo) {
        const v = typeof value === 'number' ? value : (envVal ? Number(envVal) : undefined)
        const c = currency || envCurr
        const payload: Record<string, any> = { send_to: finalSendTo }
        if (typeof v === 'number' && !Number.isNaN(v)) payload.value = v
        if (c) payload.currency = c
        window.gtag('event', 'conversion', payload)
      }
    } catch {
      // no-op
    }
  }, [sendTo, value, currency])
  return null
}

export default AdsPageviewConversion
