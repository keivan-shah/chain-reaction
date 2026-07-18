import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
    plugins: [
        VitePWA({
            registerType: 'autoUpdate',
            injectRegister: false, // we register manually in src/pwa.js (adds update checks)
            includeAssets: ['favicon.ico', 'apple-touch-icon.png', 'mask-icon.svg'],
            workbox: {
                // precache the app shell + assets; fall back to index.html for any
                // in-scope navigation so deep links / installed launches work offline
                globPatterns: ['**/*.{js,css,html,woff2,png,svg,ico}'],
                navigateFallback: 'index.html',
                cleanupOutdatedCaches: true,
            },
            manifest: {
                id: './', // relative so identity stays inside the GitHub Pages subpath/scope
                name: 'Chain Reaction',
                short_name: 'Chain Reaction',
                description: 'Local multiplayer & vs-CPU chain reaction game — install and play offline.',
                display: 'standalone',
                orientation: 'portrait',
                background_color: '#08080f',
                theme_color: '#08080f',
                lang: 'en',
                categories: ['games'],
                start_url: './',
                scope: './',
                icons: [
                    {
                        src: 'android-chrome-192x192.png',
                        sizes: '192x192',
                        type: 'image/png',
                        purpose: 'any'
                    },
                    {
                        src: 'android-chrome-512x512.png',
                        sizes: '512x512',
                        type: 'image/png',
                        purpose: 'any'
                    },
                    {
                        src: 'android-chrome-512x512.png',
                        sizes: '512x512',
                        type: 'image/png',
                        purpose: 'maskable'
                    }
                ]
            }
        })
    ],
    base: './' // For GitHub Pages compatibility
});