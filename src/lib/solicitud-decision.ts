import { ApiError, requestJson } from "./api";
import type { SolicitudNovedadResponse } from "./api-types";

export interface SolicitudCausal {
  id: number;
  descripcion: string;
  activo: boolean;
}

export type ManagerDecision = "APROBAR" | "RECHAZAR";

export async function decideSolicitud(id: number, decision: ManagerDecision, causal: string | null,
  observaciones: string, signal: AbortSignal): Promise<SolicitudNovedadResponse> {
  const response = await requestJson<SolicitudNovedadResponse>(`/solicitudes/${id}/decision`, {
    method: "POST", body: { decision, causal, observaciones: observaciones.trim() || null, rol: "JEFE" }, signal,
  });
  if (response?.id !== id || !response.estado) {
    throw new ApiError("El servidor no confirmó la decisión. Actualiza la bandeja para revisar su estado.");
  }
  return response;
}
