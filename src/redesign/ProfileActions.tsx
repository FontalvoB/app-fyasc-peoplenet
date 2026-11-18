import { useEffect, useRef, useState, type FormEvent } from "react";
import { toApiError } from "../lib/api";
import {
  changeProfilePassword,
  getProfilePhoto,
  removeProfilePhoto,
  replaceProfilePhoto,
  requestProfilePasswordCode,
} from "../lib/profile-account";
import { Avatar, Button } from "./shared";

const photoTypes = ["image/jpeg", "image/png", "image/gif"];
const maxPhotoSize = 5 * 1024 * 1024;

export function ProfilePhoto({
  initials,
  enabled = true,
}: {
  initials: string;
  enabled?: boolean;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [broken, setBroken] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    getProfilePhoto(controller.signal)
      .then(({ url }) => { if (!controller.signal.aborted) setUrl(url); })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) setError(toApiError(error).message);
      })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [enabled, attempt]);

  async function save(file?: File) {
    if (file && (!photoTypes.includes(file.type) || file.size === 0 || file.size > maxPhotoSize)) {
      setError("Selecciona una imagen JPEG, PNG o GIF de hasta 5 MB.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      if (file) {
        setUrl((await replaceProfilePhoto(file)).url);
      } else {
        await removeProfilePhoto();
        setUrl(null);
      }
      setBroken(false);
    } catch (error) {
      setError(toApiError(error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      {enabled && url && !broken ? (
        <img className="pn-avatar" src={url} alt="Foto de perfil" referrerPolicy="no-referrer"
          style={{ objectFit: "cover" }} onError={() => setBroken(true)} />
      ) : <Avatar name={initials} />}
      {enabled && (
        <div>
          <input ref={input} type="file" hidden accept={photoTypes.join(",")}
            onChange={(event) => {
              const file = event.currentTarget.files?.[0];
              event.currentTarget.value = "";
              if (file) void save(file);
            }} />
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            <Button secondary disabled={loading || busy} onClick={() => input.current?.click()}>
              {url ? "Cambiar foto" : "Cargar foto"}
            </Button>
            {url && <Button secondary disabled={busy || loading} onClick={() => void save()}>Quitar foto</Button>}
            {!url && error && (
              <Button secondary disabled={busy || loading} onClick={() => {
                setLoading(true);
                setError("");
                setAttempt(attempt + 1);
              }}>Recargar foto</Button>
            )}
          </div>
          {busy && <p className="small-muted" role="status">Actualizando foto…</p>}
          {error && <p className="pn-info" role="alert">{error}</p>}
        </div>
      )}
    </>
  );
}

export function ProfileActions() {
  const [requested, setRequested] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [otp, setOtp] = useState("");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");

  async function requestCode() {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await requestProfilePasswordCode();
      setRequested(true);
      setOtp("");
      setMessage("Enviamos un código a tu correo registrado. Vence en 10 minutos.");
    } catch (error) {
      setError(toApiError(error).message);
    } finally {
      setBusy(false);
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    if (password !== confirmation) {
      setError("Las contraseñas no coinciden.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await changeProfilePassword(otp, password, confirmation);
      setRequested(false);
      setOtp("");
      setPassword("");
      setConfirmation("");
      setMessage("Tu contraseña se actualizó. Puedes seguir usando esta sesión.");
    } catch (error) {
      setError(toApiError(error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="pn-panel pn-form">
      <h2>Cambiar contraseña</h2>
      <div>
        <Button secondary disabled={busy} onClick={() => void requestCode()}>
          {requested ? "Reenviar código" : "Enviar código a mi correo"}
        </Button>
      </div>
      {requested && (
        <form className="pn-form" onSubmit={submit}>
          <label>
            Código de verificación
            <input value={otp} onChange={(event) => setOtp(event.target.value)}
              inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}"
              maxLength={6} required disabled={busy} />
          </label>
          <label>
            Nueva contraseña
            <input type="password" autoComplete="new-password" value={password}
              onChange={(event) => setPassword(event.target.value)}
              minLength={8} maxLength={72} required disabled={busy} />
          </label>
          <label>
            Confirma la nueva contraseña
            <input type="password" autoComplete="new-password" value={confirmation}
              onChange={(event) => setConfirmation(event.target.value)}
              minLength={8} maxLength={72} required disabled={busy} />
          </label>
          <div><Button type="submit" disabled={busy}>Guardar contraseña</Button></div>
        </form>
      )}
      {busy && <p className="small-muted" role="status">Procesando…</p>}
      {message && <p className="pn-info" role="status">{message}</p>}
      {error && <p className="pn-info" role="alert">{error}</p>}
    </section>
  );
}
