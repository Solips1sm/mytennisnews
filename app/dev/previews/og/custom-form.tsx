'use client'

import { Button } from '@/ui/button'

export function CustomOGForm({ baseUrl }: { baseUrl: string }) {
  const handleGenerate = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const form = e.currentTarget
    const title = (form.querySelector('#title') as HTMLInputElement)?.value || ''
    const description = (form.querySelector('#description') as HTMLInputElement)?.value || ''
    const params = new URLSearchParams()
    if (title) params.set('title', title)
    if (description) params.set('description', description)
    const url = `${baseUrl}/og${params.toString() ? '?' + params.toString() : ''}`
    window.open(url, '_blank')
  }

  return (
    <form className="space-y-4" onSubmit={handleGenerate}>
      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <label htmlFor="title" className="text-sm font-medium">
            Title
          </label>
          <input
            id="title"
            name="title"
            type="text"
            placeholder="Enter custom title"
            className="w-full px-3 py-2 border rounded-md bg-background"
          />
        </div>
        <div className="space-y-2">
          <label htmlFor="description" className="text-sm font-medium">
            Description
          </label>
          <input
            id="description"
            name="description"
            type="text"
            placeholder="Enter custom description"
            className="w-full px-3 py-2 border rounded-md bg-background"
          />
        </div>
      </div>
      <Button type="submit">
        Generate Preview
      </Button>
    </form>
  )
}
