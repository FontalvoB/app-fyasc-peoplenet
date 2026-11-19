import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { DetailSheet } from "./DetailSheet";
import { Button, Icon } from "./shared";
import { BUILD_INFO } from "../lib/config";
import {
  applyPwaUpdate,
  canOfferInstallNow,
  checkPwaUpdate,
  dismissInstallPermanently,
  dismissInstallSheet,
  dismissOfflineReady,
  dismissPwaUpdate,
  enablePwaNotifications,
  markInstallAutoShown,
  openInstallSheet,
  promptPwaInstall,
  shouldOfferInstall,
  showPwaNotification,
  usePwaSnapshot,
  wasInstallAutoShown,
  type PwaSnapshot,
} from "../lib/pwa";
import "./pwa-native.css";

function isPwaBuild(): boolean {
  return import.meta.env.MODE === "pwa";
}

function notificationCopy(permission: PwaSnapshot["notificationPermission"]): {
  title: string;
  detail: string;
  tone: "ok" | "warn" | "bad";
} {
  switch (permission) {
    case "granted":
      return {
        title: "Notificaciones activas",
        detail: "Te avisaremos de solicitudes, documentos y novedades.",
        tone: "ok",
      };
    case "denied":
      return {
        title: "Notificaciones bloqueadas",
        detail: "Actívalas desde los ajustes del navegador para este sitio.",
        tone: "bad",
      };
    case "unsupported":
      return {
        title: "No disponibles",
        detail: "Este navegador no permite notificaciones web.",
        tone: "bad",
      };
    default:
      return {
        title: "Notificaciones",
        detail: "Recibe avisos de tu espacio incluso en segundo plano.",
        tone: "warn",
      };
  }
}

function UpdateSheet({ pwa }: { pwa: PwaSnapshot }) {
  return (
    <DetailSheet
      title="Nueva versión disponible"
      close={dismissPwaUpdate}
      dismissible={!pwa.applying}
      footer={
        <>
          <Button secondary disabled={pwa.applying} onClick={dismissPwaUpdate}>
            Más tarde
          </Button>
          <Button
            disabled={pwa.applying}
            onClick={() => void applyPwaUpdate()}
          >
            {pwa.applying ? "Actualizando…" : "Actualizar ahora"}
          </Button>
        </>
      }
    >
      <div className="pwa-sheet-hero">
        <span className="pwa-sheet-hero-icon" aria-hidden="true">
          <Icon name="system_update" size={30} />
        </span>
        <div>
          <strong>Hay una versión más reciente de PeopleNet.</strong>
          <p>
            Actualiza para recibir las últimas mejoras sin desinstalar ni volver
            a instalar la app.
          </p>
        </div>
      </div>
      <ul className="pwa-check-list">
        <li>
          <Icon name="check_circle" size={18} />
          Tu sesión y tus datos se conservan.
        </li>
        <li>
          <Icon name="check_circle" size={18} />
          La app se recarga una sola vez al terminar.
        </li>
        <li>
          <Icon name="check_circle" size={18} />
          No necesitas borrar la app del teléfono.
        </li>
      </ul>
      <p className="pwa-sheet-note">
        Si estás llenando un formulario, guarda los cambios antes de actualizar.
      </p>
    </DetailSheet>
  );
}

