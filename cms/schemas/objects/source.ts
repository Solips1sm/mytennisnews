import { defineField, defineType } from 'sanity'

export default defineType({
  name: 'source',
  title: 'Source',
  type: 'document',
  fields: [
    defineField({ name: 'name', type: 'string', validation: (r) => r.required() }),
    defineField({ name: 'url', type: 'url', validation: (r) => r.required() }),
    defineField({ name: 'feedUrl', title: 'Feed URL', type: 'url' }),
    defineField({ name: 'license', type: 'string' }),
    defineField({ name: 'allowedUse', title: 'Allowed Use', type: 'string' }),
  ],
})
