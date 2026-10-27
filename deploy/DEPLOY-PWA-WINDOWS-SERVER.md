# DEPLOY-PWA-WINDOWS-SERVER.md — PWA PeopleNet en app.fyasc.com.co (IIS)

Guía para montar la PWA de PeopleNet (`app-fyasc-peoplenet`) como **web instalable**
en el Windows Server donde ya corre `people.fyasc.com.co` (Angular + kpis-ms Spring).

**Por qué reemplaza a las tiendas:** plataforma privada → sin App Store/Play,
sin revisiones, sin builds nativos. Se instala desde el navegador con el ícono
"Instalar app" (Chrome/Edge/Android) o "Añadir a pantalla de inicio" (iOS Safari).
El contenedor nativo (`android/`, `ios/`, Capacitor) queda intacto por si algún
día se reactiva; el deploy PWA no lo toca.

## 0. Arquitectura objetivo

```
                         ┌─────────────────────────────── Windows Server ───────────────────────────────┐
Usuario (móvil/PC)       │  IIS                                                                          │
  PWA instalada  ──HTTPS──►  Sitio app.fyasc.com.co (C:\inetpub\peoplenet-pwa)                          │
  people.fyasc.com.co ────►  Sitio people.fyasc.com.co (Angular admin, ya montado)                      │
        │                │       │  reverse proxy (ARR)                                                    │
        │                │       ▼                                                                         │
        └──/api/*────────────►  http://localhost:8080/api/...  (kpis-ms Spring, context-path /api)        │
                         └───────────────────────────────────────────────────────────────────────────────┘
```

**Clave anti-WAF:** la PWA llama a `/api` en el MISMO origen (`app.fyasc.com.co/api`)
y IIS lo enruta internamente al backend. Desde el navegador no existe CORS →
no existe preflight OPTIONS → la regla del WAF que bloqueaba preflights
(Attack ID 20000001) queda fuera de la ecuación. El JWT viaja por header
`Authorization` (la app no usa cookies), así que el proxy no necesita reescrituras.

## 1. Requisitos previos en el server

| Componente | Para qué |
|---|---|
| IIS 10 (ya está) | Servir el sitio estático |
| **URL Rewrite 2.1** | SPA fallback + regla del proxy |
| **ARR 3.0** (Application Request Routing) | Reverse proxy de `/api` al backend |
| Certificado TLS para `app.fyasc.com.co` | PWA exige HTTPS (service worker no funciona sin él) |
| El build `dist/` (se genera en tu PC, no hace falta Node en el server) | Contenido del sitio |

Instalación con Web Platform Installer o descarga directa:
- URL Rewrite: `https://www.iis.net/downloads/microsoft/url-rewrite`
- ARR: `https://www.iis.net/downloads/microsoft/application-request-routing`
(si `people.fyasc.com.co` ya sirve su `/api` vía ARR, ambos módulos ya están).

## 2. Paso 1 — DNS

En el panel del dominio `fyasc.com.co` (o Cloudflare si el DNS vive ahí):

1. Crear registro **A**: `app` → IP pública del Windows Server (la misma de `people`).
2. **Si usas Cloudflare con proxy naranja:** ponlo en naranja y SSL/TLS en
   **Full (strict)**. El edge acepta el cert de origen y habla HTTPS con IIS.
   Si el WAF/CDN cachea por defecto, esto no afecta `/api` (se excluye abajo).

Verificación (desde tu PC): `nslookup app.fyasc.com.co`

## 3. Paso 2 — Certificado TLS

Opción A (recomendada, gratis y automática) — **win-acme** en el server:

```powershell
# Descargar win-acme en C:\tools\win-acme y ejecutar:
C:\tools\win-acme\wacs.exe --source manual --host app.fyasc.com.co ^
  --validation filesystem --webroot C:\inetpub\wwwroot ^
  --store certificatestore --installation iis
```
(crear antes el sitio IIS del paso 5 con binding HTTP para que la validación
HTTP-01 responda; win-acme deja renovación automática programada).

