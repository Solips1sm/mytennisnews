"use client"
import * as React from 'react'
import { Moon, Sun } from 'lucide-react'
import { cn } from '@/lib/utils'

export function ThemeToggle({ className }: { className?: string }) {
  const [mounted, setMounted] = React.useState(false)
  const [isDark, setIsDark] = React.useState(false)

  React.useEffect(() => {
    setMounted(true)
    try {
      const stored = localStorage.getItem('theme')
      if (stored === 'dark') { setIsDark(true); return }
      if (stored === 'light') { setIsDark(false); return }
    } catch {}
    const prefersDark = typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches
    const rootHasDark = document.documentElement.classList.contains('dark')
    setIsDark(prefersDark || rootHasDark)
  }, [])

  if (!mounted) return null

  function applyTheme(nextDark: boolean) {
    const root = document.documentElement
    if (nextDark) root.classList.add('dark')
    else root.classList.remove('dark')
    try { localStorage.setItem('theme', nextDark ? 'dark' : 'light') } catch {}
  }

  function toggle() {
    const next = !isDark
    setIsDark(next)
    applyTheme(next)
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={isDark ? 'Activate light mode' : 'Activate dark mode'}
      aria-pressed={isDark}
      className={cn(
        'relative inline-flex h-6 w-6 items-center justify-center rounded-md border-b text-foreground hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
        className,
      )}
    >
      <Sun
        className={cn(
          'h-3.5 w-3.5 rotate-0 scale-100 transition-all',
          isDark && '-rotate-90 scale-0',
        )}
      />
      <Moon
        className={cn(
          'absolute h-3.5 w-3.5 rotate-90 scale-0 transition-all',
          isDark && 'rotate-0 scale-100',
        )}
      />
      <span className="sr-only">Toggle theme</span>
    </button>
  )
}
