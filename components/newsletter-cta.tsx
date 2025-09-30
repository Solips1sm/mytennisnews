import { SubscribeForm } from '@/components/subscribe-form'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/ui/card'

export function NewsletterCta() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Get the weekly tennis digest</CardTitle>
        <CardDescription>Highlights and insights from around the tennis world. No spam.</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="max-w-md">
          <SubscribeForm />
        </div>
      </CardContent>
    </Card>
  )
}
