"use client"
import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { RichExternalContent } from '@/components/rich-external-content'
import { SideDotNav } from '@/components/side-dot-nav'

type Anchor = { id: string; title: string; preview?: string }

function slugify(text: string) {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
}

export function ArticleBodyWithSideNav({ html, sourceHost, primaryImageUrl }: { html: string; sourceHost?: string; primaryImageUrl?: string }) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const [anchors, setAnchors] = useState<Anchor[]>([])
  const [active, setActive] = useState(0)
  const contentBoundsStyle = { maxWidth: 'var(--article-content-max)' } as CSSProperties

  // Force-smooth scrolling helpers (override if browser ignores smooth)
  const scrollToElement = (element: HTMLElement, offset = 96) => {
    // Method 1: Immediate scroll (fallback)
    const rect = element.getBoundingClientRect()
    const targetY = window.scrollY + rect.top - offset
    window.scrollTo(0, targetY)
    
    // Method 2: Smooth scroll
    setTimeout(() => {
      element.scrollIntoView({ 
        behavior: 'smooth', 
        block: 'start',
        inline: 'nearest'
      })
    }, 10)
    
    // Method 3: Custom smooth scroll
    setTimeout(() => {
      const newRect = element.getBoundingClientRect()
      const newTargetY = window.scrollY + newRect.top - offset
      smoothScrollWindowTo(newTargetY)
    }, 20)
  }
  
  const getScrollParent = (node: HTMLElement | null): HTMLElement => {
    let cur: HTMLElement | null = node?.parentElement || null
    while (cur) {
      const style = getComputedStyle(cur)
      const oy = style.overflowY
      if ((oy === 'auto' || oy === 'scroll') && cur.scrollHeight > cur.clientHeight) return cur
      cur = cur.parentElement
    }
    return (document.scrollingElement || document.documentElement) as HTMLElement
  }
  const easeInOutCubic = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 1, 3) / 2)
  const smoothScrollContainerTo = (container: HTMLElement, targetTop: number, duration = 450) => {
    const start = container.scrollTop
    const change = targetTop - start
    if (Math.abs(change) < 1) return
    const startTime = performance.now()
    const step = (now: number) => {
      const elapsed = now - startTime
      const t = Math.min(1, elapsed / duration)
      const eased = easeInOutCubic(t)
      container.scrollTop = start + change * eased
      if (t < 1) requestAnimationFrame(step)
    }
    requestAnimationFrame(step)
  }
  const smoothScrollWindowTo = (targetTop: number, duration = 450) => {
    const start = window.scrollY || window.pageYOffset
    const change = targetTop - start
    if (Math.abs(change) < 1) return
    const startTime = performance.now()
    const step = (now: number) => {
      const elapsed = now - startTime
      const t = Math.min(1, elapsed / duration)
      const eased = easeInOutCubic(t)
      window.scrollTo(0, start + change * eased)
      if (t < 1) requestAnimationFrame(step)
    }
    requestAnimationFrame(step)
  }

  // Attach IDs to sections (headings preferred, paragraphs fallback) and collect anchors
  useEffect(() => {
    const root = containerRef.current
    if (!root) return

    const seen = new Map<string, number>()
    const list: Anchor[] = []
    let targets: HTMLElement[] = []

    const headingNodes = Array.from(root.querySelectorAll<HTMLHeadingElement>('h1, h2, h3, h4'))
    const paragraphNodes = Array.from(root.querySelectorAll<HTMLParagraphElement>('p'))

    const targetsList: HTMLElement[] = []

    const takePreview = (startNode: ChildNode | null, boundary: HTMLElement | null) => {
      const parts: string[] = []
      let cur: ChildNode | null = startNode
      while (cur && cur !== boundary) {
        if (cur.nodeType === Node.ELEMENT_NODE) {
          const el = cur as HTMLElement
          if (/^P|UL|OL|BLOCKQUOTE|DIV$/i.test(el.tagName)) {
            const text = el.textContent?.trim() || ''
            if (text) parts.push(text)
          }
        }
        if (parts.join(' ').length > 300) break
        cur = cur.nextSibling
      }
      return parts.join(' ').slice(0, 300)
    }

    const buildTitleFromText = (text: string) => {
      const trimmed = text.trim()
      if (!trimmed) return 'Section'
      const sentence = trimmed.split(/(?<=[.!?])\s+/)[0]
      return (sentence && sentence.length >= 24 ? sentence : trimmed).slice(0, 80)
    }

    const addIntroAnchor = () => {
      if (!paragraphNodes.length) return
      if (!headingNodes.length) return
      const firstHeading = headingNodes[0]
      const introParas = paragraphNodes
        .filter((p) => {
          const txt = (p.textContent || '').trim()
          if (!txt) return false
          const relation = p.compareDocumentPosition(firstHeading)
          return (relation & Node.DOCUMENT_POSITION_FOLLOWING) !== 0
        })
        .slice(0, 2)
      if (!introParas.length) return
      const combinedText = introParas.map((p) => (p.textContent || '').trim()).filter(Boolean)
      if (!combinedText.length) return
      const introTitle = buildTitleFromText(combinedText[0])
      const baseId = introParas[0].id || slugify(introTitle || 'introduction') || 'introduction'
      const used = seen.get(baseId) || 0
      seen.set(baseId, used + 1)
      const id = used === 0 ? baseId : `${baseId}-${used}`
      introParas[0].id = id
      targetsList.push(introParas[0])
      const preview = combinedText.join(' ').slice(0, 300)
      list.push({ id, title: introTitle, preview })
    }

    if (headingNodes.length > 0) {
      addIntroAnchor()
      headingNodes.forEach((h, idx) => {
        const title = (h.textContent || '').trim()
        if (!title) return
        const base = h.id || slugify(title)
        const used = seen.get(base) || 0
        seen.set(base, used + 1)
        const id = used === 0 ? base : `${base}-${used}`
        h.id = id
        const nextHeading = headingNodes[idx + 1] || null
        const preview = takePreview(h.nextSibling, nextHeading)
        list.push({ id: h.id, title, preview })
        targetsList.push(h)
      })
      targets = targetsList
    } else {
      // Fallback: use representative paragraphs as sections
      const chosen: HTMLParagraphElement[] = []
      for (const p of paragraphNodes) {
        const text = (p.textContent || '').trim()
        if (text.length >= 80) chosen.push(p)
        if (chosen.length >= 8) break
      }
      if (chosen.length === 0 && paragraphNodes.length) {
        chosen.push(...paragraphNodes.slice(0, Math.min(5, paragraphNodes.length)))
      }
      targets = chosen as unknown as HTMLElement[]
      chosen.forEach((p, idx) => {
        const text = (p.textContent || '').trim()
        if (!text) return
        const title = buildTitleFromText(text)
        const base = p.id || slugify(title)
        const used = seen.get(base) || 0
        seen.set(base, used + 1)
        const id = used === 0 ? base : `${base}-${used}`
        p.id = id
        const preview = text.slice(0, 300)
        list.push({ id, title, preview })
      })
    }

    setAnchors(list)

    // Scroll spy via IntersectionObserver
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => (a.boundingClientRect.top || 0) - (b.boundingClientRect.top || 0))
        if (visible.length) {
          const first = visible[0]
          const idx = targets.findIndex((el) => el === first.target)
          if (idx >= 0) setActive(idx)
        } else {
          const topIdx = targets
            .map((h, i) => ({ i, top: h.getBoundingClientRect().top }))
            .filter((x) => x.top <= 80)
            .sort((a, b) => b.top - a.top)[0]?.i
          if (typeof topIdx === 'number') setActive(topIdx)
        }
      },
      { root: null, rootMargin: '0px 0px -70% 0px', threshold: [0, 1] },
    )

  targets.forEach((h) => observer.observe(h))
    return () => observer.disconnect()
  }, [html])

  const scrollToIndex = (i: number) => {
    if (!anchors.length) {
      return
    }
    const anchor = anchors[i]
    if (!anchor) {
      return
    }
    
    // First try to find the element by ID
    let el = document.getElementById(anchor.id)
    
    // If not found, try to find it in our container and set the ID
    if (!el && containerRef.current) {
      const headings = Array.from(containerRef.current.querySelectorAll<HTMLElement>('h1, h2, h3, h4'))
      const paragraphs = Array.from(containerRef.current.querySelectorAll<HTMLElement>('p'))
      const allElements = [...headings, ...paragraphs]
      
      // Try to match by title content
      for (const candidate of allElements) {
        const candidateText = (candidate.textContent || '').trim()
        if (candidateText && (
          candidateText.includes(anchor.title) || 
          anchor.title.includes(candidateText) ||
          slugify(candidateText) === anchor.id
        )) {
          candidate.id = anchor.id
          el = candidate as HTMLElement
          break
        }
      }
    }
    
    if (!el) {
      // Try one more approach - find by index
      if (containerRef.current) {
        const headings = Array.from(containerRef.current.querySelectorAll<HTMLElement>('h1, h2, h3, h4'))
        if (headings[i]) {
          const heading = headings[i]
          heading.id = anchor.id // Set the ID for future reference
          el = heading
        } else {
          const paragraphs = Array.from(containerRef.current.querySelectorAll<HTMLElement>('p'))
          if (paragraphs[i]) {
            const paragraph = paragraphs[i]
            paragraph.id = anchor.id // Set the ID for future reference
            el = paragraph
          }
        }
      }
    }
    
    if (!el) {
      return
    }
    
    scrollToElement(el as HTMLElement)
  }
  const handlePrev = () => {
    setActive((i) => {
      const next = Math.max(0, i - 1)
      setTimeout(() => scrollToIndex(next), 0) // Use setTimeout instead of rAF
      return next
    })
  }
  const handleNext = () => {
    setActive((i) => {
      const next = Math.min(anchors.length - 1, i + 1)
      setTimeout(() => scrollToIndex(next), 0) // Use setTimeout instead of rAF
      return next
    })
  }
  const handleSelect = (i: number) => {
    setActive(i)
    setTimeout(() => scrollToIndex(i), 0) // Use setTimeout instead of rAF
  }

  return (
    <div className="relative">
      <div
        ref={containerRef}
        className="prose prose-neutral dark:prose-invert mt-2 md:mt-6 text-2xl mx-auto w-[95vw] max-w-[95vw] sm:w-full sm:max-w-none [&_h1]:scroll-mt-24 [&_h2]:scroll-mt-24 [&_h3]:scroll-mt-24 [&_h4]:scroll-mt-24 [&_p]:scroll-mt-24"
        style={contentBoundsStyle}
      >
        <RichExternalContent html={html} sourceHost={sourceHost} primaryImageUrl={primaryImageUrl} className="w-[96vw] max-w-[98vw] sm:w-full sm:max-w-none" />
      </div>
      <SideDotNav
        count={Math.max(anchors.length, 1)}
        activeIndex={active}
        onPrev={handlePrev}
        onNext={handleNext}
        onSelect={handleSelect}
        items={anchors.map(a => ({ title: a.title, preview: a.preview }))}
        className="pointer-events-auto absolute right-1 top-1/2 -translate-y-1/2 z-30 hidden md:flex"
      />
    </div>
  )
}
