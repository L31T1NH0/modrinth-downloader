import type { MetadataRoute } from 'next';

const BASE = 'https://dynrinth.vercel.app';

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: BASE,           lastModified: new Date(), changeFrequency: 'weekly', priority: 1 },
    { url: `${BASE}/install`, lastModified: new Date(), changeFrequency: 'monthly', priority: 0.8 },
    { url: `${BASE}/rankings`, lastModified: new Date(), changeFrequency: 'daily',  priority: 0.6 },
  ];
}
