import type { MetadataRoute } from 'next';

import { PRODUITS_VITRINE } from '@/lib/commerce/catalogue';

const BASE = (process.env.NEXT_PUBLIC_SITE_URL ?? 'https://elembo.vercel.app').replace(/\/+$/, '');

const ROUTES = [
  { path: '/', priority: 1 },
  { path: '/boutique', priority: 0.9 },
  { path: '/personnalisation', priority: 0.9 },
  { path: '/impression', priority: 0.8 },
  { path: '/entreprises', priority: 0.8 },
  { path: '/devis', priority: 0.8 },
  { path: '/tableau', priority: 0.7 },
  { path: '/comment-ca-marche', priority: 0.6 },
  { path: '/contact', priority: 0.6 },
  ...PRODUITS_VITRINE.filter((p) => p.famille === 'textile').map((p) => ({
    path: `/textile/${p.id}`,
    priority: 0.7,
  })),
];

export default function sitemap(): MetadataRoute.Sitemap {
  return ROUTES.map((route) => ({
    url: `${BASE}${route.path}`,
    lastModified: new Date(),
    changeFrequency: route.path === '/' ? 'weekly' : 'monthly',
    priority: route.priority,
  }));
}
