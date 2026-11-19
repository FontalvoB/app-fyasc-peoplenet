/**
 * Ciclo de vida PWA (PeopleNet).
 *
 * Responsabilidades:
 * - Registrar el service worker y avisar cuando hay un despliegue nuevo.
 * - Aplicar la actualización SOLO cuando el usuario lo confirma.
 * - Capturar la instalación nativa (beforeinstallprompt) y el estado instalado.
 * - Centralizar notificaciones locales, badge del icono y permisos.
 *
 * No toca la capa API ni el estado de autenticación: usa exclusivamente APIs
 * del navegador. Las notificaciones Push reales (app cerrada) requieren un
 * backend con VAPID; aquí queda listo el handler `push` del service worker.
 */

import { useSyncExternalStore } from "react";
import { registerSW } from "virtual:pwa-register";

export type PwaNotificationPermission =
  | NotificationPermission
  | "unsupported";

export interface PwaSnapshot {
  /** Hay una versión nueva esperando a que el usuario la aplique. */
  needRefresh: boolean;
  /** El shell ya quedó listo para funcionar sin conexión (primer install). */
  offlineReady: boolean;
  /** Se está aplicando la actualización (evita dobles clics). */
  applying: boolean;
  /** Se está consultando al servidor si hay una versión nueva. */
  checking: boolean;
  /** El navegador ya puede mostrar el prompt nativo de instalación. */
  canInstall: boolean;
  /** La app se abrió desde el icono instalado (o se instaló en esta sesión). */
  installed: boolean;
  /** iOS no expone beforeinstallprompt: se muestran instrucciones manuales. */
  iosManualInstall: boolean;
  /** El usuario pidió abrir el modal de instalación. */
  installSheetOpen: boolean;
  /** El usuario descartó la instalación recientemente. */
  installDismissed: boolean;
  isOnline: boolean;
  notificationPermission: PwaNotificationPermission;
}

interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  readonly userChoice: Promise<{
    outcome: "accepted" | "dismissed";
    platform: string;
  }>;
  prompt(): Promise<void>;
}

interface InstallableNavigator extends Navigator {
  /** Web Install API (aún no nativa en navegadores estables). */
  install?: () => Promise<void>;
}

type UpdateServiceWorker = (reloadPage?: boolean) => Promise<void>;
type Listener = () => void;

const INSTALL_DISMISS_KEY = "pn-v2-install-dismissed";
const INSTALL_AUTO_KEY = "pn-v2-install-auto-shown";
const INSTALL_DISMISS_MS = 7 * 24 * 60 * 60 * 1000;
const UPDATE_CHECK_MS = 30 * 60 * 1000;
const ACTIVITY_BASELINE_KEY = "pn-v2-activities-seen";

const listeners = new Set<Listener>();
let initialized = false;
let registration: ServiceWorkerRegistration | null = null;
let updateSW: UpdateServiceWorker | null = null;
let deferredInstall: BeforeInstallPromptEvent | null = null;

function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  const media = window.matchMedia?.("(display-mode: standalone)");
  const iosStandalone = (
    navigator as Navigator & { standalone?: boolean }
  ).standalone;
  return Boolean(media?.matches) || iosStandalone === true;
}

function isIos(): boolean {
  if (typeof navigator === "undefined") return false;
  return /iphone|ipad|ipod/i.test(navigator.userAgent);
}

function isIosSafari(): boolean {
  return isIos() && !/crios|fxios|edgios/i.test(navigator.userAgent);
}

function supportsWebInstall(): boolean {
  return (
    typeof navigator !== "undefined" &&
    typeof (navigator as InstallableNavigator).install === "function"
  );
}

function readInstallDismissed(): boolean {
  try {
    const raw = localStorage.getItem(INSTALL_DISMISS_KEY);
    if (!raw) return false;
    const dismissedAt = Number(raw);
    return Number.isFinite(dismissedAt) && Date.now() - dismissedAt < INSTALL_DISMISS_MS;
  } catch {
    return false;
  }
}

export function readNotificationPermission(): PwaNotificationPermission {
  if (typeof Notification === "undefined") return "unsupported";
  return Notification.permission;
}

function initialSnapshot(): PwaSnapshot {
  return {
    needRefresh: false,
    offlineReady: false,
    applying: false,
    checking: false,
    canInstall: supportsWebInstall(),
    installed: isStandalone(),
    iosManualInstall: isIosSafari(),
    installSheetOpen: false,
    installDismissed: readInstallDismissed(),
    isOnline: typeof navigator === "undefined" ? true : navigator.onLine,
    notificationPermission: readNotificationPermission(),
  };
}

let snapshot: PwaSnapshot = initialSnapshot();

