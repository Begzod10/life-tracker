import type { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
    return {
        name: 'Life Tracker',
        short_name: 'LifeTracker',
        description: 'Comprehensive self-improvement tracking platform',
        start_url: '/platform',
        display: 'standalone',
        background_color: '#0d0d1a',
        theme_color: '#6366f1',
        orientation: 'portrait',
        icons: [
            {
                src: '/icons/icon-192.svg',
                sizes: '192x192',
                type: 'image/svg+xml',
                purpose: 'maskable',
            },
            {
                src: '/icons/icon-512.svg',
                sizes: '512x512',
                type: 'image/svg+xml',
                purpose: 'maskable',
            },
        ],
    }
}
