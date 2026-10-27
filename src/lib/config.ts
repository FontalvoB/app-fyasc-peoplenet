/**
 * Configuración central de entorno de la app (Vite + Capacitor).
 *
 * Prioridad de resolución de VITE_API_BASE_URL:
 *   1. Variable de entorno del proceso (CI: GitHub Actions vars) — gana siempre.
 *   2. .env.[mode] del proyecto (.env.development / .env.testflight / .env.production).
 *   3. Fallback '/api' (proxy de Vite en desarrollo web).
 *
 * Modos de build:
 *   - development  → `npm run dev` / `npm run build` (web + proxy Vite).
 *   - testflight   → `npm run build:testflight` (nativo iOS → TestFlight, backend DEV).
 *   - production   → `npm run build:production` (nativo iOS → App Store, backend PROD).
 *   - pwa          → `npm run build:pwa` (web instalable, backend same-origin vía
 *                    reverse proxy de IIS → '/api' relativa).
 */

import { Capacitor } from "@capacitor/core";

export type AppEnv = "development" | "testflight" | "production" | "pwa";

/** Modo de build actual (derivado del modo de Vite o default). */
export const APP_ENV: AppEnv = (
  import.meta.env.VITE_APP_ENV as AppEnv | undefined ?? "development"
);

/** Base de la API sin slash final ('/api' o 'https://host/api'). */
export const API_BASE_URL = (() => {
  const raw = (import.meta.env.VITE_API_BASE_URL ?? "/api").trim();
  return raw.endsWith("/") ? raw.slice(0, -1) : raw;
})();

/** ¿Corremos dentro del contenedor nativo (iOS/Android)? */
export const IS_NATIVE = Capacitor.isNativePlatform();

/**
 * En build nativo la base DEBE ser absoluta: en el dispositivo no existe el
 * proxy de Vite y una URL relativa como '/api' fallaría en todas las llamadas.
 * Se valida al arrancar para fallar de forma visible, no en cada request.
 */
if (IS_NATIVE && API_BASE_URL.startsWith("/")) {
  console.error(
    `[config] ERROR de configuración: build nativo (${APP_ENV}) con ` +
      `VITE_API_BASE_URL relativa '${API_BASE_URL}'. En el dispositivo no hay ` +
      "proxy de Vite; define la URL absoluta del backend en el pipeline " +
      "(GitHub Actions vars) o en .env." ,
  );
}

/** Identificación de build para soporte/diagnóstico (opcional en pantalla). */
export const BUILD_INFO = {
  env: APP_ENV,
  native: IS_NATIVE,
  apiBaseUrl: API_BASE_URL,
} as const;
