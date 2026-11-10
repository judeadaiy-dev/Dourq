import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'TeamHub — مساحة عمل الفريق',
    short_name: 'TeamHub',
    description: 'مساحة موحدة لمحادثات الفريق ومهامه وتواجده.',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    display_override: ['standalone', 'minimal-ui'],
    background_color: '#352f28',
    theme_color: '#352f28',
    lang: 'ar',
    dir: 'rtl',
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
    ]
  };
}
