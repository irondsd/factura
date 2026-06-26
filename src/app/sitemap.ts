import type { MetadataRoute } from 'next'
import { siteUrl } from '../config/meta'

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date()

  // Only genuinely public, logged-out-visible pages belong here. The
  // authenticated app (everything under /app) is disallowed in robots.ts. Add
  // public marketing routes here as they ship.
  return [
    {
      url: siteUrl,
      lastModified: now,
      changeFrequency: 'weekly',
      priority: 1,
    },
    {
      url: `${siteUrl}/docs`,
      lastModified: now,
      changeFrequency: 'weekly',
      priority: 0.8,
    },
    {
      url: `${siteUrl}/faq`,
      lastModified: now,
      changeFrequency: 'weekly',
      priority: 0.8,
    },
    ...['/demo', '/demo/insights', '/demo/bills'].map((path) => ({
      url: `${siteUrl}${path}`,
      lastModified: now,
      changeFrequency: 'weekly' as const,
      priority: 0.8,
    })),
  ]
}
