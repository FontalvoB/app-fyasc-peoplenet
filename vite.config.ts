import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    /**
     * PWA instalable (reemplaza la distribución por tiendas).
     * - Manifest con íconos de marca (public/pwa-*.png, generados con
     *   scripts/generate-pwa-icons.mjs).
     * - Service worker con autoUpdate: precachea el shell de la app para
     *   arranque/offline instantáneo; la API (/api) NUNCA se cachea.
     * - MaterialSymbolsOutlined.ttf (10 MB) va por runtime CacheFirst en
     *   lugar de precache, para no encarecer el primer arranque.
     */
    VitePWA({
      registerType: 'autoUpdate',
      // public/ completo ya cae en precache vía globPatterns (íconos, imágenes,
      // fuentes de texto); no se necesita includeAssets extra.
      manifest: {
        id: '/',
        name: 'PeopleNet — Tu espacio para crecer',
        short_name: 'PeopleNet',
        description:
          'Plataforma privada de FYA Social Capital para evaluación, reconocimientos y desarrollo de colaboradores.',
        lang: 'es',
        dir: 'ltr',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#0b3e8f',
        theme_color: '#045C94',
        categories: ['business', 'productivity'],
        icons: [
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          {
            src: 'maskable-192x192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'maskable',
          },
          {
            src: 'maskable-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        // Shell + assets del build y de public/ (íconos, imágenes y las dos
        // fuentes de texto). MaterialSymbols queda fuera por tamaño (10 MB).
        globPatterns: ['**/*.{js,css,html,svg,png,jpg,ico}', 'fonts/{DMSans,Manrope}.ttf'],
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
        // SPA con BrowserRouter: cualquier navegación sin archivo cae al shell.
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/api\//],
        runtimeCaching: [
          {
            // Fuente de símbolos pesada: primera visita la descarga, luego vive
            // en cache y la app sigue viéndose bien offline.
            urlPattern: /\/fonts\/MaterialSymbolsOutlined\.ttf$/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'material-symbols-font',
              expiration: { maxEntries: 2, maxAgeSeconds: 60 * 60 * 24 * 365 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
      devOptions: {
        enabled: false, // en dev no hay SW (evita caches fantasma con HMR)
      },
    }),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    proxy: {
      // Igual que el web Angular (proxy.conf.json): /api sin quitar el prefijo
      // hacia kpis-ms. changeOrigin evita problemas de Host/VirtualHost.
      '/api': {
        target: 'http://localhost:8080',
        changeOrigin: true,
      },
    },
  },
})
