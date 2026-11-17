import { useEffect, useRef, useState, type FormEvent } from "react";
import { toApiError, useApi } from "../lib/api";
import type { SolicitudNovedadResponse } from "../lib/api-types";
import { decideSolicitud, type ManagerDecision as Decision, type SolicitudCausal } from "../lib/solicitud-decision";
import "./manager-decision.css";

export function ManagerDecision({ solicitud, onBusy, onDone }: {
  solicitud: SolicitudNovedadResponse; onBusy: (busy: boolean) => void;
  onDone: (updated: SolicitudNovedadResponse) => void;
}) {
  const [decision, setDecision] = useState<Decision | null>(null);
  const [causalId, setCausalId] = useState("");
  const [custom, setCustom] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const pending = useRef<AbortController | null>(null);
  useEffect(() => () => pending.current?.abort(), []);
  const params = new URLSearchParams({ tipo: "RECHAZO", audience: "JEFE" });
  if (solicitud.tipo) params.set("tipoSolicitud", solicitud.tipo);
  const causales = useApi<SolicitudCausal[]>(decision === "RECHAZAR"
    ? `/solicitudes/causales/activas?${params}` : null);
  const options = (causales.state.data ?? []).filter(c => c.activo);
  const causal = causalId === "OTRA" ? custom.trim()
    : options.find(c => String(c.id) === causalId)?.descripcion ?? "";

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!decision || solicitud.id == null || pending.current) return;
    if (decision === "RECHAZAR" && !causal) {
      setError("Selecciona o escribe la causal del rechazo.");
      return;
    }
    const controller = new AbortController();
    pending.current = controller;
    setBusy(true);
    onBusy(true);
    setError("");
    try {
      const updated = await decideSolicitud(solicitud.id, decision, decision === "RECHAZAR" ? causal : null,
        notes, controller.signal);
      if (!controller.signal.aborted) onDone(updated);
    } catch (err) {
      if (!controller.signal.aborted) setError(toApiError(err).message);
    } finally {
      if (!controller.signal.aborted) setBusy(false);
      pending.current = null;
      onBusy(false);
    }
  }

  return (
    <form className="pn-manager-decision" onSubmit={submit} aria-label="Decisión del jefe" aria-busy={busy}>
      {!decision ? (
        <div className="pn-manager-buttons">
          <button type="button" className="pn-button" onClick={() => setDecision("APROBAR")}>Aprobar solicitud</button>
          <button type="button" className="pn-button secondary" onClick={() => setDecision("RECHAZAR")}>Rechazar solicitud</button>
        </div>
      ) : (
        <>
          <p>Vas a {decision === "APROBAR" ? "aprobar" : "rechazar"} {solicitud.radicado} de {solicitud.colaboradorNombre}.</p>
          {decision === "APROBAR" && <small>La aprobación del jefe continúa a Gestión Humana.</small>}
          {decision === "RECHAZAR" && (
            <>
              <label htmlFor="manager-causal">Causal de rechazo *</label>
              <select id="manager-causal" value={causalId} disabled={busy} required onChange={e => setCausalId(e.target.value)}>
                <option value="">Selecciona una causal</option>
                {options.map(c => <option key={c.id} value={c.id}>{c.descripcion}</option>)}
                <option value="OTRA">Otra causal</option>
              </select>
              {causalId === "OTRA" && <>
                <label htmlFor="manager-custom">Describe la causal *</label>
                <textarea id="manager-custom" rows={2} maxLength={500} required disabled={busy}
                  value={custom} onChange={e => setCustom(e.target.value)} />
              </>}
              {causales.state.status === "loading" && <small>Cargando causales…</small>}
              {causales.state.status === "error" && <p role="alert">No se pudieron cargar las causales. Puedes escribir otra causal.
                <button type="button" className="pn-button secondary" disabled={busy} onClick={causales.reload}>Reintentar causales</button>
              </p>}
            </>
          )}
          <label htmlFor="manager-notes">Observaciones (opcional)</label>
          <textarea id="manager-notes" rows={2} maxLength={4000} value={notes} disabled={busy} onChange={e => setNotes(e.target.value)} />
          {error && <p className="pn-info" role="alert">{error}</p>}
          <div className="pn-manager-buttons">
            <button className="pn-button" type="submit" disabled={busy || (decision === "RECHAZAR" && !causal)}>
              {busy ? "Guardando…" : decision === "APROBAR" ? "Confirmar aprobación" : "Confirmar rechazo"}
            </button>
            <button className="pn-button secondary" type="button" disabled={busy} onClick={() => { setDecision(null); setError(""); }}>Cancelar decisión</button>
          </div>
        </>
      )}
    </form>
  );
}
