import { defineConfig } from 'sanity'
import { deskTool } from 'sanity/desk'
import { visionTool } from '@sanity/vision'
import { schemaTypes } from './schemas'

const projectId =
  process.env.SANITY_STUDIO_PROJECT_ID || process.env.SANITY_PROJECT_ID || ''
const dataset =
  process.env.SANITY_STUDIO_DATASET || process.env.SANITY_DATASET || 'production'

if (!projectId) {
  // In production builds, missing projectId causes confusing runtime errors
  throw new Error(
    'Sanity Studio: Missing projectId. Set SANITY_STUDIO_PROJECT_ID in cms/.env or SANITY_PROJECT_ID in root .env.'
  )
}

export default defineConfig({
  name: 'mytennisnews',
  title: 'MyTennisNews CMS',
  projectId,
  dataset,
  basePath: process.env.SANITY_STUDIO_BASEPATH || '/cms',
  plugins: [deskTool(), visionTool()],
  schema: {
    types: schemaTypes,
  },
})
