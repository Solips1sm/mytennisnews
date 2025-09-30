import './globals.css'
import type { Metadata } from 'next'
import { SiteHeader } from '@/components/site-header'
import { SiteFooter } from '@/components/site-footer'
import { uiFont, bodyFont } from './fonts'

export const metadata: Metadata = {
  title: 'MyTennisNews',
  description: 'Tennis news, curated with proper attribution.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning className={`${uiFont.variable} ${bodyFont.variable}`}>
      <body className="min-h-screen bg-background text-foreground antialiased">
        <script
          dangerouslySetInnerHTML={{
            __html: `
            (function(){
              try {
                var ls = localStorage.getItem('theme');
                var m = window.matchMedia('(prefers-color-scheme: dark)').matches;
                if (ls === 'dark' || (!ls && m)) document.documentElement.classList.add('dark');
              } catch {}
            })();
            `,
          }}
        />
        <SiteHeader />
        <main className="mx-auto max-w-6xl px-1 md:px-2 2xl:px-4 py-2 md:py-4 2xl:py-6">{children}</main>
        <SiteFooter />
      </body>
    </html>
  )
}
