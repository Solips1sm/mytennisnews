"use client"
import * as React from 'react'
import { useState } from 'react'
import { Button } from '@/ui/button'
import { Input } from '@/ui/input'

export function SubscribeForm({ size = 'sm' as 'sm' | 'default' | 'lg' }: { size?: 'sm' | 'default' | 'lg' }) {
  const [email, setEmail] = useState('')
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle')
  const [message, setMessage] = useState<string | null>(null)

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setStatus('loading')
    setMessage(null)
    try {
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
