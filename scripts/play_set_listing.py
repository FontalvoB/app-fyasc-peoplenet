#!/usr/bin/env python3
"""
play_set_listing.py — Publica el store listing de Google Play vía API (REST puro).

Textos + imágenes por idioma desde el repo:
  android/app/src/main/play/listings/{es-419,en-US}/{short,full}-description.txt
  android/app/src/main/play/icon-512.png                    (icono Play 512×512)
  android/app/src/main/play/feature-graphic.jpeg            (1024×500)
  android/app/src/main/play/screens/*.jpeg                  (teléfono, 1080×2340)

Uso:
  python3 scripts/play_set_listing.py [--dry-run]

Flujo: edits.insert → listings.update (textos) → listingsImages (2 fases por
imagen) → commit. Alternaba con el AAB de android-prod: el listing es global
(no depende de una versión).
"""
import argparse
import base64
import json
import os
import sys
import urllib.error
import urllib.parse
import urllib.request
import uuid

APP_ID = "com.fyasc.peoplenet"
IMPERSONATE_SA = "play-publisher-net@peoplenet-510915.iam.gserviceaccount.com"
ANDROIDPUBLISHER = "https://www.googleapis.com/auth/androidpublisher"
BASE = "https://androidpublisher.googleapis.com/androidpublisher/v3/applications"
UPLOAD_BASE = "https://androidpublisher.googleapis.com/upload/androidpublisher/v3/applications"
ADC_PATH = os.environ.get(
    "GOOGLE_ADC_FILE",
    os.path.expanduser("~/.config/gcloud/application_default_credentials.json"))

PLAY_DIR = os.path.join(os.path.dirname(__file__), "..", "android/app/src/main/play")
LANGS = ("es-419", "en-US")


def die(msg, hint=None):
    print(f"✗ {msg}")
    if hint:
        print(hint)
    sys.exit(1)


class PlayApi:
    def __init__(self, token):
        self.token = token

    def call(self, method, path, body=None, ok_empty=False):
        req = urllib.request.Request(
            f"{BASE}/{APP_ID}{path}",
            data=json.dumps(body).encode() if body is not None else None,
            method=method,
            headers={"Authorization": f"Bearer {self.token}",
                     "Content-Type": "application/json"})
        try:
            resp = urllib.request.urlopen(req)
            raw = resp.read()
            return {} if (ok_empty and (resp.status == 204 or not raw)) else json.loads(raw)
        except urllib.error.HTTPError as e:
            raw = e.read().decode()
            try:
                err = json.loads(raw).get("error", {})
                raise RuntimeError(f"{method} {path} → {e.code}: {err.get('message', raw[:200])}")
            except json.JSONDecodeError:
                raise RuntimeError(f"{method} {path} → {e.code}: {raw[:200]}")

    def image_upload(self, eid, lang, image_type, path):
        """POST media-upload: /edits/{eid}/listings/{lang}/{imageType}?uploadType=media."""
        mime = "image/png" if path.endswith(".png") else "image/jpeg"
        data = open(path, "rb").read()
        req = urllib.request.Request(
            f"{UPLOAD_BASE}/{APP_ID}/edits/{eid}/listings/{lang}/{image_type}?uploadType=media",
            data=data, method="POST",
            headers={"Authorization": f"Bearer {self.token}",
                     "Content-Type": mime})
        try:
            resp = urllib.request.urlopen(req)
            result = json.load(resp)
            print(f"    ✓ {os.path.basename(path)} ({len(data)//1024} KB) id={result.get('image', {}).get('id', '?')[:12]}")
            return result
        except urllib.error.HTTPError as e:
            raise RuntimeError(f"image_upload {os.path.basename(path)} → {e.code}: {e.read().decode()[:200]}")


def parse_listing_texts():
    entries = {}
    for lang in LANGS:
        d = os.path.join(PLAY_DIR, "listings", lang)
        short = os.path.join(d, "short-description.txt")
        full = os.path.join(d, "full-description.txt")
        if not (os.path.exists(short) and os.path.exists(full)):
            die(f"Faltan textos del listing: {d}")
        title = "PeopleNet"
        entries[lang] = {"title": title,
                         "shortDescription": open(short).read().strip(),
                         "fullDescription": open(full).read().strip()}
        if len(entries[lang]["shortDescription"]) > 80:
            die(f"short-description [{lang}] excede 80 chars")
        if len(entries[lang]["fullDescription"]) > 4000:
            die(f"full-description [{lang}] excede 4000 chars")
    return entries


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    listings = parse_listing_texts()
    icon = os.path.join(PLAY_DIR, "icon-512.png")
    feature = os.path.join(PLAY_DIR, "feature-graphic.jpeg")
    screens_dir = os.path.join(PLAY_DIR, "screens")
    screens = sorted(os.path.join(screens_dir, f) for f in os.listdir(screens_dir)
                     if f.lower().endswith((".jpeg", ".jpg", ".png"))) if os.path.isdir(screens_dir) else []

    for p, label, w, h in ((icon, "icono", 512, 512), (feature, "feature graphic", 1024, 500)):
        if not os.path.exists(p):
            die(f"Falta {label}: {p}")
    print(f"• Textos listing: {', '.join(LANGS)}")
    print(f"• Imágenes globales: {icon} + {feature}")
    print(f"• Screenshots teléfono: {len(screens)} (1080×2340)")
    if len(screens) < 2:
        die("Google Play exige mínimo 2 screenshots de teléfono")

    import play_auth
    token = play_auth.get_play_token()
    print("✓ Autenticación OK (SA impersonada)")

    if args.dry_run:
        api = PlayApi(token)
        edit = api.call("POST", "/edits")
        try:
            cur = api.call("GET", f"/edits/{edit['id']}/listings", ok_empty=True)
            for l in cur.get("listings", []):
                print(f"  listing [{l.get('language')}]: {l.get('title')}")
        finally:
            api.call("DELETE", f"/edits/{edit['id']}", ok_empty=True)
        print("✓ Dry-run: API operativa. No se cambió nada.")
        return

    api = PlayApi(token)
    edit = api.call("POST", "/edits")
    eid = edit["id"]
    print(f"✓ Edit creado: {eid}")

    try:
        for lang, data in listings.items():
            api.call("PUT", f"/edits/{eid}/listings/{lang}", {**data, "language": lang})
            print(f"✓ Textos [{lang}] actualizados")

        shared = [("icon", icon), ("featureGraphic", feature)]
        for lang in LANGS:
            # Imágenes globales (icon + feature): un upload por tipo e idioma
            for img_type, path in shared:
                api.image_upload(eid, lang, img_type, path)
                print(f"✓ {img_type} [{lang}]")

            if screens:
                for path in screens:
                    api.image_upload(eid, lang, "phoneScreenshots", path)
                print(f"✓ phoneScreenshots [{lang}] × {len(screens)}")

        api.call("POST", f"/edits/{eid}:commit", ok_empty=True)
        print(f"✓ COMMIT OK — listing publicado en {', '.join(LANGS)}")
    finally:
        try:
            urllib.request.urlopen(urllib.request.Request(
                f"{BASE}/{APP_ID}/edits/{eid}", method="DELETE",
                headers={"Authorization": f"Bearer {token}"}))
            print("(edit abandonado)")
        except Exception:
            pass


if __name__ == "__main__":
    try:
        main()
    except RuntimeError as e:
        die(str(e))
