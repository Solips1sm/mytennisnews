"use client"
import { useEffect, useRef, useState } from 'react'
import { SubscribeFormInline } from './subscribe-form-inline'

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
        'hero-sub relative isolate overflow-hidden rounded-xl border bg-background mb-6',
        closing ? 'opacity-0 [filter:blur(6px)] pointer-events-none -mb-8' : 'opacity-100',
        closing ? '' : 'min-h-[20svh] md:min-h-[25svh]',
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
      <div className="hero-close-wrap absolute right-4 top-4 z-20">
        <button
          type="button"
          aria-label="Hide newsletter banner"
          onClick={onClose}
          className="hero-close-btn h-8 w-24 rounded-full border border-white/20 px-2 text-sm font-extralight text-white/90 backdrop-blur transition hover:bg-white/15 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/40"
        >
          Hide
        </button>
      </div>

      <div className="hero-content relative z-10 mx-auto flex max-w-5xl flex-col items-center px-6 py-12 text-center text-white">
        <p className="hero-kicker text-xs uppercase tracking-wider text-white/75">MyTennisNews Weekly</p>
        <h1 className="hero-title mt-2 text-2xl font-bold sm:text-3xl">The smartest tennis brief in your inbox</h1>
        <p className="hero-lede mt-2 max-w-xl text-sm text-white/85">
          Curated pro tour headlines, storylines that matter, and must‑read links — in one quick email. No noise. No spam.
        </p>
        <div className="hero-form mt-5 w-full max-w-md">
          <SubscribeFormInline />
        </div>
      </div>

      <style dangerouslySetInnerHTML={{
        __html: `
          /* Mobile compact: max 33vh */
          @media (max-width: 640px) {
            .hero-sub { min-height: clamp(26vh, 28vh, 28vh) !important; max-height: 28vh; }
            .hero-content { padding: 1rem 1.25rem !important; }
            .hero-kicker { font-size: 10px; }
            .hero-title { margin-top: 0.375rem; font-size: 1.125rem; line-height: 1.2; }
            .hero-lede { margin-top: 0.375rem; font-size: 0.75rem; line-height: 1.3; }
            .hero-form { margin-top: 0.875rem; }
            .hero-close-wrap { right: 0.5rem; top: 0.5rem; }
            .hero-close-btn { height: 1.75rem; width: 4.5rem; font-size: 0.75rem; padding: 0 0.5rem; }
          }
          /* Portrait phones: further compress */
          @media (max-width: 640px) and (orientation: portrait) and (max-height: 740px) {
            .hero-sub { min-height: 28vh !important; max-height: 30vh; }
            .hero-content { padding: 0.75rem 1rem !important; }
            .hero-kicker { font-size: 9px; }
            .hero-title { font-size: 1rem; margin-top: 0.25rem; }
            .hero-lede { font-size: 0.7rem; margin-top: 0.25rem; }
            .hero-form { margin-top: 0.75rem; }
          }
          /* Very short portrait: hide lede */
          @media (max-width: 640px) and (orientation: portrait) and (max-height: 640px) {
            .hero-sub { min-height: 22vh !important; max-height: 26vh; }
            .hero-lede { display: none; }
            .hero-title { margin-top: 0.25rem; }
            .hero-form { margin-top: 0.625rem; }
          }
        `
      }} />
    </section>
  )
}