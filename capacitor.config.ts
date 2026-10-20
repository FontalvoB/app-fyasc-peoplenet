import type { CapacitorConfig } from "@capacitor/cli";

/**
 * Configuración de Capacitor — PeopleNet (com.fyasc.peoplenet).
 *
 * La URL del backend NO se define aquí: se resuelve en build web
 * (src/lib/config.ts vía .env.[mode] / variables de CI). El contenedor
 * nativo sirve dist/ embebido y consume la API con URL absoluta.
 */
const config: CapacitorConfig = {
  appId: "com.fyasc.peoplenet",
  appName: "PeopleNet",
  webDir: "dist",
  // CapacitorHttp: en nativo, fetch/XHR se enrutan por el cliente HTTP nativo
  // (GET vía interceptor del scheme handler con binario intacto; POST/PUT vía
  // URLSession nativo). Elimina el preflight CORS, que el WAF de peoplenet.info
  // bloquea con 500 (Attack ID 20000001) y rompía el login de TestFlight.
  // Solo afecta a plataformas nativas; web dev/prod siguen con fetch normal.
  CapacitorHttp: { enabled: true },
  server: {
    // Esquema seguro en Android nativo: evita mixed-content al consumir
    // APIs https y habilita contextos seguros (fetch, storage).
    androidScheme: "https",
  },
  ios: {
    // Contenido embebido servido bajo el esquema seguro de Capacitor;
    // ATS exige TLS válido en las APIs remotas (cert de prod al día).
    // CSS owns safe-area padding; native insets would expose the WebView behind it.
    contentInset: "never",
    backgroundColor: "#0B3E8F",
  },
};

export default config;
