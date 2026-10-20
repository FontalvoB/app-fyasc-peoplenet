# Despliegue a Google Play desde terminal — PeopleNet (com.fyasc.peoplenet)

**Método vigente: `scripts/play_publish.py`** (REST puro, sin dependencias).
GPP (Gradle Play Publisher) quedó integrado pero deprecado en este proyecto:
sus bibliotecas de 2023 reciben 403 "Please migrate to the new publishing API".

## 0. Lo que ya quedó configurado en este repo

- Plugin `com.github.triplet.play` 3.13.0 (classpath en `android/build.gradle`)
- Bloque `play { track = 'internal'; defaultToAppBundles = true;
  useApplicationDefaultCredentials = true; impersonateServiceAccount = ... }`
  en `android/app/build.gradle`
- Notas de release en `android/app/src/main/play/release-notes/en-US/{default,internal}.txt`
- Firma de release automática vía `android/keystore.properties`
- `android/play-service-account.json` en `.gitignore` (ya no se usa, método keyless)

## 1. Autenticación sin clave JSON (impersonación ADC)

La organización de Google Cloud del equipo tiene activada por defecto (2025+) la
política `iam.managed.disableServiceAccountKeyCreation`, que **impide crear claves
JSON de service account**. Solución recomendada por Google y soportada por GPP:
impersonar la SA con credenciales de usuario (sin claves).

### Setup de una vez

1. **Rol para impersonar** (Google Cloud Console → IAM y administración → IAM →
   editar tu usuario `gerencia@fyatech.com` → Agregar rol):
   `Service Account Token Creator` (roles/iam.serviceAccountTokenCreator)
   *(o agregarlo directamente a la SA en "Principales con acceso")*
2. **Habilitar la API de Play** (en el proyecto `peoplenet-510915`):
   Google Cloud → APIs y servicios → Biblioteca → buscar
   "Google Play Android Developer API" → **Habilitar**
3. **Instalar gcloud CLI**: `brew install --cask google-cloud-sdk`
4. **Login ADC + impersonación**:
   ```bash
   gcloud auth application-default login \
     --impersonate-service-account=play-publisher.net@peoplenet-510915.iam.gserviceaccount.com
   ```
   (abre navegador → loguear con `gerencia@fyatech.com`)

### En Play Console (una vez)

- **Configuración → Acceso a la API** → verificar que el proyecto vinculado sea
  `peoplenet-510915` (si no, ahí se re-vincula)
- En "Cuentas de servicio" → `play-publisher.net@peoplenet-510915.iam.gserviceaccount.com`
  → **Conceder acceso**:
  - ✅ **Ver información de la app**
  - ✅ **Publicar aplicaciones en pistas de prueba**
  → Aplicar

### Config ya aplicada en el repo (`android/app/build.gradle`)

```gradle
play {
    track = 'internal'
    defaultToAppBundles = true
    useApplicationDefaultCredentials = true
    impersonateServiceAccount = 'play-publisher.net@peoplenet-510915.iam.gserviceaccount.com'
}
```

## 2. Subir y lanzar desde terminal (Mac) — método vigente

```bash
cd app-fyasc-peoplenet

# 1) Bump de versión en android/app/build.gradle (versionCode +1)

# 2) Build web + sync + AAB firmado
npm run build:production && npx cap sync android
cd android
export JAVA_HOME=/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home
export ANDROID_HOME=/opt/homebrew/share/android-commandlinetools
./gradlew bundleRelease --no-daemon
cd ..

# 3) Subir y lanzar (pista interna, notas de android/.../release-notes/*/internal.txt)
python3 scripts/play_publish.py \
  --aab android/app/build/outputs/bundle/release/app-release.aab \
  --version-code 2
```

Opciones del script:
| Flag | Uso |
|---|---|
| `--dry-run` | Solo autentica y muestra el estado de las pistas |
| `--track internal` | Pista destino (default internal) |
| `--status completed` | `completed` (lanza ya) / `draft` / `halted` |
| `--notes-file ruta.txt` | Notas custom (default: release-notes/{es-419,en-US}/internal.txt) |

La prueba interna se publica al instante (sin revisión de Google).

## 3. Cambios de versión (cada release)

- `versionCode` +1 en `android/app/build.gradle`
- `versionName` "1.0.x" según toque

## 4. Permisos necesarios

- Usuario logueado (`gerencia@fyatech.com`): `roles/iam.serviceAccountTokenCreator`
  sobre la SA `play-publisher.net@peoplenet-510915.iam.gserviceaccount.com`
- SA en Play Console → Acceso a la API: "Ver información de la app" +
  "Publicar aplicaciones en pistas de prueba". Para producción luego: +
  **"Publicar aplicaciones en producción"**

## 5. Verificación rápida

```bash
# ¿Se registró el plugin y las tareas publish?
./gradlew :app:tasks --all | grep -i publish | head

# ¿Hay credenciales válidas? (descarga/actualiza metadata de la app)
./gradlew :app:bootstrapReleaseListing
```