function InstallSheet({ pwa }: { pwa: PwaSnapshot }) {
  const [error, setError] = useState<string | null>(null);

  const install = async () => {
    setError(null);
    const result = await promptPwaInstall();
    if (result === "accepted" || result === "dismissed") {
      dismissInstallSheet();
      return;
    }
    if (result === "unavailable") {
      setError(
        "El navegador no mostró el instalador. Usa el menú ⋮ del navegador y elige «Instalar aplicación».",
      );
    }
  };

  if (pwa.iosManualInstall) {
    return (
      <DetailSheet
        title="Instala PeopleNet"
        close={dismissInstallSheet}
        footer={
          <>
            <Button secondary onClick={dismissInstallPermanently}>
              Ahora no
            </Button>
            <Button onClick={dismissInstallSheet}>Entendido</Button>
          </>
        }
      >
        <div className="pwa-sheet-hero">
          <span className="pwa-sheet-hero-icon" aria-hidden="true">
            <Icon name="ios_share" size={30} />
          </span>
          <div>
            <strong>Añádela a tu pantalla de inicio</strong>
            <p>
              En iPhone o iPad debes hacerlo desde Safari. Queda como una app más,
              sin pasar por la tienda.
            </p>
          </div>
        </div>
        <ol className="pwa-install-steps">
          <li>
            <span>1</span>
            Toca el botón <strong>Compartir</strong> de Safari.
          </li>
          <li>
            <span>2</span>
            Elige <strong>Añadir a pantalla de inicio</strong>.
          </li>
          <li>
            <span>3</span>
            Confirma con <strong>Añadir</strong>.
          </li>
        </ol>
      </DetailSheet>
    );
  }

  return (
    <DetailSheet
      title="Instala PeopleNet"
      close={dismissInstallSheet}
      footer={
        <>
          <Button secondary onClick={dismissInstallPermanently}>
            Ahora no
          </Button>
          <Button onClick={() => void install()}>Instalar ahora</Button>
        </>
      }
    >
      <div className="pwa-sheet-hero">
        <span className="pwa-sheet-hero-icon" aria-hidden="true">
          <Icon name="install_mobile" size={30} />
        </span>
        <div>
          <strong>Tu espacio, a un toque del inicio.</strong>
          <p>
            Instálala para abrirla en pantalla completa, con su propio icono y
            notificaciones.
          </p>
        </div>
      </div>
      <ul className="pwa-check-list">
        <li>
          <Icon name="check_circle" size={18} />
          Acceso directo desde la pantalla de inicio.
        </li>
        <li>
          <Icon name="check_circle" size={18} />
          Más rápida, sin barra de navegador.
        </li>
        <li>
          <Icon name="check_circle" size={18} />
          Recibe actualizaciones automáticamente.
        </li>
      </ul>
      {error && (
        <p className="pn-info" role="alert">
          {error}
        </p>
      )}
    </DetailSheet>
  );
}

function OfflineNotice({ online }: { online: boolean }) {
  if (online) return null;
  return (
    <div className="pwa-offline-pill" role="status" aria-live="polite">
      <Icon name="cloud_off" size={16} />
      Sin conexión
    </div>
  );
}

function OfflineReadyToast({ pwa }: { pwa: PwaSnapshot }) {
  if (!pwa.offlineReady || pwa.needRefresh) return null;
  return (
    <div className="pwa-toast" role="status" aria-live="polite">
      <Icon name="download_for_offline" size={18} />
      <span>Listo para usar sin conexión.</span>
      <button type="button" aria-label="Cerrar aviso" onClick={dismissOfflineReady}>
        <Icon name="close" size={16} />
      </button>
    </div>
  );
}

/**
 * Capa global de experiencia nativa. Se monta fuera de Workspace para que la
 * actualización también pueda avisarse en el login (sin sesión).
 */
export function PwaRuntime() {
  const pwa = usePwaSnapshot();
  const location = useLocation();

  useEffect(() => {
    // Solo en la build PWA instalable; en dev/tests no se interrumpe el flujo.
    if (!isPwaBuild()) return;
    // Solo en el inicio autenticado: no interrumpir formularios ni flujos.
    if (location.pathname !== "/dashboard") return;
    if (pwa.installed || pwa.installDismissed || pwa.installSheetOpen) return;
    if (!shouldOfferInstall() || wasInstallAutoShown()) return;
    const timer = window.setTimeout(() => {
      markInstallAutoShown();
      openInstallSheet();
    }, 25_000);
    return () => window.clearTimeout(timer);
  }, [
    location.pathname,
    pwa.installed,
    pwa.installDismissed,
    pwa.installSheetOpen,
    pwa.canInstall,
    pwa.iosManualInstall,
  ]);

  return (
    <>
      <OfflineNotice online={pwa.isOnline} />
      <OfflineReadyToast pwa={pwa} />
      {pwa.needRefresh ? (
        <UpdateSheet pwa={pwa} />
      ) : pwa.installSheetOpen ? (
        <InstallSheet pwa={pwa} />
      ) : null}
    </>
  );
}

