# DEPLOY.md — Autodespliegue iOS (TestFlight / App Store) — PeopleNet mobile

Arquitectura de entornos y CI/CD de `app-fyasc-peoplenet` (`com.fyasc.peoplenet`).
**Estado: CONFIGURADO, SIN ACTIVAR.** No se ha ejecutado ningún despliegue (el equipo
avisa cuándo arrancar; ver "Activación paso a paso" al final).

## 1. Mapa de entornos

| Rama | Trigger | Modo de build | Archivo env | Backend | Destino |
|---|---|---|---|---|---|
| `develop` | push (src/, ios/, configs) | `testflight` | `.env.testflight` | **DEV** (absoluta, CI var) | **TestFlight** (QA externa) |
| `main` | push (src/, ios/, configs) | `production` | `.env.production` | **PROD** `https://peoplenet.info/api` | **App Store Connect** (publicación MANUAL) |
| local | `npm run dev` / `npm run build` | `development` | `.env.development` | `/api` → proxy Vite → `localhost:8080` | — |
| `develop` | push (src/, android/, configs) | `production`* | `.env.production` | **PROD** `https://peoplenet.info/api` | **Google Play — Prueba interna** (auto) |
| `main` | push (src/, android/, configs) | `production` | `.env.production` | **PROD** `https://peoplenet.info/api` | **Google Play — Prueba interna** (auto) |

*Android develop usa `production` temporalmente: no hay backend DEV desplegado y
un build con backend placeholder rompería la app instalada. Cuando exista, cambiar
`mode: testflight` en `.github/workflows/android-internal.yml`.

## 1c. CORS requerido en el backend (Spring `people-net-back`)

El allowlist se define con la variable `APP_CORS_ALLOWED_ORIGINS`
(`app.cors.allowed-origins`, binding relaxed; default en `SecurityConfig.java`).

| Origen | Cuándo hace falta |
|---|---|
| `https://peoplenet.info` | Web de producción |
| `https://*.peoplenet.info` (subdominios de la web admin) | Web admin |
| `http://localhost:4200`, `http://127.0.0.1:4200` | Web dev (Angular) |
| `http://localhost:5173` | Vite dev del móvil |
| `capacitor://localhost` | **App nativa iOS — TestFlight / App Store (obligatorio)** |
| `https://localhost` | **App nativa Android (obligatorio, `androidScheme: https`)** |

Notas:
- Con `CapacitorHttp: { enabled: true }`, POST/PUT van por URLSession nativo y **no
  pasan por CORS**; los GET salen del scheme handler de WKWebView con origen
  `capacitor://localhost` y **sí** lo pasan → ese origen debe estar en el allowlist.
- El WAF de peoplenet.info bloqueaba el preflight con 500 (Attack ID 20000001) —
  con CapacitorHttp activo el preflight desaparece; si se desactiva, revisar reglas WAF.
- Nunca `*`: el backend usa `allowCredentials=true`.

Ejemplo para el entorno que recibe TestFlight (backend):
```bash
export APP_CORS_ALLOWED_ORIGINS="https://peoplenet.info,http://localhost:4200,http://127.0.0.1:4200,http://localhost:5173,capacitor://localhost,https://localhost"
```

## 1b. Android (Google Play) — pipeline

- `.github/workflows/android-release.yml` — reusable: npm ci → build web → cap sync →
  firma (keystore de secrets) → versionCode = `3000000 + run_number` → `bundleRelease` →
  `scripts/play_publish.py` (REST puro, impersonación ADC de la SA
  `play-publisher-net@peoplenet-510915.iam.gserviceaccount.com`) → pista indicada.
- `.github/workflows/android.yml` — push a `develop`/`main` → pista internal (auto).
- `.github/workflows/android-closed.yml` — manual → pista closed (prueba cerrada).
- `.github/workflows/android-prod.yml` — manual → pista production (draft por defecto;
  lanzar desde consola). Guía completa: `docs/PLAY-STORE-PUBLICACION.md`.
