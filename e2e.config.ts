import type { E2EConfig } from 'e2e';
import { web } from '@e2e-dev/web';
import { randomUUID } from 'node:crypto';

// Tests e2e deterministas (locators + assertions). Sin `agents`: no se necesita
// modelo. Si luego se añaden pasos agent.act, definir `agents.default` con un
// proveedor (doc: e2e.tester.army/docs/models).
const app = {
  // Vite dev server ( puerto 5173 por defecto). Su proxy /api apunta a kpis-ms :8080.
  // Para probar la app de Capacitor compilada a APK/simulator, apuntar APP_URL a
  // la build servida (p. ej. vite preview) o usar @e2e-dev/mobile con un emulador.
  url: process.env.APP_URL ?? 'http://localhost:5173',
  command: {
    executable: 'node',
    args: ['node_modules/vite/bin/vite.js'],
    reuseExisting: true,
    log: '.e2e/logs/app.log',
    startupTimeout: 120000,
  },
};

export default {
  // Valores desechables para las rutas simuladas; nunca credenciales reales.
  secrets: { recoveryPassword: randomUUID(), recoveryOtherPassword: randomUUID(), recoveryCode: randomUUID() },
  targets: [
    { name: 'desktop', engine: web(), app },
    // La app es móvil (Ionic/Capacitor): mismo suite a tamaño de teléfono.
    { name: 'phone', engine: web({ viewport: { width: 390, height: 844 } }), app },
  ],
} satisfies E2EConfig;
