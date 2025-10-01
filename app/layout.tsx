import './globals.css'
import type { Metadata } from 'next'
import Script from 'next/script'
import { Analytics } from '@vercel/analytics/react'
import { SpeedInsights } from '@vercel/speed-insights/next'
import { SiteHeader } from '@/components/site-header'
import { SiteFooter } from '@/components/site-footer'
import { uiFont, bodyFont } from './fonts'

export const metadata: Metadata = {
  title: 'MyTennisNews',
  description: 'Tennis news, curated with proper attribution.',
}

const GA_MEASUREMENT_ID = process.env.NEXT_PUBLIC_GOOGLE_ANALYTICS_ID

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
        <Analytics />
        <SpeedInsights />
        {GA_MEASUREMENT_ID ? (
          <>
            <Script
              src={`https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}`}
              strategy="afterInteractive"
            />
            <Script id="ga-gtag" strategy="afterInteractive">
              {`
                window.dataLayer = window.dataLayer || [];
                function gtag(){dataLayer.push(arguments);}
                gtag('js', new Date());
                gtag('config', '${GA_MEASUREMENT_ID}', { anonymize_ip: true });
              `}
            </Script>
          </>
        ) : null}
      </body>
    </html>
  )
}
