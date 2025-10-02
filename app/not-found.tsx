import Link from 'next/link'
import Script from 'next/script'
import { ArrowLeft, Home, Newspaper, Mail } from 'lucide-react'
import { buttonVariants } from '@/ui/button'
import { cn, resolveSiteOrigin } from '@/lib/utils'
import { SubscribeFormInline } from '@/components/subscribe-form-inline'

export default function GlobalNotFoundPage() {
  const siteOrigin = resolveSiteOrigin('https://www.mytennisnews.com')
  const notFoundUrl = `${siteOrigin}/404`
  const structuredData = [
    {
      '@context': 'https://schema.org',
      '@type': 'WebPage',
      '@id': `${notFoundUrl}#webpage`,
      url: notFoundUrl,
      name: 'Page not found | MyTennisNews',
      description:
        'The page you were looking for on MyTennisNews could not be found. Discover fresh tennis coverage or subscribe for updates.',
      isPartOf: {
        '@type': 'WebSite',
        '@id': `${siteOrigin}#website`,
        url: `${siteOrigin}/`,
        name: 'MyTennisNews',
      },
      inLanguage: 'en-US',
      potentialAction: {
        '@type': 'SearchAction',
        target: `${siteOrigin}/?q={search_term_string}`,
        'query-input': 'required name=search_term_string',
      },
    },
    {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      '@id': `${notFoundUrl}#breadcrumbs`,
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
          name: 'Page not found',
        },
      ],
    },
  ]

  return (
    <section className="flex flex-col gap-10 py-16">
      <Script id="not-found-schema" type="application/ld+json">
        {JSON.stringify(structuredData)}
      </Script>
      <div className="space-y-4">
        <span className="inline-flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-primary">
          <ArrowLeft className="h-3.5 w-3.5" />
          404 — Page missing
        </span>
        <div className="space-y-3">
          <h1 className="text-3xl font-semibold tracking-tight md:text-4xl">We couldn&apos;t find that page.</h1>
          <p className="max-w-2xl text-base text-muted-foreground">
            The link you followed may be broken, moved, or never existed. Let&apos;s get you back to fresh tennis coverage and
            make sure you never miss the stories that matter.
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Link href="/" className={cn(buttonVariants({ size: 'lg' }), 'gap-2')}>
          <Home className="h-4 w-4" />
          Back to homepage
        </Link>
        <Link href="/?pageSize=50" className={cn(buttonVariants({ variant: 'outline', size: 'lg' }), 'gap-2')}>
          <Newspaper className="h-4 w-4" />
          Browse recent coverage
        </Link>
        <Link href="mailto:hello@mytennisnews.com" className={cn(buttonVariants({ variant: 'ghost', size: 'lg' }), 'gap-2')}>
          <Mail className="h-4 w-4" />
          Report a broken link
        </Link>
      </div>

      <div className="grid gap-6 rounded-lg border border-border/60 bg-muted/20 p-6 md:grid-cols-[1fr_minmax(0,_320px)]">
        <div className="space-y-2">
          <h2 className="text-lg font-semibold">Stay on the baseline with us</h2>
          <p className="text-sm text-muted-foreground">
            Join our newsletter for weekly recaps, exclusive analysis, and curated highlights from across the tours.
          </p>
        </div>
        <SubscribeFormInline />
      </div>

      <div className="space-y-4">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Need a hand?</h2>
        <ul className="grid gap-4 text-sm text-muted-foreground md:grid-cols-2">
          <li>
            Double-check the URL for typos or outdated tournament slugs.
          </li>
          <li>
            Use the homepage filters to jump by month or expand the page size to explore more stories at once.
          </li>
          <li>
            Bookmark the landing page so you always have a fast route back to the latest headlines.
          </li>
          <li>
            If you think something is truly missing, drop us a note so we can fix the link quickly.
          </li>
        </ul>
      </div>
    </section>
  )
}