export function PwaPreferences() {
  const pwa = usePwaSnapshot();
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const notification = notificationCopy(pwa.notificationPermission);
  const notificationDetail =
    pwa.iosManualInstall && pwa.notificationPermission === "default"
      ? "En iPhone, primero añade la app a la pantalla de inicio y luego activa el permiso."
      : notification.detail;
  const pwaBuild = isPwaBuild();

  const enableNotifications = async () => {
    setBusy(true);
    setNotice(null);
    const result = await enablePwaNotifications();
    setBusy(false);
    if (result === "denied") {
      setNotice(
        "El navegador bloqueó las notificaciones. Habilítalas en los ajustes del sitio.",
      );
    } else if (result === "unsupported") {
      setNotice("Este navegador no permite notificaciones web.");
    }
  };

  const testNotification = async () => {
    setBusy(true);
    const shown = await showPwaNotification({
      title: "PeopleNet",
      body: "Así se verán las notificaciones de tu espacio.",
      tag: "peoplenet-test",
    });
    setBusy(false);
    setNotice(
      shown
        ? "Notificación enviada."
        : "No se pudo mostrar la notificación. Revisa el permiso del navegador.",
    );
    window.setTimeout(() => setNotice(null), 4000);
  };

  const checkUpdate = async () => {
    setNotice(null);
    const available = await checkPwaUpdate();
    setNotice(
      available
        ? "Hay una actualización lista para instalar."
        : "Estás al día con la última versión.",
    );
    window.setTimeout(() => setNotice(null), 5000);
  };

  return (
    <section className="pn-panel pn-form" aria-label="Aplicación y notificaciones">
      <h2>Aplicación</h2>
      <p className="small-muted">
        Notificaciones, instalación y actualizaciones de tu app.
      </p>

      <div className="pwa-pref-list">
        <div className="pwa-pref-row">
          <span className="pwa-pref-icon" aria-hidden="true">
            <Icon
              name={
                pwa.notificationPermission === "granted"
                  ? "notifications_active"
                  : "notifications"
              }
              size={20}
            />
          </span>
          <div className="pwa-pref-copy">
            <strong>{notification.title}</strong>
            <p>{notificationDetail}</p>
          </div>
          <div className="pwa-pref-action">
            {pwa.notificationPermission === "granted" ? (
              <Button secondary disabled={busy} onClick={() => void testNotification()}>
                Enviar prueba
              </Button>
            ) : pwa.notificationPermission === "default" ? (
              <Button disabled={busy} onClick={() => void enableNotifications()}>
                {busy ? "Activando…" : "Activar"}
              </Button>
            ) : (
              <span className={`pwa-pref-status ${notification.tone}`}>
                {notification.tone === "bad" ? "Bloqueadas" : "Inactivas"}
              </span>
            )}
          </div>
        </div>

        <div className="pwa-pref-row">
          <span className="pwa-pref-icon" aria-hidden="true">
            <Icon name="install_mobile" size={20} />
          </span>
          <div className="pwa-pref-copy">
            <strong>Instalar en el teléfono</strong>
            <p>
              {pwa.installed
                ? "La app ya está instalada y se abre desde su icono."
                : "Acceso directo, pantalla completa y notificaciones."}
            </p>
          </div>
          <div className="pwa-pref-action">
            {pwa.installed ? (
              <span className="pwa-pref-status ok">Instalada</span>
            ) : canOfferInstallNow() ? (
              <Button secondary onClick={openInstallSheet}>
                Instalar
              </Button>
            ) : (
              <span className="pwa-pref-status warn">Desde el navegador</span>
            )}
          </div>
        </div>

        <div className="pwa-pref-row">
          <span className="pwa-pref-icon" aria-hidden="true">
            <Icon name="system_update" size={20} />
          </span>
          <div className="pwa-pref-copy">
            <strong>Versión de la app</strong>
            <p>
              {pwaBuild
                ? `v${BUILD_INFO.version} · Build web (${BUILD_INFO.env}) · actualizaciones automáticas.`
                : "Disponible en la build PWA instalable."}
            </p>
          </div>
          <div className="pwa-pref-action">
            {pwa.needRefresh ? (
              <Button onClick={() => void applyPwaUpdate()}>Actualizar</Button>
            ) : (
              <Button
                secondary
                disabled={pwa.checking || !pwaBuild}
                onClick={() => void checkUpdate()}
              >
                {pwa.checking ? "Buscando…" : "Buscar"}
              </Button>
            )}
          </div>
        </div>
      </div>

      {notice && (
        <p className="pn-info pwa-pref-notice" role="status">
          {notice}
        </p>
      )}
    </section>
  );
}

/** Aviso contextual para activar notificaciones desde la bandeja. */
export function NotificationOptIn() {
  const pwa = usePwaSnapshot();
  const [busy, setBusy] = useState(false);
  if (pwa.notificationPermission !== "default") return null;

  const activate = async () => {
    setBusy(true);
    await enablePwaNotifications();
    setBusy(false);
  };

  return (
    <div className="pn-info pwa-optin" role="note">
      <span className="pwa-pref-icon" aria-hidden="true">
        <Icon name="notifications_active" size={20} />
      </span>
      <div>
        <strong>Activa las notificaciones</strong>
        <p>
          Entérate de solicitudes, documentos y novedades aunque no tengas la app
          abierta.
        </p>
      </div>
      <Button disabled={busy} onClick={() => void activate()}>
        {busy ? "Activando…" : "Activar"}
      </Button>
    </div>
  );
}
