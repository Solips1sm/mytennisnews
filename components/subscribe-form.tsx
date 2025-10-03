"use client"
import * as React from 'react'
import { useRef, useState } from 'react'
import { Button } from '@/ui/button'
import { Input } from '@/ui/input'

export function SubscribeForm({ size = 'sm' as 'sm' | 'default' | 'lg' }: { size?: 'sm' | 'default' | 'lg' }) {
  const [email, setEmail] = useState('')
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle')
  const [message, setMessage] = useState<string | null>(null)
  const conversionSendTo = process.env.NEXT_PUBLIC_GOOGLE_ADS_CONVERSION_SEND_TO
  const conversionValue = process.env.NEXT_PUBLIC_GOOGLE_ADS_CONVERSION_VALUE
  const conversionCurrency = process.env.NEXT_PUBLIC_GOOGLE_ADS_CONVERSION_CURRENCY
  const conversionOnSubmit = process.env.NEXT_PUBLIC_GOOGLE_ADS_CONVERSION_ON_SUBMIT === 'true'
  const conversionFiredRef = useRef(false)

  function fireConversionOnce() {
    if (conversionFiredRef.current) return
    if (typeof window !== 'undefined' && typeof window.gtag === 'function' && conversionSendTo) {
      const valueNumber = conversionValue ? Number(conversionValue) : undefined
      window.gtag('event', 'conversion', {
        send_to: conversionSendTo,
        ...(valueNumber && !Number.isNaN(valueNumber) ? { value: valueNumber } : {}),
        ...(conversionCurrency ? { currency: conversionCurrency } : {}),
      })
      conversionFiredRef.current = true
    }
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setStatus('loading')
    setMessage(null)
    try {
      if (conversionOnSubmit) {
        // Fire conversion as soon as the user submits; skip re-firing on success
        fireConversionOnce()
      }
      const res = await fetch('/api/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error || 'Failed to subscribe')
      setStatus('success')
      setMessage('Thanks! Please check your inbox (if needed).')
      setEmail('')
      if (!conversionOnSubmit) {
        // Default: fire conversion only after successful subscribe
        fireConversionOnce()
      }
    } catch (err: any) {
      setStatus('error')
      setMessage(err?.message || 'Something went wrong')
    }
  }

  return (
    <form onSubmit={onSubmit} className="mt-8 max-w-md space-y-2">
      <div className="flex gap-2">
        <Input
          type="email"
          required
          placeholder="you@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          aria-label="Email address"
        />
        <Button type="submit" size={size} disabled={status === 'loading'}>
          {status === 'loading' ? 'Subscribing…' : 'Subscribe'}
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">No spam. Unsubscribe anytime.</p>
      {message ? <p className="text-xs" aria-live="polite">{message}</p> : null}
    </form>
  )
}
