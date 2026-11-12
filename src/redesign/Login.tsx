import { useRef, useState, type FormEvent } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { useHistory } from "react-router-dom";
import { Icon, Modal } from "./shared";
import { login, toApiError } from "../lib/api";
import logo from "./assets/peoplenet-mark.svg";
import "./login.css";

const features = [
  ["calendar_month", "Novedades"],
  ["description", "Trámites"],
  ["person", "Mi información"],
];
const entryEase = [0.22, 1, 0.36, 1] as const;

function LoginBrand() {
  return (
    <div
      className="entry-brand"
      role="img"
      aria-label="PeopleNet, Gestión humana"
    >
      <img
        className="entry-brand-mark"
        src={logo}
        width="128"
        height="139"
        alt=""
      />
      <div>
        <span className="entry-wordmark">
          people<span>net</span>
        </span>
        <span className="entry-tagline">GESTIÓN HUMANA</span>
      </div>
    </div>
  );
}

/**
 * M1 — Login real contra POST /api/auth/login.
 * - Sin credenciales ni entrada demo hardcodeadas.
 * - El botón se deshabilita durante el submit para evitar doble petición.
 * - Errores en español (credencial inválida, red, 5xx).
 * - requirePasswordChange=true: mensaje claro y avance bloqueado (la sesión
 *   no se guarda: api.login() no persiste en ese caso).
 */
