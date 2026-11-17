import { useEffect, useRef, useState, type FormEvent } from "react";
import { toApiError } from "../lib/api";
import { confirmPasswordReset, requestPasswordReset } from "../lib/password-reset";
import { Modal } from "./shared";
import "./password-recovery.css";

export function PasswordRecovery({ initialEmail, close, onReset }: {
  initialEmail: string; close: () => void; onReset: () => void;
}) {
  const [step, setStep] = useState<"email" | "code" | "success">("email");
  const [email, setEmail] = useState(initialEmail.includes("@") ? initialEmail.trim() : "");
  const [token, setToken] = useState("");
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
    if (step === "code" && password !== confirmation) {
      setError("Las contraseñas no coinciden.");
      return;
    }
    const controller = new AbortController();
    pending.current = controller;
    setBusy(true);
    try {
      if (step === "email") {
        await requestPasswordReset(email.trim(), controller.signal);
        if (!controller.signal.aborted) setStep("code");
      } else {
        await confirmPasswordReset(token.trim(), password, confirmation, controller.signal);
        if (!controller.signal.aborted) {
          setPassword("");
          setConfirmation("");
          setToken("");
          setStep("success");
          onReset();
        }
      }
    } catch (err) {
      if (!controller.signal.aborted) {
        const failure = toApiError(err);
        setError(step === "code" && failure.status === 400
          ? "No se pudo restablecer la contraseña. Revisa el código; puede ser inválido, haber vencido o haberse utilizado. Puedes solicitar uno nuevo."
          : failure.message);
      }
    } finally {
      if (!controller.signal.aborted) setBusy(false);
      pending.current = null;
    }
  }

  return (
    <Modal title="Recupera tu acceso" close={close}>
      {step === "success" ? (
        <div className="pn-recovery">
          <p role="status">Contraseña restablecida. Ya puedes iniciar sesión con tu nueva contraseña.</p>
          <button className="pn-button" onClick={close}>Volver a iniciar sesión</button>
        </div>
      ) : (
        <form className="pn-recovery" onSubmit={submit} aria-busy={busy}>
          {step === "email" ? (
            <>
              <p>Ingresa el correo registrado en PeopleNet. Te enviaremos un código para restablecer tu contraseña.</p>
              <label htmlFor="recovery-email">Correo electrónico</label>
              <input id="recovery-email" type="email" autoComplete="email" autoCapitalize="none"
                value={email} onChange={e => setEmail(e.target.value)} required disabled={busy} />
            </>
          ) : (
            <>
              <p role="status">Copia el código de recuperación de tu correo. Revisa también el correo no deseado. El código tiene validez de 24 horas.</p>
              <label htmlFor="recovery-code">Código del correo</label>
              <input id="recovery-code" type="text" autoComplete="one-time-code" autoCapitalize="none" spellCheck={false}
                value={token} onChange={e => setToken(e.target.value)} required disabled={busy} />
              <label htmlFor="recovery-password">Nueva contraseña</label>
              <input id="recovery-password" type="password" autoComplete="new-password" minLength={8}
                value={password} onChange={e => setPassword(e.target.value)} required disabled={busy} />
              <small>Usa al menos 8 caracteres.</small>
              <label htmlFor="recovery-confirmation">Confirmar nueva contraseña</label>
              <input id="recovery-confirmation" type="password" autoComplete="new-password" minLength={8}
                value={confirmation} onChange={e => setConfirmation(e.target.value)} required disabled={busy} />
            </>
          )}
          {error && <p role="alert" className="pn-info">{error}</p>}
          <button className="pn-button" type="submit" disabled={busy}>
            {busy ? "Procesando…" : step === "email" ? "Enviar código" : "Restablecer contraseña"}
          </button>
          {step === "email" ? (
            <button className="pn-button secondary" type="button" disabled={busy}
              onClick={() => { setStep("code"); setError(""); }}>Ya tengo un código</button>
          ) : (
            <button className="pn-button secondary" type="button" disabled={busy}
              onClick={() => { setStep("email"); setToken(""); setError(""); }}>Solicitar otro código</button>
          )}
        </form>
      )}
    </Modal>
  );
}
