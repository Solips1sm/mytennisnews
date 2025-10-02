import Link from 'next/link'
import Script from 'next/script'
import { resolveSiteOrigin } from '@/lib/utils'

export default function VerifyRequest() {
  const siteOrigin = resolveSiteOrigin('https://www.mytennisnews.com')
  const pageUrl = `${siteOrigin}/auth/verify-request`
  const structuredData = [
    {
      '@context': 'https://schema.org',
      '@type': 'WebPage',
      '@id': `${pageUrl}#webpage`,
      url: pageUrl,
      name: 'Verify your email | MyTennisNews',
      description: 'Confirmation screen letting readers know that a sign-in link was sent to their inbox.',
      inLanguage: 'en-US',
      isPartOf: {
        '@type': 'WebSite',
        '@id': `${siteOrigin}#website`,
        url: `${siteOrigin}/`,
        name: 'MyTennisNews',
      },
    },
    {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      '@id': `${pageUrl}#breadcrumbs`,
      itemListElement: [
        {
          '@type': 'ListItem',
          position: 1,
          name: 'Home',
          item: `${siteOrigin}/`,
        },
        {
          '@type': 'ListItem',
          position: 2,
          name: 'Verify email',
          item: pageUrl,
        },
      ],
    },
  ]

  return (
    <div className="flex min-h-screen items-center justify-center">
      <Script id="verify-request-schema" type="application/ld+json">
        {JSON.stringify(structuredData)}
      </Script>
      <div className="mx-auto max-w-md space-y-6 text-center">
        <h1 className="text-2xl font-bold">Check your email</h1>
        <p className="text-muted-foreground">
          A sign in link has been sent to your email address.
        </p>
        <Link href="/" className="text-sm underline">
          ← Back to home
        </Link>
      </div>
    </div>
  )
}