import { SubscribeForm } from '@/components/subscribe-form'

export function SiteFooter() {
  return (
    <footer className="rounded-xl bg-background p-6 shadow-sm mx-4 mt-2 md:mt-3 lg:mt-4 2xl:mt-6">
      <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 text-center sm:flex-row sm:items-center sm:text-left">
        <p className="text-sm text-muted-foreground max-w-xl">
          Get the most relevant tennis stories in 5 minutes.
        </p>
        <div className="w-full sm:w-auto">
          <SubscribeForm size="sm" />
        </div>
      </div>
    </footer>
  )
}
