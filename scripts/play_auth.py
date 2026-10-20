#!/usr/bin/env python3
"""
play_auth.py — Autenticación compartida para Google Play Publisher (REST puro).

Dos mecanismos, priorizados así:
  1. GOOGLE_SA_KEY_FILE / GOOGLE_SA_KEY_JSON secret — JSON key de la SERVICE
     ACCOUNT (play-publisher-net@...): JWT firmado RS256 → token directo.
     NO requiere re-auth (rapt) jamás. Método preferido en CI.
  2. ADC authorized_user (gcloud) + impersonación de la SA — scheherazade legacy;
     Google exige re-autorización periódica (invalid_rapt).

Uso:  from play_auth import get_play_token, PLAY_SCOPE
      token = get_play_token()
"""
import base64
import json
import os
import sys
import urllib.error
import urllib.parse
import urllib.request

APP_ID = "com.fyasc.peoplenet"
IMPERSONATE_SA = "play-publisher-net@peoplenet-510915.iam.gserviceaccount.com"
ANDROIDPUBLISHER = "https://www.googleapis.com/auth/androidpublisher"

SA_KEY_PATH = os.environ.get("GOOGLE_SA_KEY_FILE")
SA_KEY_JSON = os.environ.get("GOOGLE_SA_KEY_JSON")
ADC_PATH = os.environ.get(
    "GOOGLE_ADC_FILE",
    os.path.expanduser("~/.config/gcloud/application_default_credentials.json"))


def die(msg, hint=None):
    print(f"✗ {msg}")
    if hint:
        print(hint)
    sys.exit(1)


# ── Mecanismo 1: JSON key de Service Account (RS256) ─────────────────────────
def _sa_key_material():
    """Devuelve dict del JSON key SA (desde archivo b64 o var de entorno plain)."""
    if SA_KEY_PATH and os.path.exists(SA_KEY_PATH):
        return json.load(open(SA_KEY_PATH))
    if SA_KEY_JSON and SA_KEY_JSON.strip():
        raw = SA_KEY_JSON.strip()
        # El secret puede estar en base64 (patrón del repo) o JSON plano.
        if raw.lstrip().startswith("{"):
            return json.loads(raw)
        return json.loads(base64.b64decode(raw))
    return None


def _sa_token_from_key(sa, now):
    """JWT bearer firmado RS256 con la private_key de la SA."""
    # Private key via OpenSSL CLI zero-libs: rsa-sha256 del JWT (header.payload).
    header = {"alg": "RS256", "typ": "JWT"}
    payload = {
        "iss": sa["client_email"], "sub": sa["client_email"],
        "scope": [ANDROIDPUBLISHER],
        "aud": "https://oauth2.googleapis.com/token",
        "iat": now - 30, "exp": now + 3600,
    }
    def b64d(b):  # urlsafe sin padding estándar JWT
        return base64.urlsafe_b64encode(b).rstrip(b"=").decode()

    jwt_core = f"{b64d(json.dumps(header).encode())}.{b64d(json.dumps(payload).encode())}"

    key_file = _materialize_pem(sa["private_key"])
    import subprocess  # noqa
    proc = subprocess.run(
        ["openssl", "dgst", "-sha256", "-sign", key_file],
        input=jwt_core.encode(), capture_output=True, timeout=30)
    if proc.returncode != 0:
        die("Firma RS256 falló (openssl)", proc.stderr.decode()[:300])
    sig_b64 = b64d(proc.stdout).replace("+", "-").replace("/", "_").replace("=", "")
    jwt = f"{jwt_core}.{sig_b64}"

    body = urllib.parse.urlencode({
        "grant_type": "urn:ietf:params:oauth:grant-type:jwt-bearer",
        "assertion": jwt,
    }).encode()
    try:
        r = json.load(urllib.request.urlopen(
            urllib.request.Request("https://oauth2.googleapis.com/token", data=body)))
        return r["access_token"]
    except urllib.error.HTTPError as e:
        die(f"Intercambio JWT de la SA falló ({e.code})", e.read().decode()[:300])


def _materialize_pem(pem_text):
    """Escribe la private_key a /tmp y devuelve la ruta (OpenSSL necesita archivo)."""
    pem = pem_text.replace("\\n", "\n") if "\\n" in pem_text else pem_text
    path = "/tmp/sa-play-key.pem"
    with open(path, "w") as f:
        f.write(pem)
    os.chmod(path, 0o600)
    return path


# ── Mecanismo 2: ADC authorized_user + impersonación (legacy) ────────────────
def _adc_user_token():
    if not os.path.exists(ADC_PATH):
        die("No existe ADC de gcloud ni SA key.",
            "Regenera:\n  gcloud auth application-default login\n"
            "  gh secret set GOOGLE_ADC_JSON -R FontalvoB/app-fyasc-peoplenet < $(base64 ~/.config/gcloud/application_default_credentials.json)\n"
            "o crea una JSON key de play-publisher-net@ y carga GOOGLE_SA_KEY_JSON secret.")
    d = json.load(open(ADC_PATH))
    if d.get("type") != "authorized_user":
        die(f"ADC es '{d.get('type')}' y debe ser 'authorized_user'.",
            "Regenera:  gcloud auth application-default login  (SIN --impersonate-service-account)")
    body = urllib.parse.urlencode({
        "client_id": d["client_id"], "client_secret": d["client_secret"],
        "refresh_token": d["refresh_token"], "grant_type": "refresh_token",
    }).encode()
    try:
        r = json.load(urllib.request.urlopen(
            urllib.request.Request("https://oauth2.googleapis.com/token", data=body)))
        return r["access_token"]
    except urllib.error.HTTPError as e:
        detail = e.read().decode()[:300]
        if "invalid_rapt" in detail or "invalid_grant" in detail:
            die(f"Refresh falló ({e.code}) — Google exige re-autorización (rapt).", detail)
        die(f"Refresh del token de usuario falló ({e.code})", detail)


def _impersonate(user_token):
    body = json.dumps({"delegates": [], "scope": [ANDROIDPUBLISHER], "lifetime": "3600s"}).encode()
    req = urllib.request.Request(
        "https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/"
        f"{IMPERSONATE_SA}:generateAccessToken",
        data=body, method="POST",
        headers={"Authorization": f"Bearer {user_token}", "Content-Type": "application/json"})
    try:
        r = json.load(urllib.request.urlopen(req))
        return r["accessToken"]
    except urllib.error.HTTPError as e:
        die("Impersonación falló", e.read().decode()[:300])


# ── Punto de entrada ──────────────────────────────────────────────────────────
def get_play_token(quiet=False):
    """Devuelve token de acceso con scope androidpublisher (SA key > ADC)."""
    import time
    sa = _sa_key_material()
    if sa:
        if not quiet: print("✓ Autenticación: SA JSON key (RS256 — sin rapt)")
        return _sa_token_from_key(sa, int(time.time()))
    if not quiet: print("✓ Autenticación: ADC gcloud + impersonación (legacy)")
    return _impersonate(_adc_user_token())
