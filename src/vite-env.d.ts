/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/vanillajs" />

/** Variables de entorno disponibles en la app (definidas en .env.[mode] o inyectadas por CI). */
interface ImportMetaEnv {
  /** Modo de la app: development | testflight | production. */
  readonly VITE_APP_ENV?: string;
  /** Base de la API: '/api' en web dev (proxy) o URL absoluta en builds nativos. */
  readonly VITE_API_BASE_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
