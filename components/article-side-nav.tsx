"use client"

import { useState } from 'react'
import { SideDotNav } from '@/components/side-dot-nav'

export function ArticleSideNav({ count = 8 }: { count?: number }) {
  const [active, setActive] = useState(0)
  return (
    <SideDotNav
      count={count}
      activeIndex={active}
      onPrev={() => setActive((i) => Math.max(0, i - 1))}
      onNext={() => setActive((i) => Math.min(count - 1, i + 1))}
      onSelect={(i) => setActive(i)}
    />
  )
}