function emit(): void {
  listeners.forEach((listener) => listener());
}

function patch(update: Partial<PwaSnapshot>): void {
  snapshot = { ...snapshot, ...update };
  emit();
}

export function subscribePwa(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getPwaSnapshot(): PwaSnapshot {
  return snapshot;
}

/** Hook React para leer el estado PWA de forma reactiva. */
export function usePwaSnapshot(): PwaSnapshot {
  return useSyncExternalStore(subscribePwa, getPwaSnapshot, getPwaSnapshot);
}

function registerBrowserListeners(): void {
  window.addEventListener("online", () => {
    patch({ isOnline: true });
    void refreshUpdate();
  });
  window.addEventListener("offline", () => patch({ isOnline: false }));

  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    deferredInstall = event as BeforeInstallPromptEvent;
    patch({ canInstall: true });
  });

  window.addEventListener("appinstalled", () => {
    deferredInstall = null;
    try {
      localStorage.removeItem(INSTALL_DISMISS_KEY);
    } catch {
      /* storage bloqueado: el estado en memoria basta */
    }
    patch({
      canInstall: false,
      installed: true,
      installSheetOpen: false,
      installDismissed: false,
    });
  });

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState !== "visible") return;
    patch({ notificationPermission: readNotificationPermission() });
    void refreshUpdate();
  });
}

async function refreshUpdate(): Promise<void> {
  if (!registration || !navigator.onLine) return;
  try {
    await registration.update();
  } catch {
    /* sin red o SW no disponible: se reintenta en el próximo ciclo */
  }
}

/**
 * Inicializa la PWA una sola vez. Debe llamarse antes de renderizar React
 * (main.tsx) para capturar beforeinstallprompt y registrar el SW temprano.
 */
export function initPwa(): void {
  if (initialized || typeof window === "undefined") return;
  initialized = true;
  registerBrowserListeners();

  if (import.meta.env.MODE !== "pwa") return;

  updateSW = registerSW({
    immediate: true,
    onNeedRefresh() {
      patch({ needRefresh: true, applying: false });
    },
    onOfflineReady() {
      patch({ offlineReady: true });
      window.setTimeout(() => patch({ offlineReady: false }), 6000);
    },
    onRegisteredSW(_swUrl, swRegistration) {
      registration = swRegistration ?? null;
      if (!registration) return;
      // Installed PWAs may be suspended for days: check on resume and
      // periodically, never auto-reload the page.
      window.setTimeout(() => void refreshUpdate(), 8000);
      window.setInterval(() => {
        if (document.visibilityState === "visible") void refreshUpdate();
      }, UPDATE_CHECK_MS);
    },
    onRegisterError(error) {
      console.warn("[pwa] No se pudo registrar el service worker", error);
    },
  });
}

export function dismissPwaUpdate(): void {
  patch({ needRefresh: false });
}

export async function applyPwaUpdate(): Promise<void> {
  if (snapshot.applying) return;
  patch({ applying: true });

  const sw = navigator.serviceWorker;
  // Reload only after the new SW controls the page; reloading before that
  // serves index.html from the old precache (the update appears one load late).
  const becomesControlled = new Promise<void>((resolve) => {
    if (!sw) {
      resolve();
      return;
    }
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      sw.removeEventListener("controllerchange", finish);
      resolve();
    };
    sw.addEventListener("controllerchange", finish);
    window.setTimeout(finish, 8000);
  });

  try {
    if (updateSW) {
      // false: envía SKIP_WAITING sin que WorkboxWindow recargue por su cuenta.
      await updateSW(false);
      await becomesControlled;
      window.location.reload();
    } else {
      window.location.reload();
    }
  } catch {
    window.location.reload();
  }
}

/** Fuerza una consulta manual; devuelve true si hay una versión esperando. */
export async function checkPwaUpdate(): Promise<boolean> {
  patch({ checking: true });
  try {
    const serviceWorker = navigator.serviceWorker;
    const registered = serviceWorker
      ? await serviceWorker.getRegistration().catch(() => undefined)
      : undefined;
    const current = registration ?? registered ?? null;
    if (!current) return false;
    registration = current;
    await current.update();
    await new Promise((resolve) => window.setTimeout(resolve, 1200));
    return Boolean(current.waiting || current.installing);
  } catch {
    return false;
  } finally {
    patch({ checking: false });
  }
}

export function dismissOfflineReady(): void {
  patch({ offlineReady: false });
}

export function openInstallSheet(): void {
  patch({ installSheetOpen: true });
}

export function dismissInstallSheet(): void {
  patch({ installSheetOpen: false });
}