Opción B — **cert origin de Cloudflare** (si DNS en Cloudflare): crear cert de
origen para `app.fyasc.com.co`, importar a IIS (Certificados), usarlo en el binding.

Opción C — cert comercial wildcard `*.fyasc.com.co` ya existente si lo cubre.

## 4. Paso 3 — ARR: habilitar el proxy (una sola vez)

Abrir **IIS Manager** → seleccionar el **nodo del servidor** (no un sitio) →
**Application Request Routing Cache** → **Server Proxy Settings**:

- ✅ **Enable proxy**
- ✅ Keep alive
- **Time-out (segundos):** `600` — el upload masivo de empleados puede tardar
  (el proxy del Angular usa 300 s; aquí dejamos margen)

O equivalente en `applicationHost.config`:
```xml
<proxy enabled="true" keepAlive="true" timeout="00:10:00" />
```

## 5. Paso 4 — Publicar el build

En tu PC (o en CI):

```bash
cd app-fyasc-peoplenet
npm run build:pwa          # dist/ con manifest + sw.js + íconos
```

Llevar `dist/*` al server, p. ej. a `C:\inetpub\peoplenet-pwa`, y **copiar
`deploy\web.config` a la raíz de esa carpeta** (queda junto a `index.html`).

Con el script incluido (`scripts/deploy-pwa.ps1`), desde el server o apuntando
a una ruta compartida:
```powershell
.\scripts\deploy-pwa.ps1 -SiteRoot 'C:\inetpub\peoplenet-pwa'   # build + copia
.\scripts\deploy-pwa.ps1 -SiteRoot '\\SERVER\c$\inetpub\peoplenet-pwa' -NoBuild
```

## 6. Paso 5 — Sitio IIS

```powershell
Import-Module WebAdministration
New-WebAppPool -Name 'peoplenet-pwa'
Set-ItemProperty IIS:\AppPools\peoplenet-pwa -Name managedRuntimeVersion -Value ''
# 'No Managed Code' (sitio 100% estático)
New-Website -Name 'peoplenet-pwa' -PhysicalPath 'C:\inetpub\peoplenet-pwa' `
  -ApplicationPool 'peoplenet-pwa' -HostHeader 'app.fyasc.com.co' -Port 80
New-WebBinding   -Name 'peoplenet-pwa' -HostHeader 'app.fyasc.com.co' -Port 443 -Protocol https -SslFlags 1
# asignar el cert del paso 2 al binding 443 de este host
(Get-WebBinding -Name 'peoplenet-pwa' -Port 443).AddSslCertificate('<thumbprint>','my')
Start-Website 'peoplenet-pwa'
```
Regla del pool: **No Managed Code**, identidad por defecto (`ApplicationPoolIdentity`)
con lectura sobre la carpeta. El backend NO requiere cambios: same-origin no
dispara CORS (no hay que tocar `APP_CORS_ALLOWED_ORIGINS`).

## 7. Paso 6 — Ajustes finales

1. **Compresión** (nivel server, IIS Manager → nodo server → Compression):
   ✅ Enable static + dynamic compression (el JS principal baja de 448 KB a ~141 KB).
2. **HTTP/2**: en un server 2016+ con IIS 10 ya viene activo sobre HTTPS.
3. Firewall: el binding 443 del sitio usa el puerto ya abierto para `people`.

## 8. Paso 7 — Verificación end-to-end

```powershell
# Shell y PWA
curl.exe -sI https://app.fyasc.com.co/                      # 200, Content-Type text/html
curl.exe -sI https://app.fyasc.com.co/manifest.webmanifest  # 200, application/manifest+json
curl.exe -sI https://app.fyasc.com.co/sw.js                 # 200 + Cache-Control: max-age=0, no-cache
curl.exe -sI https://app.fyasc.com.co/api/actuator/health   # 200 desde el backend (vía proxy)
```

En el navegador (Chrome/Edge → DevTools):
1. `https://app.fyasc.com.co` → login carga.
2. **Application → Manifest**: íconos 192/512 visibles, "Installability: installable".
3. **Application → Service Workers**: `sw.js` activated and running.
4. Login con un usuario real → dashboard carga (las llamadas a `/api/...` son
   same-origin, sin preflight en Network).
