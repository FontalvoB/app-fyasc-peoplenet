import { useEffect, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import peopleNetMark from "./assets/peoplenet-mark.png";

export function Icon({ name, size = 20 }: { name: string; size?: number }) {
  return (
    <span
      aria-hidden="true"
      className="material-symbols-outlined pn-icon"
      style={{ fontSize: size }}
    >
      {name}
    </span>
  );
}

export function useSaved<T>(key: string, initial: T) {
  const [value, setValue] = useState<T>(() => {
    try {
      const stored = localStorage.getItem("pn-v2-" + key);
      return stored ? (JSON.parse(stored) as T) : initial;
    } catch {
      return initial;
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem("pn-v2-" + key, JSON.stringify(value));
    } catch {
      /* Demo remains usable without storage. */
    }
  }, [key, value]);
  return [value, setValue] as const;
}

export function Avatar({
  name = "AM",
  tone = 0,
}: {
  name?: string;
  tone?: number;
}) {
  return (
    <span className={`pn-avatar tone-${tone % 4}`} aria-hidden="true">
      {name}
    </span>
  );
}

export function Brand() {
  return (
    <Link className="pn-brand" to="/dashboard" aria-label="PeopleNet · Inicio">
      <img
        className="pn-brand-mark"
        src={peopleNetMark}
        alt=""
        width={44}
        height={44}
      />
      <span>
        people<span className="brand-light">net</span>
        <small>GESTIÓN HUMANA</small>
      </span>
    </Link>
  );
}

export function Button({
  children,
  onClick,
  secondary = false,
  type = "button",
  disabled = false,
}: {
  children: ReactNode;
  onClick?: () => void;
  secondary?: boolean;
  type?: "button" | "submit";
  disabled?: boolean;
}) {
  return (
    <button
      type={type}
      disabled={disabled}
      className={`pn-button ${secondary ? "secondary" : ""}`}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

export function Badge({ children }: { children: string }) {
  return (
    <span
      className={`pn-badge ${["Aprobada", "Cumplido", "Leído", "Completada"].includes(children) ? "green" : ["Pendiente", "En riesgo", "Por leer"].includes(children) ? "amber" : children === "Rechazada" ? "red" : "blue"}`}
    >
      <i />
      {children}
    </span>
  );
}

export function PageHero({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow: string;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <header className="pn-heading pn-page-hero">
      <div>
        <div className="pn-eyebrow">{eyebrow}</div>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      {action}
    </header>
  );
}

export const Heading = PageHero;

export function SectionTitle({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="pn-section-heading">
      <div>
        <h2>{title}</h2>
        {description && <p>{description}</p>}
      </div>
      {action}
    </div>
  );
}

export function Empty() {
  return (
    <div className="pn-empty" role="status">
      <Icon name="search_off" size={36} />
      <h3>No encontramos resultados</h3>
      <p>Prueba con otra búsqueda o cambia los filtros.</p>
    </div>
  );
}

/** Estado de sección con error y retry; 403 → tarjeta "Sección restringida". */
export function SectionError({
  error,
  restricted,
  onRetry,
}: {
  error: string;
  restricted: boolean;
  onRetry: () => void;
}) {
  return (
    <div className="pn-empty pn-section-error" role="alert">
      <Icon name={restricted ? "lock" : "cloud_off"} size={32} />
      <h3>
        {restricted ? "Sección restringida" : "No pudimos cargar esta sección"}
      </h3>
      <p>{error}</p>
      <Button secondary onClick={onRetry}>
        Reintentar
      </Button>
    </div>
  );
}

/** Nota de carga/estado accesible. */
export function LoadingNote({ label }: { label: string }) {
  return (
    <div className="pn-loading" role="status" aria-live="polite">
      <span className="pn-loading-shape" aria-hidden="true" />
      <span>{label}</span>
    </div>
  );
}

export function Search({
  value,
  onChange,
  placeholder = "Buscar…",
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <label className="pn-search">
      <Icon name="search" />
      <input
        aria-label={placeholder}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
      {value && (
        <button aria-label="Limpiar búsqueda" onClick={() => onChange("")}>
          <Icon name="close" size={16} />
        </button>
      )}
    </label>
  );
}

export function Tabs({
  items,
  value,
  set,
  pendingItem,
}: {
  items: string[];
  value: string;
  set: (v: string) => void;
  pendingItem?: string;
}) {
  return (
    <div className="pn-tabs">
      {items.map((x) => (
        <button
          key={x}
          aria-pressed={value === x}
          className={value === x ? "active" : ""}
          onClick={() => set(x)}
          data-pending={pendingItem === x || undefined}
          aria-description={pendingItem === x ? "Hay solicitudes pendientes de tu decisión" : undefined}
        >
          {x}
          {pendingItem === x && <span className="pn-pending-dot" aria-hidden="true" />}
        </button>
      ))}
    </div>
  );
}

export function date(v: string) {
  return new Date(v + "T12:00:00").toLocaleDateString("es-CO", {
    day: "numeric",
    month: "short",
  });
}

export function download(name: string, content: string) {
  const url = URL.createObjectURL(
    new Blob(["\ufeff" + content], { type: "text/plain;charset=utf-8" }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export { DetailSheet as Modal } from "./DetailSheet";