export function dismissInstallPermanently(): void {
  try {
    localStorage.setItem(INSTALL_DISMISS_KEY, String(Date.now()));
  } catch {
    /* storage bloqueado: solo se oculta en esta sesión */
  }
  patch({ installDismissed: true, installSheetOpen: false });
}

export function markInstallAutoShown(): void {
  try {
    sessionStorage.setItem(INSTALL_AUTO_KEY, "1");
  } catch {
    /* noop */
  }
}

export function wasInstallAutoShown(): boolean {
  try {
    return sessionStorage.getItem(INSTALL_AUTO_KEY) === "1";
  } catch {
    return false;
  }
}

/** ¿El dispositivo puede instalar la app ahora mismo? */
export function canOfferInstallNow(): boolean {
  return !snapshot.installed && (snapshot.canInstall || snapshot.iosManualInstall);
}

/** ¿Debe mostrarse el aviso automático (respeta el "ahora no")? */
export function shouldOfferInstall(): boolean {
  return canOfferInstallNow() && !snapshot.installDismissed;
}

export async function promptPwaInstall(): Promise<
  "accepted" | "dismissed" | "unavailable"
> {
  // Preferimos la Web Install API cuando exista; si no, usamos el evento
  // beforeinstallprompt (Chrome/Edge). Debe llamarse desde el click para
  // conservar la activación transitoria del usuario.
  if (supportsWebInstall()) {
    try {
      await (navigator as InstallableNavigator).install?.();
      patch({ installed: true, installSheetOpen: false, canInstall: false });
      return "accepted";
    } catch (error) {
      const name = (error as { name?: string }).name;
      if (name === "AbortError") return "dismissed";
      return "unavailable";
    }
  }

  const event = deferredInstall;
  if (!event) return "unavailable";
  deferredInstall = null;
  patch({ canInstall: false });
  try {
    await event.prompt();
    const choice = await event.userChoice;
    if (choice.outcome === "accepted") {
      patch({ installed: true, installSheetOpen: false });
    }
    return choice.outcome;
  } catch {
    return "unavailable";
  }
}

export async function enablePwaNotifications(): Promise<PwaNotificationPermission> {
  if (typeof Notification === "undefined") {
    patch({ notificationPermission: "unsupported" });
    return "unsupported";
  }
  try {
    const result = await Notification.requestPermission();
    patch({ notificationPermission: result });
    if (result === "granted") {
      await showPwaNotification({
        title: "Notificaciones activadas",
        body: "Te avisaremos cuando haya novedades en tu espacio.",
        tag: "peoplenet-welcome",
        url: "/dashboard/notifications",
      });
    }
    return result;
  } catch {
    // iOS solo permite pedir permiso con la PWA instalada; un fallo aquí no
    // debe romper la pantalla de preferencias.
    const current = readNotificationPermission();
    patch({ notificationPermission: current });
    return current;
  }
}

export async function showPwaNotification({
  title,
  body,
  url = "/dashboard/notifications",
  tag = "peoplenet",
  icon = "/pwa-192x192.png",
}: {
  title: string;
  body?: string;
  url?: string;
  tag?: string;
  icon?: string;
}): Promise<boolean> {
  if (readNotificationPermission() !== "granted") return false;
  const options = {
    body,
    icon,
    badge: icon,
    tag,
    data: { url },
    vibrate: [12, 40, 12],
  } as NotificationOptions;

  try {
    const current = await navigator.serviceWorker?.getRegistration();
    if (current) {
      await current.showNotification(title, options);
      return true;
    }
    new Notification(title, options);
    return true;
  } catch {
    return false;
  }
}

export async function setPwaBadge(count: number): Promise<void> {
  // La Badging API no está en todos los lib.dom; se accede de forma opcional.
  const badging = navigator as unknown as {
    setAppBadge?: (contents?: number) => Promise<void>;
    clearAppBadge?: () => Promise<void>;
  };
  try {
    if (count > 0) await badging.setAppBadge?.(count);
    else await badging.clearAppBadge?.();
  } catch {
    /* el navegador puede no soportar badge: no es un error de la app */
  }
}

export async function clearPwaBadge(): Promise<void> {
  await setPwaBadge(0);
}

/**
 * Baseline del feed de actividades para no notificar eventos viejos al abrir
 * la app por primera vez. El watcher de `pwa-activity.ts` lo usa.
 */
export function readActivityBaseline(): number | null {
  try {
    const raw = localStorage.getItem(ACTIVITY_BASELINE_KEY);
    if (!raw) return null;
    const value = Number(raw);
    return Number.isFinite(value) ? value : null;
  } catch {
    return null;
  }
}

export function writeActivityBaseline(timestampMs: number): void {
  try {
    localStorage.setItem(ACTIVITY_BASELINE_KEY, String(timestampMs));
  } catch {
    /* noop */
  }
}