- Publicación de prueba interna: instantánea, sin revisión de Google.
- Notas de release: `android/app/src/main/play/release-notes/{es-419,en-US}/internal.txt`.
- Detalle técnico: `docs/PLAY-CLI-DEPLOY.md`.
- Secrets Android (GitHub): `KEYSTORE_BASE64`, `PEOPLENET_STORE_PASSWORD`,
  `PEOPLENET_KEY_PASSWORD`, `GOOGLE_ADC_JSON` (ADC authorized_user con refresh token
  de la cuenta propietaria — revocable con `gcloud auth application-default revoke`).
- Regla de versionCode: contador global único — `3.000.000 + run_number` para todas
  las pistas (android.yml, android-closed.yml y android-prod.yml comparten el grupo
  de concurrencia `android-play` → monotónico sin colisiones). Builds locales:
  bump manual por encima del último code usado en Play.

Regla de oro: la URL de la API **nunca** se hardcodea en el código — se resuelve en
`src/lib/config.ts` con prioridad: variable de CI > `.env.[mode]` > fallback `/api`.
En build nativo la URL debe ser ABSOLUTA (no existe el proxy de Vite en el dispositivo);
`config.ts` emite error visible si un build nativo lleva URL relativa.

### Scripts de build (`package.json`)
- `npm run dev` — web dev con proxy.
- `npm run build` — web/build dev (mode development).
- `npm run build:testflight` — mode testflight (URL dev embebida).
- `npm run build:production` — mode production (URL prod embebida).

Verificado: cada modo inyecta su URL correcta en `dist/assets/index-*.js`.

## 2. Workflows (GitHub Actions)

- `.github/workflows/ios-release.yml` — reutilizable (workflow_call): npm ci → build web
  con mode → `npx cap add ios` (si falta) → `npx cap sync ios` → perfil + cert en llavero
  efímero → API key materializada → `agvtool` build number (100 + run_number) →
  `xcodebuild archive` (CODE_SIGNING_ALLOWED=NO) → `exportArchive` (firma automática con
  ASC API key — el perfil es Xcode-managed) → `altool` upload → artefacto IPA.
  Runner: `macos-26` (Apple exige SDK iOS 26+ / Xcode 26 para subir a ASC).
- `.github/workflows/testflight.yml` — push a `develop` → build `testflight`.
- `.github/workflows/appstore.yml` — push a `main` → build `production` (sin auto-publicar).
- `.github/workflows/appstore-submit.yml` — manual: envía v1.0 a revisión (fastlane deliver).

