import { useEffect } from "react";
import { requestJson } from "./api";
import type { DashboardActivityDto } from "./api-types";
import {
  readActivityBaseline,
  setPwaBadge,
  showPwaNotification,
  usePwaSnapshot,
  writeActivityBaseline,
} from "./pwa";

const POLL_MS = 10 * 60 * 1000;
const FIRST_CHECK_MS = 6000;

function timestampOf(activity: DashboardActivityDto): number {
  if (!activity.timestamp) return 0;
  const value = new Date(activity.timestamp).getTime();
  return Number.isFinite(value) ? value : 0;
}

/**
 * Vigila el feed de actividades SOLO cuando el usuario activó notificaciones.
 *
 * - La primera lectura fija una línea base (no notifica eventos históricos).
 * - Cada 10 min (y al recuperar conexión/visibilidad) busca novedades.
 * - Si la app está en segundo plano, lanza una notificación local nativa y
 *   actualiza el badge del icono. Si está visible, solo actualiza el badge:
 *   el feed ya se ve en pantalla y no se duplica el aviso.
 *
 * No crea conexiones nuevas: reutiliza GET /api/dashboard/activities.
 */
export function usePwaActivityWatch(enabled: boolean): void {
  const permission = usePwaSnapshot().notificationPermission;

  useEffect(() => {
    if (!enabled || typeof window === "undefined") return;
    if (permission !== "granted") return;

    let active = true;
    let inFlight = false;

    const check = async () => {
      if (!active || inFlight || !navigator.onLine) return;
      inFlight = true;
      try {
        const activities = await requestJson<DashboardActivityDto[]>(
          "/dashboard/activities",
          { skipAuthRedirect: true, timeoutMs: 15_000 },
        );
        if (!active || !Array.isArray(activities) || activities.length === 0) {
          return;
        }

        const sorted = [...activities].sort(
          (a, b) => timestampOf(b) - timestampOf(a),
        );
        const newest = timestampOf(sorted[0]);
        if (!newest) return;

        const baseline = readActivityBaseline();
        if (baseline == null) {
          writeActivityBaseline(newest);
          return;
        }

        const fresh = sorted.filter((item) => timestampOf(item) > baseline);
        if (fresh.length === 0) return;

        writeActivityBaseline(newest);
        void setPwaBadge(fresh.length);

        if (document.visibilityState === "hidden") {
          const first = fresh[0];
          const title =
            fresh.length === 1
              ? first.title ?? "Nueva novedad en PeopleNet"
              : `${fresh.length} novedades en PeopleNet`;
          const body =
            fresh.length === 1
              ? first.description ?? "Abre tu espacio para verla."
              : "Abre tu espacio para revisarlas.";
          void showPwaNotification({
            title,
            body,
            tag: "peoplenet-activity",
            url: "/dashboard/notifications",
          });
        }
      } catch {
        // Sin red, sesión expirada o endpoint caído: el próximo ciclo reintenta
        // sin interrumpir la app (skipAuthRedirect evita un logout por el poll).
      } finally {
        inFlight = false;
      }
    };

    const firstTimer = window.setTimeout(() => void check(), FIRST_CHECK_MS);
    const interval = window.setInterval(() => void check(), POLL_MS);
    const onVisibility = () => {
      if (document.visibilityState === "visible") void check();
    };
    const onOnline = () => void check();

    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("online", onOnline);

    return () => {
      active = false;
      window.clearTimeout(firstTimer);
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("online", onOnline);
    };
  }, [enabled, permission]);
}
