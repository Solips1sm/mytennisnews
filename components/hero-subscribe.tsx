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
        'hero-subscribe relative isolate overflow-hidden rounded-xl border bg-background',
        closing ? 'opacity-0 [filter:blur(6px)] pointer-events-none' : 'opacity-100',
        closing ? '' : 'min-h-[16svh] md:min-h-[16svh]',
        'transition-[height,opacity,filter,margin-bottom] duration-300 ease-out will-change-[height,opacity,filter]',
        closing ? '-mb-8' : 'mb-6 md:mb-8'
      ].join(' ')}
      style={inlineHeight !== null ? { height: inlineHeight } : undefined}
    >
      {/* Background overlays: softened for mobile, original for sm+ */}
      <div
        className="absolute inset-0 z-0 pointer-events-none block sm:hidden"
        style={{
          background:
            'radial-gradient(120% 70% at 50% -30%, rgba(99,0,237,0.22) 0%, rgba(13,13,13,0.78) 58%), linear-gradient(to bottom, rgba(13,13,13,0.86), rgba(13,13,13,1))',
        }}
        aria-hidden="true"
      />
      <div
        className="absolute inset-0 z-0 pointer-events-none hidden sm:block"
        style={{
          background:
            'radial-gradient(circle at 50% -20%, rgba(99,0,237,0.6) 0%, rgba(13,13,13,0.93) 50%, rgba(13,13,13,1) 70%)',
        }}
        aria-hidden="true"
      />
      <div className="absolute right-2 top-2 sm:right-4 sm:top-4 z-20">
        <button
          type="button"
          aria-label="Hide newsletter banner"
          onClick={onClose}
          className="hero-close h-7 w-20 text-xs sm:h-8 sm:w-24 sm:text-sm rounded-full border border-white/20 px-2 font-extralight text-white/90 backdrop-blur transition hover:bg-white/15 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/40"
        >
          Hide
        </button>
      </div>

  <div className="hero-subscribe__inner relative z-10 mx-auto flex max-w-5xl flex-col items-center px-5 py-6 sm:py-8 text-center text-white will-change-transform [transform:translateZ(0)]">
        <p className="hero-kicker text-[11px] uppercase tracking-wider text-white/75">MyTennisNews Weekly</p>
        <h1 className="hero-title mt-1.5 text-[20px] leading-tight font-bold sm:text-[24px]">The smartest tennis brief in your inbox</h1>
        <p className="hero-lede mt-1.5 max-w-xl text-[13px] sm:text-sm leading-snug text-white/85">
          Curated pro tour headlines, storylines that matter, and must‑read links — in one quick email. No noise. No spam.
        </p>
        <div className="mt-4 w-full max-w-md">
          <SubscribeFormInline />
        </div>
      </div>
      <style
        dangerouslySetInnerHTML={{
          __html: `
          /* Further tighten when in portrait or very short viewports */
          @media (orientation: portrait) {
            .hero-subscribe{ min-height:12svh; }
          }
          @media (orientation: portrait) and (max-height: 740px) {
            .hero-subscribe__inner{ padding-top:14px; padding-bottom:14px; }
            .hero-kicker{ font-size:10px; }
            .hero-title{ font-size:18px; line-height:1.15; margin-top:6px; }
            .hero-lede{ font-size:12px; line-height:1.25; margin-top:6px; }
            .hero-close{ height:28px; width:76px; font-size:12px; }
            /* keep close outside text bounds and away from notches */
            .hero-subscribe > .absolute{ right: max(8px, env(safe-area-inset-right)); top: max(8px, env(safe-area-inset-top)); z-index: 40; }
          }
          @media (max-height: 640px) and (orientation: portrait) {
            .hero-subscribe{ min-height:10svh; }
            /* Hide lede on very constrained vertical space */
            .hero-lede{ display:none; }
            .hero-title{ margin-top:4px; }
            .hero-subscribe__inner{ padding-top:12px; padding-bottom:12px; }
          }
        `,
        }}
      />
    </section>
  )
}

// Note: Inline form imported statically to avoid hydration timing differences and layout snaps
