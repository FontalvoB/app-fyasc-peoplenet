/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/vanillajs" />

/** Variables de entorno disponibles en la app (definidas en .env.[mode] o inyectadas por CI). */
interface ImportMetaEnv {
  /** Modo de la app: development | testflight | production. */
  readonly VITE_APP_ENV?: string;
  /** Base de la API: '/api' en web dev (proxy) o URL absoluta en builds nativos. */
  readonly VITE_API_BASE_URL?: string;
  /** Proveedor de mapas activo ('leaflet' | 'google'). Default: 'leaflet'. */
  readonly VITE_MAP_PROVIDER?: string;
  /** API key opcional para Google Maps JS API cuando VITE_MAP_PROVIDER='google'. */
  readonly VITE_GOOGLE_MAPS_API_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
