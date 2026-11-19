import { useEffect, useId, useRef, type ReactNode } from "react";
import { motion, useAnimationControls, useReducedMotion } from "framer-motion";
import "./details.css";

export function DetailSheet({
  title,
  status,
  children,
  close,
  footer,
  dismissible = true,
}: {
  title: string;
  status?: ReactNode;
  children: ReactNode;
  close: () => void;
  footer?: ReactNode;
  dismissible?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const controls = useAnimationControls();
  const reduced = useReducedMotion();
  const closing = useRef(false);
  useEffect(() => {
    const dialog = ref.current;
    const previous = document.activeElement as HTMLElement | null;
    // El scroll del fondo se contiene con `overscroll-behavior` en CSS (ver
    // pwa-native.css): no se muta `body.overflow` para no perder el scrollbar
    // ni romper elementos sticky del shell.
    dialog?.showModal();
    const viewport = window.visualViewport;
    const resize = () => {
      dialog?.style.setProperty(
        "--detail-height",
        `${viewport?.height ?? innerHeight}px`,
      );
      dialog?.style.setProperty(
        "--detail-top",
        `${viewport?.offsetTop ?? 0}px`,
      );
    };
    resize();
    viewport?.addEventListener("resize", resize);
    viewport?.addEventListener("scroll", resize);
    void controls.start({ opacity: 1, y: 0, scale: 1 });
    return () => {
      viewport?.removeEventListener("resize", resize);
      viewport?.removeEventListener("scroll", resize);
      dialog?.close();
      previous?.focus({ preventScroll: true });
    };
  }, [controls]);
  const dismiss = async () => {
    if (closing.current || !dismissible) return;
    closing.current = true;
    await controls.start({ opacity: 0, y: reduced ? 0 : 16, scale: 1 });
    close();
  };
  return (
    <motion.dialog
      ref={ref}
      className="pn-modal pn-detail-sheet"
      aria-labelledby={titleId}
      initial={{ opacity: 0, y: reduced ? 0 : 24, scale: reduced ? 1 : 0.98 }}
      animate={controls}
      transition={
        reduced
          ? { duration: 0 }
          : { type: "spring", stiffness: 360, damping: 34 }
      }
      onCancel={(e) => {
        e.preventDefault();
        void dismiss();
      }}
      onKeyDown={(e) => {
        if (e.key !== "Tab") return;
        const focusable = Array.from(
          e.currentTarget.querySelectorAll<HTMLElement>(
            'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), iframe, [tabindex="0"]',
          ),
        ).filter((el) => el.getClientRects().length > 0);
        const first = focusable[0],
          last = focusable[focusable.length - 1];
        if (!first) {
          e.preventDefault();
          return;
        }
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) void dismiss();
      }}
    >
      <header className="pn-detail-header">
        <div>
          <h2 id={titleId}>{title}</h2>
          {status && <div className="pn-detail-status">{status}</div>}
        </div>
        <button
          type="button"
          autoFocus
          className="pn-icon-button"
          aria-label="Cerrar ventana"
          disabled={!dismissible}
          onClick={() => void dismiss()}
        >
          <span className="material-symbols-outlined" aria-hidden="true">
            close
          </span>
        </button>
      </header>
      <div className="pn-detail-body">{children}</div>
      <footer className="pn-detail-footer">
        {footer ?? (
          <button
            type="button"
            className="pn-button secondary"
            disabled={!dismissible}
            onClick={() => void dismiss()}
          >
            Volver
          </button>
        )}
      </footer>
    </motion.dialog>
  );
}

export function DetailMeta({
  icon,
  label,
  children,
}: {
  icon: string;
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="pn-detail-meta">
      <dt>
        <span className="material-symbols-outlined" aria-hidden="true">
          {icon}
        </span>
        {label}
      </dt>
      <dd>{children}</dd>
    </div>
  );
}

/** Keep the composer inside the visible viewport when the software keyboard opens. */
export function useChatViewport() {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    const viewport = window.visualViewport;
    const resize = () => {
      const keyboard = innerHeight - (viewport?.height ?? innerHeight) > 120;
      ref.current?.style.setProperty(
        "--chat-height",
        `${Math.max(240, (viewport?.height ?? innerHeight) - (keyboard ? 84 : 164))}px`,
      );
    };
    resize();
    viewport?.addEventListener("resize", resize);
    window.addEventListener("resize", resize);
    return () => {
      viewport?.removeEventListener("resize", resize);
      window.removeEventListener("resize", resize);
    };
  }, []);
  return ref;
}
