import './globals.css'
import type { Metadata, Viewport } from 'next'
import { Analytics } from '@vercel/analytics/react'
import { SpeedInsights } from '@vercel/speed-insights/next'
import { SiteHeader } from '@/components/site-header'
import { SiteFooter } from '@/components/site-footer'
import { resolveSiteOrigin, resolveSiteUrl } from '@/lib/utils'
import { uiFont, bodyFont } from './fonts'
import Script from 'next/script'

const defaultSiteFallback = 'https://www.mytennisnews.com'
const siteUrl = resolveSiteUrl(defaultSiteFallback)
const siteName = 'MyTennisNews'
const siteOrigin = resolveSiteOrigin(defaultSiteFallback)
const defaultTitle = 'MyTennisNews — Tennis news for the global community'
const defaultDescription =
  'MyTennisNews is a digital-first tennis news platform bringing stories, live context, and personal coverage to the global tennis community.'
const logoUrl = `${siteOrigin}/android-chrome-512x512.png`
const organizationId = `${siteOrigin}#organization`

const organizationSameAs = (process.env.NEXT_PUBLIC_ORG_SAME_AS || '')
  .split(',')
  .map((value) => value.trim())
  .filter((value) => value.length > 0)

const verificationOther: Record<string, string> = {}
if (process.env.NEXT_PUBLIC_AHREFS_VERIFICATION) {
  verificationOther['ahrefs-site-verification'] = process.env.NEXT_PUBLIC_AHREFS_VERIFICATION
}
if (process.env.NEXT_PUBLIC_BING_VERIFICATION) {
  verificationOther['msvalidate.01'] = process.env.NEXT_PUBLIC_BING_VERIFICATION
}
const verificationMeta = Object.keys(verificationOther).length ? { other: verificationOther } : undefined

export const metadata: Metadata = {
  metadataBase: new URL(`${siteOrigin}/`),
  title: {
    default: defaultTitle,
    template: '%s | MyTennisNews',
  },
  description: defaultDescription,
  applicationName: siteName,
  keywords: [
    'tennis news platform',
    'tennis community',
    'daily tennis stories',
    'grand slam coverage',
    'ATP and WTA analysis',
    'tennis culture',
    'tennis newsletter',
  ],
  category: 'Sports',
  creator: 'MyTennisNews Editorial',
  publisher: 'MyTennisNews Media Group',
  alternates: {
    canonical: siteOrigin,
  },
  openGraph: {
    type: 'website',
    url: siteOrigin,
    siteName,
    title: defaultTitle,
    description: defaultDescription,
    locale: 'en_US',
    images: [
      {
        url: `${siteOrigin}/og`,
        width: 1200,
        height: 630,
        alt: `${siteName} — Tennis news for the global community`,
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: defaultTitle,
    description: defaultDescription,
    images: [`${siteOrigin}/og`],
  },
  robots: {
    index: true,
    follow: true,
    nocache: false,
    googleBot: {
      index: true,
      follow: true,
      'max-snippet': -1,
      'max-image-preview': 'large',
      'max-video-preview': -1,
    },
  },
  verification: verificationMeta,
  icons: {
    icon: [
      { url: '/favicon.ico', type: 'image/x-icon' },
      { url: '/favicon-16x16.png', sizes: '16x16', type: 'image/png' },
      { url: '/favicon-32x32.png', sizes: '32x32', type: 'image/png' },
      { url: '/android-chrome-192x192.png', sizes: '192x192', type: 'image/png' },
      { url: '/android-chrome-512x512.png', sizes: '512x512', type: 'image/png' },
    ],
    apple: [{ url: '/apple-touch-icon.png', sizes: '180x180', type: 'image/png' }],
  },
  manifest: '/site.webmanifest',
  other: {
    'rating': 'general',
  },
}

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#ffffff' },
    { media: '(prefers-color-scheme: dark)', color: '#0f172a' },
  ],
}

const GA_MEASUREMENT_ID = process.env.NEXT_PUBLIC_GOOGLE_ANALYTICS_ID
const GOOGLE_ADS_ID = process.env.NEXT_PUBLIC_GOOGLE_ADS_ID
const GTAG_IDS = Array.from(new Set([GOOGLE_ADS_ID, GA_MEASUREMENT_ID].filter((id): id is string => Boolean(id))))

const organizationSchema: Record<string, unknown> = {
  '@context': 'https://schema.org',
  '@type': 'NewsMediaOrganization',
  '@id': organizationId,
  name: siteName,
  alternateName: defaultTitle,
  url: `${siteOrigin}/`,
  logo: {
    '@type': 'ImageObject',
    url: logoUrl,
  },
  description: defaultDescription,
  slogan: 'Personal tennis stories for a connected community',
  areaServed: {
    '@type': 'Place',
    name: 'Global',
  },
  inLanguage: 'en-US',
  publishingPrinciples: `${siteOrigin}/`,
  knowsAbout: ['Tennis', 'Grand Slams', 'ATP Tour', 'WTA Tour', 'Tennis Rankings', 'Tennis Community', 'Tennis Analytics'],
  audience: {
    '@type': 'Audience',
    audienceType: 'Tennis Enthusiasts',
  },
}

if (organizationSameAs.length > 0) {
  organizationSchema.sameAs = organizationSameAs
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning className={`${uiFont.variable} ${bodyFont.variable}`}>
      <head>
        <link rel="preconnect" href="https://photoresources.wtatennis.com" />
        <link rel="preconnect" href="https://www.atptour.com" />
        <Script id="organization-schema" type="application/ld+json" strategy="beforeInteractive">
          {JSON.stringify(organizationSchema)}
        </Script>
      </head>
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
        {GTAG_IDS.map((id) => (
          <Script key={`gtag-src-${id}`} src={`https://www.googletagmanager.com/gtag/js?id=${id}`} strategy="afterInteractive" />
        ))}
        {GTAG_IDS.length ? (
          <Script id="gtag-init" strategy="afterInteractive">
            {`
              window.dataLayer = window.dataLayer || [];
              function gtag(){dataLayer.push(arguments);}
              gtag('js', new Date());
              ${GA_MEASUREMENT_ID ? `gtag('config', '${GA_MEASUREMENT_ID}', { anonymize_ip: true });` : ''}
              ${GOOGLE_ADS_ID ? `gtag('config', '${GOOGLE_ADS_ID}');` : ''}
            `}
          </Script>
        ) : null}
      </body>
    </html>
  )
}