export function Login() {
  const history = useHistory();
  const reduceMotion = useReducedMotion();
  // The startup overlay provides the entrance; do not reveal a delayed empty sheet.
  const [coveredBySplash] = useState(() =>
    Boolean(document.getElementById("app-splash")),
  );
  const staticEntrance = reduceMotion || coveredBySplash;
  const entrance = (delay: number, scale = 1) => ({
    initial: staticEntrance ? (false as const) : { opacity: 0, y: 16, scale },
    animate: { opacity: 1, y: 0, scale: 1 },
    transition: {
      duration: reduceMotion ? 0 : 0.38,
      delay: reduceMotion ? 0 : delay,
      ease: entryEase,
    },
  });
  const [show, setShow] = useState(false);
  const [help, setHelp] = useState(false);
  const helpButton = useRef<HTMLButtonElement>(null);
  const closeHelp = () => {
    setHelp(false);
    requestAnimationFrame(() => helpButton.current?.focus({ preventScroll: true }));
  };
  const [username, setUsername] = useState(() => {
    try {
      return localStorage.getItem("pn-remember") || "";
    } catch {
      return "";
    }
  });
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [passwordChangeRequired, setPasswordChangeRequired] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (submitting) return;
    setError("");
    setPasswordChangeRequired(false);
    const user = username.trim();
    const pass = password;
    if (!user || !pass) {
      setError("Ingresa tu usuario y tu contraseña.");
      return;
    }
    setSubmitting(true);
    try {
      const response = await login({ username: user, password: pass });
      if (response.requirePasswordChange === true) {
        // Cuenta bloqueada por política de cambio de contraseña: no avanzar
        // ni crear sesión (decisión O0; flujo de cambio pendiente de backend).
        setPasswordChangeRequired(true);
        setError(
          "Tu cuenta requiere cambiar la contraseña antes de continuar. " +
            "Usa la opción de recuperación de acceso o contacta a Gestión Humana.",
        );
        return;
      }
      history.push("/dashboard");
    } catch (err) {
      const apiError = toApiError(err);
      setError(apiError.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="premium-login" data-reduced-motion={Boolean(reduceMotion)}>
      <svg
        className="entry-wave"
        viewBox="0 0 1440 240"
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        <path
          className="entry-wave-base"
          d="M0 150C460 10 820 240 1440 95V240H0Z"
        />
        <path
          className="entry-wave-accent"
          d="M0 150C460 10 820 240 1440 95"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
      <div className="entry-layout">
        <section className="entry-story" aria-labelledby="entry-title">
          <img className="entry-hero" src="/images/people/login-hero.webp" alt="" fetchPriority="high" />
          <svg className="entry-story-wave" viewBox="0 0 900 100" preserveAspectRatio="none" aria-hidden="true">
            <path fill="#09b6f2" d="M0 35C260 12 430 110 900 35V100H0Z" />
            <path fill="#ffd335" d="M0 80C380 95 650 98 900 0V100H0Z" />
            <path fill="#fbfcff" d="M0 92C230 0 480 100 900 85V100H0Z" />
          </svg>
          <motion.div {...entrance(0, 0.94)}>
            <LoginBrand />
          </motion.div>
          <h1 id="entry-title" aria-label="Tu talento. Todo más fácil.">
            <motion.span className="entry-title-line" {...entrance(0.08)}>
              Tu talento.
            </motion.span>
            <motion.span className="entry-title-line" {...entrance(0.16)}>
              <span className="entry-claim">
                Todo
              </span>{" "}
              <span className="entry-title-accent">más fácil.</span>
            </motion.span>
          </h1>
          <motion.p className="entry-intro" {...entrance(0.24)}>
            Tus trámites de talento humano,
            <br />
            en un solo lugar.
          </motion.p>
          <ul
            className="entry-features"
            aria-label="Tu espacio de talento humano"
          >
            {features.map(([icon, label], index) => (
              <motion.li key={icon} {...entrance(0.3 + index * 0.07)}>
                <span className={`entry-tile entry-tile-${index + 1}`}>
                  <Icon name={icon} size={30} />
                </span>
                <span>{label}</span>
              </motion.li>
            ))}
          </ul>
        </section>
        <motion.section
          className="entry-card"
          aria-labelledby="entry-welcome"
          initial={staticEntrance ? false : { opacity: 0, y: 24, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={
            reduceMotion
              ? { duration: 0 }
              : {
                  type: "spring",
                  visualDuration: 0.45,
                  bounce: 0.08,
                  delay: 0.35,
                }
          }
        >
          <h2 id="entry-welcome">Bienvenido de nuevo</h2>
          <form onSubmit={handleSubmit} aria-busy={submitting}>
            <label className="entry-sr-only" htmlFor="login-username">
              Usuario o correo corporativo
            </label>
            <div className="entry-field">
              <Icon name="person" size={24} />
              <input
                id="login-username"
                type="text"
                placeholder="Usuario o correo corporativo"
                autoComplete="username"
                autoCapitalize="none"
                spellCheck={false}
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                disabled={submitting}
                required
                aria-invalid={Boolean(error)}
                aria-describedby={error ? "entry-error" : undefined}
              />
            </div>
            <label className="entry-sr-only" htmlFor="login-password">
              Contraseña
            </label>
            <div className="entry-field">
              <Icon name="lock" size={24} />
              <input
                id="login-password"
                type={show ? "text" : "password"}
                placeholder="Contraseña"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={submitting}
                required
                aria-invalid={Boolean(error)}
                aria-describedby={error ? "entry-error" : undefined}
              />
              <button
                className="entry-eye"
                type="button"
                aria-label={show ? "Ocultar contraseña" : "Mostrar contraseña"}
                aria-pressed={show}
                aria-controls="login-password"
                onClick={() => setShow(!show)}
                disabled={submitting}
              >
                <Icon name={show ? "visibility_off" : "visibility"} size={22} />
              </button>
            </div>
            <button
              type="button"
              className="entry-help-toggle"
              ref={helpButton}
              aria-expanded={help}
              aria-haspopup="dialog"
              onClick={() => setHelp(true)}
            >
              ¿Olvidaste tu contraseña?
            </button>
            {error && (
              <p id="entry-error" role="alert" className="entry-error">
                <Icon name="error" />
                <span>{error}</span>
              </p>
            )}
            <motion.button
              className="entry-submit"
              type="submit"
              disabled={submitting}
              whileHover={reduceMotion || submitting ? undefined : { y: -1 }}
              whileTap={
                reduceMotion || submitting ? undefined : { scale: 0.98 }
              }
              transition={{
                y: { duration: 0.25, ease: entryEase },
                scale: { duration: 0.12 },
              }}
            >
              <span>
                {submitting ? (
                  <>
                    <span className="entry-spinner" aria-hidden="true" />
                    Iniciando sesión…
                  </>
                ) : (
                  "Iniciar sesión"
                )}
              </span>
              {!submitting && <Icon name="arrow_forward" size={26} />}
            </motion.button>
          </form>
          {passwordChangeRequired && (
            <p className="entry-blocked">
              Tu acceso está bloqueado hasta cambiar la contraseña
            </p>
          )}
          <p className="entry-community"><Icon name="diversity_3" size={28} /><span>Juntos construimos un mejor lugar</span></p>
        </motion.section>
      </div>
      {help && (
        <Modal title="Recupera tu acceso" close={closeHelp}>
          <p className="entry-help">
            Si olvidaste tu contraseña o tu usuario, contacta a Gestión Humana
            para recuperar tu acceso.
          </p>
        </Modal>
      )}
    </main>
  );
}