Firma (rediseño 2026-10-08): la firma automática ORIGINAL mintía certificados nuevos por
run y Apple los rechazó (límite agotado: "current Development certificate or a pending
certificate request"). Ahora es determinística: secrets `APPLE_DIST_P12_BASE64` +
`APPLE_DIST_P12_PASSWORD` (Apple Distribution 5C50BFA6, team XZSSM34MU6) y
`APPLE_DIST_PROFILE_BASE64` (perfil App Store de com.fyasc.peoplenet, expira 2027-10-02).
Llavero efímero en el runner + archive sin firmar + export automático con API key.
Cero certificados creados por run.
✔ Pipeline verde: **v1.0 build 116 subido a ASC el 2026-10-08** (run 37827671173).

Historia 2026-10-07: primer build (v1.0.0 build 1) subido manualmente desde Mac
local (Xcode 27) con altool → TestFlight VALID (Delivery UUID 2ee72748).

## 3. Secrets a configurar en GitHub (Settings → Secrets and variables → Actions)

### Secrets (OBLIGATORIOS para que el pipeline funcione)
| Secret | Qué es | Cómo obtenerlo |
|---|---|---|
| `ASC_KEY_ID` | ID de la API key de App Store Connect | App Store Connect → Users and Access → Integrations → App Store Connect API → Team Keys → generar key (rol **App Manager** mínimo) |
| `ASC_ISSUER_ID` | Issuer ID (arriba de la lista de keys) | Misma página |
| `ASC_KEY_P8_BASE64` | Contenido del archivo `.p8` **en base64** | `base64 -i AuthKey_XXXX.p8 \| pbcopy` (mac) o `certutil -encode` (win) |
| `ASC_APP_ID` | App ID numérico en ASC | ASC → App Details → Apple ID (ej. `6819857478`) |
| `APPLE_TEAM_ID` | Team ID de Apple Developer | Membership details (ej. `XZSSM34MU6`) |

✅ Configurados 2026-10-07: ASC_KEY_ID (7CHJDBN598 "fyasc-ci"), ASC_ISSUER_ID,
ASC_KEY_P8_BASE64, ASC_APP_ID (6819857478), APPLE_TEAM_ID.

### Secrets ya NO requeridos (firma sin match)
~~`MATCH_GIT_URL`, `MATCH_PASSWORD`, `KEYCHAIN_PASSWORD`~~ — el pipeline firma con
la API key vía xcodebuild; match solo para el flujo manual del Fastfile.

### Variables (no secretas)
| Var | Valor | Nota |
|---|---|---|
| `VITE_API_BASE_URL_TESTFLIGHT` | `https://peoplenet.info/api` | TestFlight apunta a PROD (no existe backend dev desplegado) |
| `VITE_API_BASE_URL_PRODUCTION` | `https://peoplenet.info/api` | Backend prod verificado 2026-10-07 (cert TLS válido hasta mar 2027) |

## 4. Bloqueadores y pendientes

1. ~~Certificado TLS de producción expirado~~ ✅ RESUELTO 2026-10-07: el host prod
   real es `https://peoplenet.info` (cert Let's Encrypt válido hasta 2027-03-18).
   `tech.peoplenet.info` quedó deprecado (caído + cert expirado).
2. ~~CORS del backend prod~~ ✅ RESUELTO (verificado 2026-10-08): el preflight desde
   `https://localhost` (scheme Android) y `capacitor://localhost` responde con
   `Access-Control-Allow-Origin` correcto en `https://peoplenet.info/api`.
3. ~~Proyecto iOS no generado~~ ✅ RESUELTO: `ios/App/App.xcodeproj` commiteado
   (commit e3bb29b); workflow ya no regenera (check path corregido).
4. ~~match primera vez~~ ⛔ OBSOLETO: la firma por match fue reemplazada por
   firma automática con API key (ver §2).
5. ~~App Store Connect: crear la app~~ ✅ RESUELTO: PeopleNet ya existe
   (ASC App ID numérico `6819857478`, SKU `peoplenet-ios-001`).
6. ~~Android (Play Store)~~ ✅ ACTIVO (2026-10-08): pipeline android.yml publicando en
   pista internal vía API de Play. Guía de primera versión en producción:
   `docs/PLAY-STORE-PUBLICACION.md`. Pendiente bloqueante: política de privacidad
   en URL real + App content + listing completo (ver doc, §1).
7. **App Store v1.0 — envío a revisión**: checklist, pendientes y flujo exacto en
   `docs/appstore/CHECKLIST-SUBMIT.md`. Metadata de la tienda en
   `fastlane/metadata/` (es-419 + en-US); envío a revisión vía workflow
   `appstore-submit.yml` (fastlane deliver, publicación manual tras aprobación).
   Pendientes del checklist: cuenta demo App Review, URL privacy policy, contacto
   de revisión, screenshots 6.9" y one-time en ASC (age rating + App Privacy).

## 5. Activación paso a paso (CUANDO el equipo lo decida)

1. Configurar secrets + vars del §3 en GitHub.
2. Inicializar repo de certificados (única vez, desde un Mac): `fastlane match appstore`.
3. Registrar App ID `com.fyasc.peoplenet` en developer.apple.com.
4. Crear la rama `develop` del repo (si no existe) y hacer push — dispara TestFlight.
5. Verificar en Actions que el build subió y aparece en TestFlight (puede tardar
   5-15 min en procesamiento de Apple).
6. Para producción: push a `main` → build en ASC → **publicar manualmente**.

## 6. Rollback / diagnóstico

- Cada run deja artefacto IPA + `report.xml` (14 días) — descargable desde el run.
- Build number visible en TestFlight identifica el run (`100 + run_number`).
- Si match falla por certificado revocado: renovar certs en el repo de match (mac).
- Si el build web falla: correr localmente `npm run build:testflight` (mismo tsc).
