import Link from 'next/link'

export function MonthFilter({ months, selected }: { months: string[]; selected?: string }) {
  return (
    <div className="flex flex-wrap gap-2">
      {months.map((m) => {
        const active = selected === m
        return (
          <Link
            key={m}
            href={{ pathname: '/', query: { month: m } }}
            className={`rounded-full border px-2 py-0.5 text-xs ${active ? 'bg-accent' : ''}`}
          >
            {m}
          </Link>
        )
      })}
    </div>
  )
}
