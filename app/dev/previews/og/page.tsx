import { notFound } from 'next/navigation'
import { headers } from 'next/headers'
import { Button } from '@/ui/button'
import { CustomOGForm } from './custom-form'

export const revalidate = 0

export default async function OGPreviewPage() {
  const allowed = process.env.NEXT_PUBLIC_PREVIEW_MODE === 'true'
  if (!allowed) {
    notFound()
  }

  // Restrict to localhost only
  const headersList = await headers()
  const host = headersList.get('host') || ''
  const isLocalhost = host.startsWith('localhost:') || host.startsWith('127.0.0.1:')
  if (!isLocalhost) {
    notFound()
  }

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
  const baseUrl = siteUrl.replace(/\/$/, '')

  const examples = [
    {
      label: 'Default',
      url: `${baseUrl}/og`,
    },
    {
      label: 'Custom Title',
      url: `${baseUrl}/og?title=${encodeURIComponent('Alcaraz Clinches Fifth Grand Slam Title')}`,
    },
    {
      label: 'With Description',
      url: `${baseUrl}/og?title=${encodeURIComponent('Swiatek Returns to Form')}&description=${encodeURIComponent('World No. 1 dominates clay season with strategic precision and mental fortitude')}`,
    },
    {
      label: 'Long Title Test',
      url: `${baseUrl}/og?title=${encodeURIComponent('Breaking: Djokovic Announces Return to ATP Tour After Extended Break, Eyes Record-Breaking Season')}`,
    },
  ]

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 space-y-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">OG Image Previews</h1>
        <p className="text-sm text-muted-foreground">/dev/previews/og</p>
      </div>

      <div className="space-y-6">
        {examples.map((example, idx) => (
          <section key={idx} className="rounded-lg border">
            <div className="flex items-center justify-between border-b p-4">
              <div>
                <h2 className="font-semibold">{example.label}</h2>
                <p className="text-xs text-muted-foreground font-mono break-all">{example.url}</p>
              </div>
              <a href={example.url} target="_blank" rel="noopener noreferrer">
                <Button size="sm" variant="outline">
                  Open
                </Button>
              </a>
            </div>
            <div className="p-4 bg-muted/20">
              <div className="aspect-[1200/630] w-full max-w-3xl mx-auto rounded border border-border overflow-hidden bg-background">
                <img
                  src={example.url}
                  alt={example.label}
                  className="w-full h-full object-cover"
                />
              </div>
            </div>
          </section>
        ))}
      </div>

      <section className="rounded-lg border p-6 space-y-4">
        <h2 className="text-lg font-semibold">Test Custom Parameters</h2>
        <CustomOGForm baseUrl={baseUrl} />
      </section>
    </div>
  )
}
