import { Resend } from 'resend'

export interface SendEmailInput {
  to: string[]
  subject: string
  text?: string
  html?: string
  from?: string
}

export async function sendEmailViaResend(input: SendEmailInput) {
  const apiKey = process.env.RESEND_API_KEY
  const from = input.from || process.env.EMAIL_FROM
  if (!apiKey) throw new Error('Missing RESEND_API_KEY')
  if (!from) throw new Error('Missing EMAIL_FROM')
  const resend = new Resend(apiKey)
  const result = await resend.emails.send({
    from,
    to: input.to,
    subject: input.subject,
    text: input.text,
    html: input.html,
  } as any)
  return result
}