# Publicación PeopleNet — Google Play (primera versión)

Guía profesional para llevar `com.fyasc.peoplenet` (PeopleNet) a producción en Google Play.

**Tipo de cuenta: ORGANIZACIÓN (D-U-N-S)** → Google NO exige el requisito de
"12 testers × 14 días en closed testing" (ese gate solo aplica a cuentas
personales creadas después del 13-nov-2023).

---

## 1. Estado verificado (2026-10-08)

| Ítem | Estado |
|---|---|
| App creada en Play Console + API access (SA `play-publisher-net@`) | ✅ funcionando |
| Pipeline GitHub Actions (push develop/main → pista internal) | ✅ último run exitoso, versionCode 3000003 en internal |
| Firma release (keystore en secrets: `KEYSTORE_BASE64`, `PEOPLENET_STORE_PASSWORD`, `PEOPLENET_KEY_PASSWORD`) | ✅ |
| Autenticación Play (`GOOGLE_ADC_JSON`) | ✅ (el ADC local del Mac expiró: si publicas desde el Mac, `gcloud auth application-default login`; CI no depende de eso) |
| `targetSdk 36` / `compileSdk 36` / `minSdk 24` | ✅ cumple requisito API 36 vigente desde 31-ago-2026 para apps nuevas |
| Permisos | ✅ solo `INTERNET` (mínimo posible, cero fricción en review) |
| CORS prod para origen nativo `https://localhost` | ✅ responde ACAO correcto (verificado 08-oct) |
| **Política de privacidad en URL real** | ✅ HECHO (Google Docs pública, verificada 2026-10-08) — agregar la URL en Play Console → App content |
| **Store listing completo** (short/full description, icono 512, feature graphic, 2+ screenshots) | ✅ HECHO por API 2026-10-08 (`play-listing.yml`): textos es-419/en-US, icon 512, feature graphic, 5 screenshots ×2 idiomas. Nombre unificado "PeopleNet" |
| **App content** (Data safety, Content rating, Anuncios, Público objetivo, Sign-in details) | ❌ pendiente — MANUAL en consola (respuestas en §4; ~10 min) |
| Access Review (cuenta demo para revisores de Google) | ❌ pendiente (misma credencial que iOS) |

Después de completar App content: **envío a revisión** con `android-prod.yml`
(status=draft → draft queda en consola → "Enviar para revisión") o ya con
draft existente, directo desde la consola.

## 2. Infra nueva en el repo (esta iteración)

- `.github/workflows/android-closed.yml` — **manual**: AAB firmado → pista **closed** (prueba cerrada).
- `.github/workflows/android-prod.yml` — **manual**: AAB firmado → pista **production** (por defecto en `draft`: queda como borrador para revisar en consola y dar "Enviar para revisión" con control total).
- `android-release.yml` ahora acepta `release_status` (`draft`/`completed`/`halted`).
- `scripts/play_publish.py` ahora usa notas por pista: `release-notes/{es-419,en-US}/internal.txt | closed.txt | production.txt`.
- Textos de listing listos para pegar en consola: `android/app/src/main/play/listings/{es-419,en-US}/short-description.txt` y `full-description.txt`.

Ambos workflows comparten el grupo de concurrencia `android-play` con el auto-deploy,
garantizando versionCode globalmente monotónico (base 3.000.000 + run number).

**Ejecución:** Actions → elegir workflow → Run workflow → (opcional `status`).

## 3. Camino a producción (cuenta organización)

1. **Política de privacidad** ⏳ — publicar la URL real en peoplenet.info (en progreso).
   Debe ser una página activa, con título "Política de privacidad", que mencione
   **PeopleNet** (el nombre del listing), datos recolectados, contacto, retención y borrado.
2. **App content** (Play Console → Policy and programs → App content) — ver §4.
3. **Store listing** — ver §5.
4. **(Opcional QA amplia)** closed testing: `android-closed.yml` con `status=draft`,
   publicar en consola, invitar testers. No es requisito para producción (cuenta organización).
