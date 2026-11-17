import { useEffect, useRef, useState, type FormEvent } from "react";
import { changeTemporaryPassword, toApiError, type TemporaryPasswordSession } from "../lib/api";
import { Modal } from "./shared";
import "./password-recovery.css";

export function TemporaryPasswordChange({ session, close, onChanged }: {
  session: TemporaryPasswordSession; close: () => void; onChanged: () => void;
}) {
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const pending = useRef<AbortController | null>(null);
  useEffect(() => () => pending.current?.abort(), []);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (pending.current) return;
    setError("");
    if (password.length < 8) {
      setError("La nueva contraseña debe tener al menos 8 caracteres.");
      return;
    }
    if (password !== confirmation) {
      setError("Las contraseñas no coinciden.");
      return;
    }
    const controller = new AbortController();
    pending.current = controller;
    setBusy(true);
    try {
      await changeTemporaryPassword(session, password, confirmation, controller.signal);
      if (!controller.signal.aborted) onChanged();
    } catch (err) {
      if (!controller.signal.aborted) {
        const failure = toApiError(err);
        setError(failure.status === 401
          ? "Tu ingreso temporal venció. Cancela e inicia sesión de nuevo con la contraseña temporal."
          : failure.message);
      }
    } finally {
      if (!controller.signal.aborted) setBusy(false);
      pending.current = null;
    }
  }

  return (
    <Modal title="Cambia tu contraseña temporal" close={close}>
      <form className="pn-recovery" onSubmit={submit} aria-busy={busy}>
        <p>Antes de ingresar por primera vez, elige una contraseña personal de al menos 8 caracteres.</p>
        <label htmlFor="temporary-new-password">Nueva contraseña</label>
        <input id="temporary-new-password" type="password" autoComplete="new-password"
          value={password} onChange={e => setPassword(e.target.value)} minLength={8} required disabled={busy} />
        <label htmlFor="temporary-confirm-password">Confirmar nueva contraseña</label>
        <input id="temporary-confirm-password" type="password" autoComplete="new-password"
          value={confirmation} onChange={e => setConfirmation(e.target.value)} minLength={8} required disabled={busy} />
        {error && <p className="pn-info" role="alert">{error}</p>}
        <button className="pn-button" type="submit" disabled={busy}>
          {busy ? "Guardando…" : "Guardar nueva contraseña"}
        </button>
        <button className="pn-button secondary" type="button" onClick={close} disabled={busy}>Cancelar cambio</button>
      </form>
    </Modal>
  );
}
