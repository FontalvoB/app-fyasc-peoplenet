<#
.SYNOPSIS
    Publica la PWA de PeopleNet (build:pwa) en la carpeta del sitio IIS.

.DESCRIPTION
    1) npm run build:pwa  -> dist/ (manifest + sw.js + assets con hash)
    2) Copia dist/ -> -SiteRoot con robocopy /MIR (borra lo viejo, copia lo nuevo)
    3) Copia deploy\web.config a la raiz del sitio (reglas SPA + reverse proxy)

    Ejecutar en el server (o apuntando a una ruta compartida desde el PC de build):
        .\scripts\deploy-pwa.ps1 -SiteRoot 'C:\inetpub\peoplenet-pwa'
        .\scripts\deploy-pwa.ps1 -SiteRoot '\\SERVER\c$\inetpub\peoplenet-pwa' -NoBuild

.NOTES
    Requiere Node/npm donde corre el build. No toca IIS (sitio ya creado);
    robocopy no detiene el sitio: los archivos bloqueados son reintentados.
#>
[CmdletBinding()]
param(
    # Carpeta raiz del sitio IIS (PhysicalPath del sitio 'peoplenet-pwa')
    [Parameter(Mandatory = $true)]
    [string]$SiteRoot,

    # Saltar el build (usar dist/ existente, ej. re-publicar sin compilar)
    [switch]$NoBuild
)

$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent $PSScriptRoot
$dist = Join-Path $repoRoot 'dist'
$webConfig = Join-Path $repoRoot 'deploy\web.config'

if (-not $NoBuild) {
    Write-Host ">> Build PWA (npm run build:pwa)..." -ForegroundColor Cyan
    Push-Location $repoRoot
    try { npm run build:pwa; if ($LASTEXITCODE -ne 0) { throw "build:pwa fallo (exit $LASTEXITCODE)" } }
    finally { Pop-Location }
}

if (-not (Test-Path (Join-Path $dist 'index.html'))) { throw "No existe $dist\index.html - ejecuta el build." }
if (-not (Test-Path (Join-Path $dist 'sw.js')))       { throw "No existe $dist\sw.js - el build no genero el service worker." }

Write-Host ">> Copiando dist/ -> $SiteRoot (robocopy /MIR)..." -ForegroundColor Cyan
robocopy $dist $SiteRoot /MIR /NFL /NDL /NJH /NJS /R:3 /W:2
if ($LASTEXITCODE -ge 8) { throw "robocopy fallo (exit $LASTEXITCODE)" }

Write-Host ">> Publicando web.config (SPA + reverse proxy /api)..." -ForegroundColor Cyan
Copy-Item $webConfig (Join-Path $SiteRoot 'web.config') -Force

Write-Host "`nOK - PWA publicada en $SiteRoot" -ForegroundColor Green
Write-Host "Verifica: https://app.fyasc.com.co  |  /manifest.webmanifest  |  /sw.js  |  /api/actuator/health"