5. **Producción**: `android-prod.yml` con `status=draft` → en consola (Test and release →
   Production): revisar países y notas → **Enviar para revisión**.
6. **Review de Google**: primera publicación suele tardar **hasta 7 días** (a veces más;
   las actualizaciones posteriores van en horas–días). Estado visible en consola.
7. **Post-publicación**: ver §7.

## 4. App content — respuestas recomendadas (Play Console)

> Formulario en: Policy and programs → App content. Todo es editable después; sin
> completar esto, la subida/lanzamiento a producción se bloquea.

### 4.1 Privacy policy
URL de la política (paso 1). Validar que carga sin login.

### 4.2 Ads
- **No, my app does not contain ads** (no hay AdMob ni redes de anuncios).

### 4.3 Content rating (cuestionario IARC)
App de gestión interna, sin UGC público. Respuestas seguras:
- ¿Contiene blíndez/violencia gráfica, sexo, drogas, apuestas, lenguaje ofensivo? → **No** en todo.
- ¿Compartir ubicación con otros usuarios, contenido generado por usuarios visible a terceros
  (chat/foros), compras digitales? → **No**.
- Restricción por edades (público objetivo) → aplica calificación adulta/empleados.
Resultado esperado: **Everyone / 3+ (ESRB/Pegi equivalente)**. Sin sorpresas.

### 4.4 Target audience & content
- Grupo de edad objetivo: **18 y más** (app laboral).
- ¿Puede atraer involuntariamente a niños? → **No** (diseño laboral/empresarial, sin dibujos/juegos).
- Apelación a niños: **No** → no aplica Families policy ni CASA.

### 4.5 Data safety — respuestas para PeopleNet
Pregunta gate: ¿la app recolecta o comparte datos de usuario? → **Sí**.

| Tipo | Recolecta | Comparte | Propósito | Notas |
|---|---|---|---|---|
| Personal info → Name, Email address, User IDs | Sí (obligatorio, login) | No | App functionality, Account management | datos del colaborador en backend propio |
| App activity → App interactions | Sí (obligatorio) | No | App functionality | acciones dentro de la app (evaluaciones, solicitudes) |
| Files and docs → (si la app adjunta archivos) | Sí (obligatorio) | No | App functionality | solo si existe feature de adjuntos; verificar |
| Device or other IDs | **No** | No | — | no hay SDKs de analítica ni anuncios |
| App info and performance (crash logs) | **No** | No | — | no hay Crashlytics/Sentry en el build |

- **Encrypted in transit**: Sí (todo HTTPS, cert válido hasta mar-2027).
- **Users can request data deletion**: **Sí** — vía soporte
  (`soporte@peoplenet.info`); documentarlo en la política de privacidad.
- **Account deletion URL**: PeopleNet **no permite crear cuentas self-service**
  (RRHH/admin crea los accesos desde la plataforma web) → el requisito de URL de
  eliminación de cuenta **no aplica**. En el formulario, responder que la app **no
  permite a los usuarios crear una cuenta**; las credenciales las emite la
  organización. Si Google pidiera aclaración, responder exactamente eso.
  ⚠️ Solo aplica el requisito si en el futuro se agrega registro self-service.

### 4.6 Sign-in details (Access for reviewers) — CRÍTICO
App con login: Google **exige** credenciales de prueba válidas para que sus
revisores entren. Crear en producción una cuenta demo (ej. `demo-review@…`)
con datos visibles pero inofensivos, y registrarla en App content → Sign-in details:
usuario, contraseña y "any other instructions" (si hay MFA, indicarlo).
**Causa #1 de rechazo de apps con login: credenciales de revisión inválidas o vencidas.**

### 4.7 Government / Health / Financial / News declarations
- Government: No. Health: No. Financial features: No. News: No.
  (Formularios cortos: responder "no" es válido y suficiente.)

### 4.8 Registro Android developer verification
Play Console Home muestra el check de **Android developer registration**
(los nombres de paquete deben estar registrados; fecha límite 30-sep-2026 para apps
existentes — la app ya publicada en internal normalmente ya queda registrada;
verificar que el check esté verde).

