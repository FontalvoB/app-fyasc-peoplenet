# Checklist — Publicación App Store v1.0 (PeopleNet, com.fyasc.peoplenet)

**Objetivo:** primera versión 1.0 en revisión de Apple y publicación profesional.

## Pendientes críticos (bloquean el submit)

| # | Pendiente | Dónde | Estado |
|---|-----------|-------|--------|
| 1 | **Cuenta demo para App Review** (usuario + contraseña con datos de ejemplo) | `fastlane/metadata/review_information/demo_user.txt` y `demo_password.txt` | ⛔ PENDIENTE |
| 2 | ~~URL de Política de Privacidad~~ | metadata privacy_url.txt | ✅ HECHO (Google Docs, verificada pública 2026-10-08) |
| 3 | ~~Email + teléfono de contacto de App Review~~ | review_information | ✅ HECHO (gerencia@fyatech.com / +573053924819) |
| 4 | ~~Screenshots 1290×2796 (5)~~ | `fastlane/screenshots/es-MX/` | ✅ HECHO — subidos a ASC por deliver (dry-run verde) |
| 5 | ~~Age rating~~ | `fastlane/metadata/age_rating.json` (4+, todo NONE) | ✅ HECHO — seteado por API idempotente en cada submit |
| 6 | **App Privacy / etiquetas de privacidad** (App-level, única vez) | ASC → App Privacy | ⛔ PENDIENTE — 5 min en consola (valores abajo); la API no lo cubre |
| 7 | **Localización en-US iOS** | `fastlane/metadata-reservado/en-US-pendiente-nombre/` | ⛔ PENDIENTE — nombre "PeopleNet" reservado por otra app en en-US; definir nombre inglés distinto y crear la localización una vez en consola (v1 solo es-MX ✓) |

## One-time manual en ASC (5 min) — pendiente #6

ASC → PeopleNet → App Privacy:
- Data collection → **Yes**.
- Identifiers → User ID: App Functionality, Linked, No tracking.
- Contact Info → Email Address: App Functionality, Linked, No tracking.
- User Content → Other User Content: App Functionality, Linked, No tracking.
- Data Used to Track You: ninguna. Third-party SDKs: ninguno.

Al terminar: correr de nuevo `appstore-submit` (submit_for_review=true, build 116).

## Ya resuelto ✅

- ✅ CORS del backend prod permite `capacitor://localhost` y `https://localhost` (preflight verificado 2026-10-08 — el login nativo funciona).
- ✅ Icono App Store 1024×1024 sin canal alfa (`ios/App/App/Assets.xcassets`).
- ✅ Splash assets presentes.
- ✅ `ITSAppUsesNonExemptEncryption=false` (sin cuestionario de exportación).
- ✅ Sin permisos NS* (la app no usa cámara/ubicación/fotos/micro).
- ✅ ATS habilitado — solo HTTPS contra `peoplenet.info` (cert válido hasta 2027-03-18).
- ✅ Metadata de tienda completa es/en (`fastlane/metadata/`).
- ✅ Notas de App Review profesionales (`review_information/notes.txt`).
- ✅ Workflow `appstore-submit.yml` para enviar a revisión por API (sin salir de GitHub Actions).
- ✅ v1 restringida a iPhone (evita screenshots iPad 13").

## Flujo de envío (orden exacto)

1. **Pendiente 1–3:** escribir credenciales demo + contacto + URL privacy en los `.txt` de `fastlane/metadata/` y hacer commit/push a la rama actual (develop o main).
2. **Build en ASC:** ✅ HECHO 2026-10-08 — **v1.0 build 116** subido por CI (run 37827671173), backend PROD. Verificar en ASC → TestFlight & Builds que esté **Ready to Submit** (procesamiento 10–30 min; si Apple lo invalida, revisar/issues).
3. **Screenshots:** capturar según guion (idealmente desde build 116 en TestFlight para mostrar el UI nuevo) → copiar a `fastlane/metadata/screenshots/{es-419,en-US}/` → commit/push.
4. **One-time en ASC (manual, 5 min):**
   - **Age rating** → contestar todas las secciones "None/No" → resultado **4+**.
   - **App Privacy** → declaraciones abajo.
5. **Enviar a revisión:** GitHub Actions → `appstore-submit` → Run workflow:
   - `submit_for_review: false` (opcional: dry-run — sube metadata, valida, no envía)
   - `submit_for_review: true` + `build_number: 116` → **envía a revisión**.
6. **Monitoreo:** Apple responde típicamente en 24–48 h. Estado en ASC → Distribución → versión 1.0. Rechazo → corregir y re-correr paso 5 con build nuevo si aplica.
7. **Publicación:** aprobada → ASC → "Publicar esta versión manualmente" (coordinar con el equipo; `automatic_release: false`).

## Age rating (respuestas → 4+)
Todas las categorías (violencia, contenido sexual, lenguaje, drogas, apuestas, terror, medicina, acceso web sin restricción, chat no filtrado, etc.): **None / No**. La app es de gestión empresarial, sin UGC abierto ni acceso web.

## App Privacy (declaraciones recomendadas — honestas y mínimas)

| Tipo de dato | Uso | Vinculado a identidad | Tracking |
|---|---|---|---|
| Identificadores — User ID | App Functionality | Sí | No |
| Contact Info — Email Address | App Functionality | Sí | No |
| User Content — Other User Content (solicitudes, documentos, evaluaciones) | App Functionality | Sí | No |

- **Data Used to Track You:** ninguna.
- **Third-party SDKs:** ninguno (solo Capacitor core — no analítica, no ads).

## Post-aprobación (go-live profesional)

1. Publicar la versión manualmente en ASC y verificar la ficha en el App Store (nombre, textos, screenshots).
2. Probar descarga real desde el App Store en un iPhone.
3. Crear/release notes para v1.0.1+ en `fastlane/metadata/*/release_notes.txt`.
4. Mantener el certificado TLS de prod vigente (vence 2027-03-18) — renovar ANTES.
