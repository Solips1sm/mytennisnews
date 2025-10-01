"use client"

import { useCallback, useEffect, useMemo, useState } from 'react'
import Script from 'next/script'
import { Button } from '@/components/ui/button'

const STORAGE_KEY = 'mtnews_analytics_consent'

type ConsentState = 'unknown' | 'granted' | 'denied'

type AnalyticsConsentProps = {
  measurementId?: string
}

export function AnalyticsConsent({ measurementId }: AnalyticsConsentProps) {
  const [status, setStatus] = useState<ConsentState>('unknown')

  useEffect(() => {
    if (!measurementId) return
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY)
      if (stored === 'granted' || stored === 'denied') {
        setStatus(stored)
      }
    } catch {
      /* ignore */
    }
  }, [measurementId])

  const setConsent = useCallback((value: ConsentState) => {
    try {
      window.localStorage.setItem(STORAGE_KEY, value)
    } catch {
      /* ignore */
    }
    setStatus(value)
  }, [])

  const bannerVisible = useMemo(() => status === 'unknown' && Boolean(measurementId), [status, measurementId])
  const shouldLoadAnalytics = useMemo(() => status === 'granted' && Boolean(measurementId), [status, measurementId])

  if (!measurementId) {
    return null
  }

  return (
    <>
      {shouldLoadAnalytics ? (
        <>
          <Script
            src={`https://www.googletagmanager.com/gtag/js?id=${measurementId}`}
            strategy="afterInteractive"
          />
          <Script id="ga-gtag" strategy="afterInteractive">
            {`
              window.dataLayer = window.dataLayer || [];
              function gtag(){dataLayer.push(arguments);}
              gtag('js', new Date());
              gtag('config', '${measurementId}', { anonymize_ip: true });
            `}
          </Script>
        </>
      ) : null}

      {bannerVisible ? (
        <div className="fixed bottom-4 left-1/2 z-50 w-[min(420px,calc(100vw-2rem))] -translate-x-1/2 rounded-lg border border-border/80 bg-background/95 p-4 shadow-lg backdrop-blur">
          <div className="space-y-3 text-sm text-muted-foreground">
            <p className="font-medium text-foreground">Allow privacy-friendly analytics?</p>
            <p>
              We use Google Analytics to understand site performance. Enable only if you&apos;re okay with cookies that help us improve coverage.
            </p>
          </div>
          <div className="mt-4 flex flex-wrap items-center justify-end gap-2">
            <Button variant="outline" size="sm" onClick={() => setConsent('denied')}>
              Decline
            </Button>
            <Button size="sm" onClick={() => setConsent('granted')}>
              Allow analytics
            </Button>
          </div>
        </div>
      ) : null}
    </>
  )
}
