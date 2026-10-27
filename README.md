# PeopleNet Mobile

App móvil de recursos humanos construida con **Ionic + React + Vite + Capacitor**.

Incluye login, dashboard, KPIs, documentos, solicitudes de permisos, organigrama, notificaciones y perfil de usuario.

## Requisitos

- Node.js 18+
- npm

## Desarrollo (navegador)

```bash
npm install
npm run dev
```

Abre `http://localhost:5173` en el navegador.

## Build de producción

```bash
npm run build
npm run preview
```

## PWA instalable (producción)

La plataforma privada se distribuye como **PWA instalable** — sin App Store/Play:

```bash
npm run build:pwa     # dist/ con manifest.webmanifest + sw.js + íconos de marca
npm run icons:generate  # regenera íconos PWA desde el isotipo (requiere sharp)
```

Despliegue en IIS / Windows Server (`app.fyasc.com.co`, reverse proxy `/api` →
kpis-ms, sin CORS ni preflight del WAF): **`deploy/DEPLOY-PWA-WINDOWS-SERVER.md`**.

## App nativa con Capacitor

Para compilar en iOS o Android:

```bash
npm install @capacitor/core @capacitor/cli @capacitor/android @capacitor/ios
npx cap init
npm run build
npx cap add android   # o ios
npx cap sync
npx cap open android  # o ios
```

## Estructura

```
src/
├── components/     # Layout compartido (DashboardLayout)
├── lib/            # Datos mock
├── pages/          # Pantallas de la app
├── styles/         # Tailwind + estilos PeopleNet
└── theme/          # Variables Ionic (colores de marca)
```

## Demo

En login, usa cualquier correo y contraseña para entrar al dashboard.

## Nueva experiencia PeopleNet

La aplicación activa ahora está en `src/redesign/`, organizada por módulos. Los archivos anteriores de `src/pages/` y `src/components/` se conservaron para respetar los cambios locales existentes. `src/App.tsx` conecta el nuevo espacio con React Router; se mantiene la configuración de Vite y Capacitor.

- Login con acceso directo mediante **Explorar la demo**; también acepta un correo válido y cualquier contraseña de al menos cuatro caracteres. No existe autenticación real.
- Dashboard, indicadores por periodo con exportación CSV, solicitudes con revisión y validación de fechas, biblioteca con confirmación de lectura, organigrama/directorio, evaluaciones, certificados, notificaciones y perfil.
- Eva utiliza respuestas locales guiadas por tema; la autoevaluación tiene tres preguntas y conserva su resultado. No usa un proveedor de IA.
- Las solicitudes, lecturas, preferencias, perfil y resultados se guardan en `localStorage` bajo claves `pn-v2-*`. No hay llamadas a un backend. Los adjuntos conservan únicamente su nombre para la demostración.
- Los certificados permiten descargar texto o imprimir/guardar PDF desde el navegador. Están identificados como documentos de demostración sin validez oficial.
- Paleta principal preservada: azul `#045C94`, amarillo `#FFB71B`, azul oscuro `#213053`. Ilustraciones geométricas creadas con CSS. Fuentes DM Sans, Manrope e iconos Material Symbols desde Google Fonts.
- Diseño adaptable, navegación por teclado, diálogos nativos, estados vacíos, feedback de acciones y respeto a `prefers-reduced-motion`.

Para revisar: `npm run dev`, abrir `http://127.0.0.1:5173` (instancia actual) y seleccionar **Explorar la demo**. Para producción: `npm run build`. La validación realizada incluye compilación TypeScript/Vite y recorridos en navegador de solicitudes con persistencia tras recarga, lecturas, evaluaciones, certificados, filtros y vista móvil a 390 px. La compilación nativa Android/iOS no forma parte de esta validación.


### Iteración mobile-first: Vivid

La capa visual `src/redesign/vivid.css` amplía el diseño con azul profundo, amarillo de marca y superficies de mayor contraste. En móvil incluye navegación inferior animada, menú con control de foco, tarjetas de solicitudes (sin tabla horizontal), detalles en hojas inferiores, biblioteca ilustrada, lectura con tamaño ajustable y organigrama vertical. `Charts.tsx` implementa gráficos SVG adaptables: anillos de progreso, evolución con rangos de tres/seis meses y selección por mes mediante controles accesibles. Las animaciones de navegación usan Framer Motion y respetan movimiento reducido.

Validado en navegador a 320, 390, 430 y 1440 px: navegación, filtros, detalle de metas, cambio de rango/periodo, lectura ajustable, búsqueda de personas, generación de certificados, chat y validación de solicitudes. Los cambios conservan los flujos y datos locales anteriores.
