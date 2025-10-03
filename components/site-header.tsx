import Link from 'next/link'
import { ThemeToggle } from '@/components/theme-toggle'
import { HeaderSubscribe } from '@/components/subscription-blocks'

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 w-full border-b bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="relative mx-auto flex h-12 max-w-6xl items-center justify-between px-4">
        <h1 className="m-0 p-0 text-inherit text-sm font-semibold leading-none">
          <Link href="/" className="flex items-center gap-2">
            MyTennisNews
          </Link>
        </h1>
        <nav className="flex items-center gap-3 text-sm text-muted-foreground" aria-label="Header actions">
          {/* absolute centered theme toggle */}
          <div className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
            <ThemeToggle className="pointer-events-auto" />
            
          </div>
        </nav>
        <HeaderSubscribe />
      </div>
    </header>
  )
}
