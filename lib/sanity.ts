import { createClient } from 'next-sanity'

const projectId =
  process.env.SANITY_PROJECT_ID || process.env.SANITY_STUDIO_PROJECT_ID || ''
if (!projectId) throw new Error('Missing SANITY_PROJECT_ID')
const dataset = process.env.SANITY_DATASET || process.env.SANITY_STUDIO_DATASET || 'production'
const apiVersion = '2025-01-01'

export const publicClient = createClient({ projectId, dataset, apiVersion, useCdn: process.env.NODE_ENV === 'production' })

export const serverClient = createClient({
  projectId,
  dataset,
  apiVersion,
  useCdn: false,
  token: process.env.SANITY_API_WRITE_TOKEN || process.env.SANITY_API_READ_TOKEN,
  perspective: 'raw',
})

export const previewClient = createClient({
  projectId,
  dataset,
  apiVersion,
  useCdn: false,
  token: process.env.SANITY_API_READ_TOKEN || process.env.SANITY_API_WRITE_TOKEN,
  perspective: 'drafts',
})

export function getClient(isPreview: boolean) {
  if (isPreview && (process.env.SANITY_API_READ_TOKEN || process.env.SANITY_API_WRITE_TOKEN)) return previewClient
  return publicClient
}
