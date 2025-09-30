"use client"
import { useState } from 'react'
import { Button } from '@/ui/button'
import { Input } from '@/ui/input'

export function HeaderSubscribe() {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [ok, setOk] = useState<boolean | null>(null)

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setOk(null)
    try {
      const res = await fetch('/api/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      })
      setOk(res.ok)
      if (res.ok) setEmail('')
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={onSubmit} className="hidden md:flex items-center gap-2">
      <Input
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        type="email"
        placeholder="Email address"
        className="h-8 w-56"
        aria-label="Subscribe via email"
        required
      />
      <Button size="sm" className="h-8" disabled={loading}>{loading ? '...' : 'Subscribe'}</Button>
    </form>
  )
}

export function FooterSubscribe() {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [ok, setOk] = useState<boolean | null>(null)

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setOk(null)
    try {
      const res = await fetch('/api/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      })
      setOk(res.ok)
      if (res.ok) setEmail('')
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={onSubmit} className="mt-2 flex w-full max-w-md items-center gap-2">
      <Input
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        type="email"
        placeholder="you@example.com"
        aria-label="Subscribe via email"
        required
      />
      <Button disabled={loading}>{loading ? '...' : 'Subscribe'}</Button>
    </form>
  )
}
