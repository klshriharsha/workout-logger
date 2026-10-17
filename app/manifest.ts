import type { MetadataRoute } from 'next'

// Installable so it can live on the home screen and open full-screen at the gym.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Workout Logger',
    short_name: 'Workouts',
    description: 'Plan your training days and log every set',
    start_url: '/',
    display: 'standalone',
    background_color: '#ffffff',
    theme_color: '#0f766e',
    icons: [
      {
        src: '/icons/icon.svg',
        sizes: 'any',
        type: 'image/svg+xml',
        purpose: 'any',
      },
      {
        src: '/apple-touch-icon.png',
        sizes: '180x180',
        type: 'image/png',
        purpose: 'any',
      },
    ],
  }
}
