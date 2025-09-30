import Link from 'next/link'

export default function VerifyRequest() {
  return (
    <div className="flex min-h-screen items-center justify-center">
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