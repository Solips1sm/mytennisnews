export default function Loading() {
  return (
    <section className="space-y-8">
      <div className="container mx-auto px-4 py-8 md:px-6 lg:px-8">
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
          <div className="relative h-[400px] overflow-hidden rounded-lg shadow-lg md:h-[500px] lg:col-span-2">
            <div className="h-full w-full animate-pulse rounded-lg bg-muted" />
          </div>
          <div className="space-y-4 rounded-lg border p-6">
            <div className="h-6 w-40 animate-pulse rounded bg-muted" />
            <div className="space-y-4">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="flex items-center gap-4">
                  <div className="h-16 w-24 animate-pulse rounded bg-muted" />
                  <div className="flex-1 space-y-2">
                    <div className="h-4 w-3/4 animate-pulse rounded bg-muted" />
                    <div className="h-3 w-1/2 animate-pulse rounded bg-muted" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="mt-12">
          <div className="mb-6 flex items-center justify-between">
            <div className="h-6 w-40 animate-pulse rounded bg-muted" />
            <div className="flex items-center gap-3">
              <div className="h-6 w-24 animate-pulse rounded-full bg-muted" />
              <div className="h-8 w-20 animate-pulse rounded-md bg-muted" />
            </div>
          </div>
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 9 }).map((_, i) => (
              <div key={i} className="overflow-hidden rounded-lg border">
                <div className="h-40 w-full animate-pulse bg-muted" />
                <div className="space-y-2 p-4">
                  <div className="h-4 w-1/3 animate-pulse rounded bg-muted" />
                  <div className="h-5 w-11/12 animate-pulse rounded bg-muted" />
                  <div className="h-5 w-10/12 animate-pulse rounded bg-muted" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}
