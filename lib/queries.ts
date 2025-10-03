import { groq } from 'next-sanity'

export const ARTICLES_LIST = groq`
*[_type == "article"] | order(coalesce(publishedAt, _updatedAt) desc)[0...12]{
  _id,
  "title": coalesce(aiFinal.title, title),
  "slug": slug.current,
  "excerpt": coalesce(aiFinal.excerpt, excerpt),
  leadImageUrl,
  canonicalUrl,
  publishedAt,
  // Approximate characters available for reading; externalHtml is a proxy for content length when present
  "readingChars": length(coalesce(aiFinal.body, externalText, externalHtml, excerpt, title, "")),
  source->{name, url},
  tags[]->{_id, name, "slug": slug.current}
}`

export const ARTICLES_LIST_PUBLISHED = groq`
*[_type == "article" && !(_id in path('drafts.**'))] | order(coalesce(publishedAt, _updatedAt) desc)[0...12]{
  _id,
  "title": coalesce(aiFinal.title, title),
  "slug": slug.current,
  "excerpt": coalesce(aiFinal.excerpt, excerpt),
  leadImageUrl,
  canonicalUrl,
  publishedAt,
  "readingChars": length(coalesce(aiFinal.body, externalText, externalHtml, excerpt, title, "")),
  source->{name, url},
  tags[]->{_id, name, "slug": slug.current}
}`

export const ARTICLE_BY_SLUG = groq`
*[_type == "article" && slug.current == $slug][0]{
  _id,
  "title": coalesce(aiFinal.title, title),
  "slug": slug.current,
  "excerpt": coalesce(aiFinal.excerpt, excerpt),
  body,
  externalHtml,
  leadImageUrl,
  mediaCredits,
  canonicalUrl,
  publishedAt,
  "updatedAt": _updatedAt,
  authors,
  timestampText,
  "aiBody": aiFinal.body,
  "aiCreatedAt": aiFinal.createdAt,
  source->{name, url, license},
  tags[]->{_id, name, "slug": slug.current}
}`

export const ARTICLE_BY_SLUG_PUBLISHED = groq`
*[_type == "article" && slug.current == $slug && !(_id in path('drafts.**'))][0]{
  _id,
  "title": coalesce(aiFinal.title, title),
  "slug": slug.current,
  "excerpt": coalesce(aiFinal.excerpt, excerpt),
  body,
  externalHtml,
  leadImageUrl,
  mediaCredits,
  canonicalUrl,
  publishedAt,
  "updatedAt": _updatedAt,
  authors,
  timestampText,
  "aiBody": aiFinal.body,
  "aiCreatedAt": aiFinal.createdAt,
  source->{name, url, license},
  tags[]->{_id, name, "slug": slug.current}
}`

export const ARTICLES_PAGINATED = groq`
{
  "items": *[_type == "article" && publishedAt >= $start && publishedAt < $end]
    | order(coalesce(publishedAt, _updatedAt) desc)[$offset...$to]{
      _id,
      "title": coalesce(aiFinal.title, title),
      "slug": slug.current,
      "excerpt": coalesce(aiFinal.excerpt, excerpt),
      leadImageUrl,
      canonicalUrl,
      publishedAt,
      "updatedAt": _updatedAt,
      "readingChars": length(coalesce(aiFinal.body, externalText, externalHtml, excerpt, title, "")),
      source->{name, url},
      tags[]->{_id, name, "slug": slug.current}
    },
  "total": count(*[_type == "article" && publishedAt >= $start && publishedAt < $end])
}`

export const ARTICLES_PAGINATED_PUBLISHED = groq`
{
  "items": *[_type == "article" && !(_id in path('drafts.**')) && publishedAt >= $start && publishedAt < $end]
    | order(coalesce(publishedAt, _updatedAt) desc)[$offset...$to]{
      _id,
      "title": coalesce(aiFinal.title, title),
      "slug": slug.current,
      "excerpt": coalesce(aiFinal.excerpt, excerpt),
      leadImageUrl,
      canonicalUrl,
      publishedAt,
      "updatedAt": _updatedAt,
      "readingChars": length(coalesce(aiFinal.body, externalText, externalHtml, excerpt, title, "")),
      source->{name, url},
      tags[]->{_id, name, "slug": slug.current}
    },
  "total": count(*[_type == "article" && !(_id in path('drafts.**')) && publishedAt >= $start && publishedAt < $end])
}`

export const ARTICLES_DATES = groq`
*[_type == "article" && defined(publishedAt)] | order(publishedAt desc)[0...400]{ publishedAt }`

export const ARTICLES_DATES_PUBLISHED = groq`
*[_type == "article" && !(_id in path('drafts.**')) && defined(publishedAt)] | order(publishedAt desc)[0...400]{ publishedAt }`

export const ARTICLES_SITEMAP = groq`
*[_type == "article" && !(_id in path('drafts.**')) && defined(slug.current)] | order(coalesce(publishedAt, _updatedAt) desc)[0...500]{
  "slug": slug.current,
  publishedAt,
  _updatedAt
}`
