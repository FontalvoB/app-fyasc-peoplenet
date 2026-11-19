import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig(({ mode }) => {
  if (mode === 'pwa') {
    // El deploy PWA es same-origin POR DISEÑO: '/api' relativa servida por el
    // reverse proxy de IIS del mismo sitio (sin CORS ni preflight).
    // Pin inmutable: config.ts da prioridad a la env var del PROCESO sobre
    // .env.pwa, así que una VITE_API_BASE_URL ambiental (p. ej. una var de
    // Machine heredada por el build en el server) se hornearía al bundle y
    // rompería el routing (cross-origin + IP local = bloqueo CORS/PNA de
    // Chrome). Si algún día la PWA se sirve en otro origen que la API,
    // cambiar este pin y el allowlist CORS del backend, no env vars sueltas.
    process.env.VITE_API_BASE_URL = '/api'
  }
  return {
  // Versión visible solo en el pie del login y en los ajustes de la app.
  define: {
    __APP_VERSION__: JSON.stringify(process.env.npm_package_version ?? '1.0.0'),
  },
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
      injectRegister: false,
      // 'prompt': la app avisa cuando hay un despliegue nuevo y el usuario
      // decide cuándo aplicar la actualización (no se recarga a media tarea).
      registerType: 'prompt',
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
        // Al abrir desde el icono instalado, reutiliza la ventana existente en
        // vez de crear otra pestaña (comportamiento de app nativa).
        launch_handler: { client_mode: 'navigate-existing' },
        // Atajos al mantener pulsado el icono de la app (Android/escritorio).
        shortcuts: [
          {
            name: 'Nueva solicitud',
            short_name: 'Solicitud',
            description: 'Radicar una solicitud de novedad o permiso',
            url: '/dashboard/requests/new',
            icons: [{ src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' }],
          },
          {
            name: 'Mis metas',
            short_name: 'Metas',
            description: 'Consultar tus KPIs y avances del período',
            url: '/dashboard/kpis',
            icons: [{ src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' }],
          },
          {
            name: 'Biblioteca',
            short_name: 'Documentos',
            description: 'Leer los documentos de tu organización',
            url: '/dashboard/documents',
            icons: [{ src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' }],
          },
          {
            name: 'Mi perfil',
            short_name: 'Perfil',
            description: 'Ver tu información y preferencias',
            url: '/dashboard/profile',
            icons: [{ src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' }],
          },
        ],
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
        // El SW nuevo espera a que el usuario confirme la actualización.
        skipWaiting: false,
        clientsClaim: true,
        cleanupOutdatedCaches: true,
        // Handler de notificationclick / push compartido (public/sw-extra.js).
        importScripts: ['sw-extra.js'],
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
        configure(proxy) {
          // Browser calls are same-origin to Vite. Do not forward its dev-only
          // Origin to Spring's production/native CORS allowlist.
          proxy.on('proxyReq', (request) => request.removeHeader('origin'))
        },
      },
    },
  },
  // `vite preview` no hereda el proxy de `server`: se declara aparte para
  // probar la build PWA real (SW + actualizaciones) contra un backend local o
  // remoto sin tocar el bundle de producción.
  preview: {
    proxy: {
      '/api': {
        target: process.env.PREVIEW_API_TARGET ?? 'http://localhost:8080',
        changeOrigin: true,
        secure: true,
        configure(proxy) {
          proxy.on('proxyReq', (request) => request.removeHeader('origin'))
        },
      },
    },
  },
  }
})