5. DevTools → Network → Offline → recargar: la app sigue abriendo (precache).

## 9. Paso 8 — WAF (`fyasc.com.co` / Cloudflare)

Con el diseño same-origin, el navegador **nunca** envía preflight al WAF:

1. **No cachear `/api/*`** (Cache Rules → Bypass cache para `app.fyasc.com.co/api/*`).
2. Reglas de rate-limit en `/api/*`: same rate que ya aplica a `people.fyasc.com.co`.
3. Si una regla gestionada marca el `POST /api/auth/login` como SQLi/XSS (raro,
   pero pasa con payloads JSON), excluir por path: `app.fyasc.com.co/api/auth/*`.
4. El service worker (`sw.js`) y el manifest deben salir sin alteraciones —
   el WAF no cachea HTML/JS por defecto salvo reglas custom.

## 10. Publicar actualizaciones

`npm run build:pwa` + copiar `dist/` al server (script del paso 5). Los usuarios
con la app abierta reciben el nuevo SW en su próxima visita (`autoUpdate`: se
activa solo, sin banners). No hay "versiones de tienda": publicar = copiar.

## 11. Rollback

Mantener en el server `C:\inetpub\releases\pwa\<fecha>\` cada `dist/` publicado
(y su `web.config`). Rollback = re-apuntar la carpeta del sitio (o copiar encima).
Por ser estático, el revert es instantáneo; el SW nuevo llega en la próxima visita.

## 12. Plan B — PWA sin ARR (cross-origin directo al API)

Solo si no pueden instalar ARR: build con `VITE_API_BASE_URL=https://peoplenet.info/api`
(crear `.env.pwa` alternativo) y entonces SÍ hay CORS:

1. En el backend, añadir el origen: `APP_CORS_ALLOWED_ORIGINS=...,https://app.fyasc.com.co`
   (Spring `SecurityConfig`/allowlist, ver `DEPLOY.md` §1c del repo de la app).
2. El preflight OPTIONS debe pasar el WAF: si lo bloquea (500 / Attack ID
   20000001), añadir excepción de reglas para `peoplenet.info/api` + método OPTIONS.
3. Rechazado por diseño: vuelve a existir el problema del preflight que motivó
   `CapacitorHttp`. Por eso el Plan A (proxy same-origin) es el recomendado.

## 13. Instalación para los usuarios finales

- **Android (Chrome) / Windows (Chrome, Edge):** al abrir la app aparece el
  banner/ícono "Instalar PeopleNet" (o menú ⋮ → Instalar). Queda con ícono de
  marca, pantalla propia, sin barra del navegador.
- **iOS (Safari):** Compartir → "Añadir a pantalla de inicio" (requiere iOS 16.4+
  para notificaciones push; instalación básica funciona desde iOS 11.3+).
- La app arranca offline con el shell precacheado; los datos (KPIs, solicitudes,
  evaluaciones) requieren conexión: la API nunca se cachea.

## 14. Troubleshooting rápido

| Síntoma | Causa probable | Fix |
|---|---|---|
| 500.19 al arrancar el sitio | `<remove>` de un MIME que no existe en ese server | quitar las líneas `<remove>`/`<mimeMap>` duplicadas del `web.config` |
| 404.19/404.3 en `.webmanifest` | MIME no registrado | ya cubierto por `web.config`; verificar que esté en la carpeta publicada |
| 502.3 en `/api/...` | ARR proxy deshabilitado o backend caído | habilitar proxy (paso 4) / revisar servicio kpis-ms en `:8080` |
| `/dashboard/kpis` da 404 en deep link | regla SPA fallback no activa | verificar módulo URL Rewrite instalado |
| Login OK en navegador, no en app instalada | SW cache viejo tras cambiar el backend de dominio | DevTools → Application → Clear storage; el autoUpdate lo resuelve solo en visitas futuras |
| Service worker no registra | sitio servido por HTTP sin TLS | completar paso 2 (HTTPS es obligatorio) |
