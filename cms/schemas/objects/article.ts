import { defineField, defineType } from 'sanity'

export default defineType({
  name: 'article',
  title: 'Article',
  type: 'document',
  fields: [
    defineField({ name: 'title', type: 'string', validation: (r) => r.required() }),
    defineField({ name: 'slug', type: 'slug', options: { source: 'title' } }),
    defineField({ name: 'excerpt', type: 'text' }),
    defineField({ name: 'body', type: 'array', of: [{ type: 'block' }] }),
  defineField({ name: 'externalHtml', title: 'External HTML (sanitized)', type: 'text' }),
  defineField({ name: 'leadImageUrl', title: 'Lead Image URL', type: 'url' }),
  defineField({ name: 'mediaCredits', title: 'Media Credits', type: 'string' }),
    defineField({ name: 'canonicalUrl', title: 'Canonical URL', type: 'url' }),
    defineField({ name: 'source', type: 'reference', to: [{ type: 'source' }] }),
    defineField({ name: 'tags', type: 'array', of: [{ type: 'reference', to: [{ type: 'tag' }] }] }),
    defineField({ name: 'authors', title: 'Authors', type: 'array', of: [{ type: 'string' }] }),
    defineField({ name: 'timestampText', title: 'Timestamp (verbatim)', type: 'string' }),
    defineField({
      name: 'status',
      type: 'string',
      options: { list: ['draft', 'review', 'published'] },
      initialValue: 'draft',
    }),
    defineField({ name: 'publishedAt', type: 'datetime' }),
    defineField({ name: 'aiVariants', title: 'AI Variants (JSON)', type: 'array', of: [{ type: 'object', fields: [
      { name: 'title', type: 'string' },
      { name: 'excerpt', type: 'text' },
      { name: 'body', type: 'text' },
    ] }]}),
    defineField({ name: 'aiFinal', title: 'AI Final Draft (JSON)', type: 'object', fields: [
      { name: 'title', type: 'string' },
      { name: 'excerpt', type: 'text' },
      { name: 'body', type: 'text' },
      { name: 'provider', type: 'string' },
      { name: 'model', type: 'string' },
      { name: 'createdAt', type: 'datetime' },
    ]}),
  ],
  preview: {
    select: { title: 'title', subtitle: 'canonicalUrl' },
  },
})