## 5. Store listing (Grow → Store presence → Main store listing)

| Campo | Límite | Propuesta (en repo, `android/app/src/main/play/listings/`) |
|---|---|---|
| App name | 30 | `PeopleNet` (consola tiene "People Net" — unificar a un solo nombre en ambas tiendas) |
| Short description | 80 | `Gestión de personal: evaluaciones, KPIs, solicitudes y documentos en campo.` (75) |
| Full description | 4000 | ver `full-description.txt` (es-419 y en-US) |
| Release notes | 500 | `release-notes/…/production.txt` |

Gráficos requeridos:
- **Icono**: 512×512 PNG 32-bit, ≤1 MB, cuadrado completo (Google aplica máscara
  redondeada 30% + sombra; no enviar esquinas redondeadas). Debe ser versión
  alta-fidelidad del launcher icon (no reemplaza el launcher).
- **Feature graphic**: 1024×500, JPEG/24-bit PNG sin alpha. Sugerencia: fondo
  corporativo Fya Social Capital, logo + "PeopleNet — Gestión de personal". Texto centrado
  (los bordes se recortan en formatos grandes).
- **Screenshots**: mínimo 2 (recomendado 4-8), teléfono, 9:16 o 16:9, entre 320 y
  3840 px por lado, JPEG/PNG. Tomar capturas reales de la app (login, dashboard
  KPIs, evaluación, solicitudes, documentos). Las capturas deben reflejar la app
  real — mismatch captura/app es causa común de rechazo.
- Tablet 7"/10": opcionales si no se declara soporte tablet; mejorar conversión si se agregan.

## 6. Revisión de Google — qué mira el revisor

1. Que la app abra y funcione (con la cuenta demo del §4.6) — la app consume
   `https://peoplenet.info/api`; el entorno prod debe estar estable el día de la review.
2. Data safety coherente con el comportamiento real (Google escanea el AAB
   automáticamente; declarar menos de lo que hace = rechazo).
3. Política de privacidad accesible y mencionando PeopleNet.
4. Listing honesto (sin features inexistentes en capturas/descripción).
5. Estabilidad: sin crashes en el pre-launch report (lo genera Google al subir el AAB).

## 7. Post-publicación (profesional)

- **Staged rollout**: primera versión puede ir 100% directo, o 20% → 50% → 100%
  (Production → Release → Staged rollout %) para frenar ante imprevistos.
- **Android vitals** (Quality → Android vitals): crash rate, ANRs. Umbrales malos
  afectan visibilidad.
- **Respuestas a reviews**: responder en ≤1 semana (señal de calidad).
- Cada update siguiente: bump versionCode automático por el pipeline (3.000.000 + run_number).

## 8. Riesgos conocidos / pendientes del lado servidor

1. **Política de privacidad** (en progreso) — bloqueante para producción.
2. **Cuenta demo para revisores** — crearla y registrarla en App content.
3. **Cert TLS prod** vence 2027-03-18 — renovar a tiempo (app nativa exige TLS válido).
4. Keep `https://localhost` y `capacitor://localhost` en CORS allowlist del backend
   (hoy responden bien; cualquier cambio del server puede romper la app nativa).
5. Si se agrega algún SDK de analítica/ads en el futuro → actualizar Data safety.

## 9. Fuentes oficiales (verificadas oct-2026)

- Target API 36 desde 31-ago-2026: developer.android.com/google/play/requirements/target-sdk
- Closed testing 12×14 (cuentas personales post-nov-2023, NO aplica a organización):
  support.google.com/googleplay/android-developer/answer/14151465
- Account deletion (solo apps con account creation): support.google.com/googleplay/android-developer/answer/13327111
- Data safety form: support.google.com/googleplay/android-developer/answer/10787469
- Prepare your app for review (sign-in details): support.google.com/googleplay/android-developer/answer/9859455
- Store listing specs: support.google.com/googleplay/android-developer/answer/9866151
- Icon design specs: developer.android.com/distribute/google-play/resources/icon-design-specifications
- Metadata policy: support.google.com/googleplay/android-developer/answer/9898842
