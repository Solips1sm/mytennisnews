"use client"
import { useEffect, useRef, useState } from 'react'

export function HeroSubscribe() {
  const [hidden, setHidden] = useState<boolean>(false)
  const [closing, setClosing] = useState<boolean>(false)
  const [inlineHeight, setInlineHeight] = useState<number | null>(null)
  const sectionRef = useRef<HTMLElement | null>(null)

  useEffect(() => {
    try {
      if (typeof window !== 'undefined') {
        const v = window.localStorage.getItem('mtnews_hero_closed')
        if (v === '1') setHidden(true)
      }
    } catch {}
  }, [])

  const onClose = () => {
    try {
      if (typeof window !== 'undefined') window.localStorage.setItem('mtnews_hero_closed', '1')
    } catch {}

    if (closing || hidden) return

    const node = sectionRef.current
    if (node) {
      const h = node.getBoundingClientRect().height
      setInlineHeight(h)
      requestAnimationFrame(() => {
        setClosing(true)
        requestAnimationFrame(() => setInlineHeight(0))
      })
      window.setTimeout(() => setHidden(true), 320)
    } else {
      setHidden(true)
    }
  }

  if (hidden) return null

  return (
    <section
      ref={sectionRef}
      className={[
        'relative isolate overflow-hidden rounded-xl border bg-background',
        closing ? 'opacity-0 [filter:blur(6px)] pointer-events-none -mb-8' : 'opacity-100 [filter:blur(0px)]',
        closing ? '' : 'min-h-[25svh]',
        'transition-[height,opacity,filter,margin-bottom] duration-300 ease-out will-change-[height,opacity,filter]'
      ].join(' ')}
      style={inlineHeight !== null ? { height: inlineHeight } : undefined}
    >
      <div className="pointer-events-none absolute inset-0" aria-hidden="true" />
      <div
        className="absolute inset-0"
        style={{
          background:
            'radial-gradient(circle at 50% -20%, rgba(99,0,237,0.6) 0%, rgba(13,13,13,0.93) 50%, rgba(13,13,13,1) 70%)',
        }}
        aria-hidden="true"
      />
      <div className="absolute right-4 top-4 z-20">
        <button
          type="button"
          aria-label="Hide newsletter banner"
          onClick={onClose}
          className="h-8 w-24 rounded-full border border-white/20 px-2 text-sm font-extralight text-white/90 backdrop-blur transition hover:bg-white/15 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/40"
        >
          Hide
        </button>
      </div>

      <div className="relative z-10 mx-auto flex max-w-5xl flex-col items-center px-6 py-12 text-center text-white">
        <p className="text-xs uppercase tracking-wider text-white/75">MyTennisNews Weekly</p>
        <h1 className="mt-2 text-2xl font-bold sm:text-3xl">The smartest tennis brief in your inbox</h1>
        <p className="mt-2 max-w-xl text-sm text-white/85">
          Curated pro tour headlines, storylines that matter, and must‑read links — in one quick email. No noise. No spam.
        </p>
        <div className="mt-5 w-full max-w-md">
          <SubscribeFormInline />
        </div>
      </div>
    </section>
  )
}

// Using a thin wrapper to avoid importing client component at top-level
import dynamic from 'next/dynamic'
const SubscribeFormInline = dynamic(() => import('./subscribe-form-inline').then((m) => m.SubscribeFormInline), {
  ssr: true,
})
