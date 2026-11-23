import { useEffect, useRef, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import {
  Link,
  Redirect,
  Route,
  Switch,
  useHistory,
  useLocation,
  useRouteMatch,
} from "react-router-dom";
import { performanceEvaluationEnabled } from "../lib/feature-flags";
import { Icon, useSaved, Avatar, Brand, Search } from "./shared";
import { nav } from "./data";
import {
  clearAllUserStorage,
  displayName,
  initialsOf,
  isAuthenticated,
  readSession,
  validateSession,
  useApi,
  type SpringPage,
} from "../lib/api";
import { Home } from "./Home";
import { Login } from "./Login";
import { Kpis } from "./Kpis";
import { Requests, RequestForm } from "./Requests";
import { Documents, Reader } from "./Documents";
import { Team } from "./Team";
import { Evaluations, Chat } from "./Evaluations";
import { Certificates, Notifications, Profile } from "./Account";

export default function Workspace() {
  const location = useLocation();
  const evaluationRoute = useRouteMatch("/dashboard/evaluations");
  const history = useHistory();
  const [menu, setMenu] = useState(false);
  const menuRef = useRef<HTMLElement>(null);
  const previousRoute = useRef(location.pathname);
  const [keyboardOpen, setKeyboardOpen] = useState(false);
  const [starting, setStarting] = useState(true);
  const jefatura = useApi<{ esJefe: boolean }>(
    isAuthenticated() ? "/solicitudes/check-jefatura" : null,
  );
  const pendientesJefe = useApi<SpringPage<unknown>>(
    jefatura.state.data?.esJefe === true
      ? "/solicitudes/bandeja-jefe?estado=PENDIENTE_JEFE&page=0&size=1"
      : null,
  );
  const hayPendientesJefe = (pendientesJefe.state.data?.totalElements ?? 0) > 0;
  const startupValidation = useRef<Promise<unknown> | null>(null);
  const reduceMotion = useReducedMotion();
  const [search, setSearch] = useState("");
  const [toast, setToast] = useState("");
  const [reads, setReads] = useSaved<string[]>("reads", []);
  const [seen, setSeen] = useSaved<string[]>("seen", []);
  const [profile, setProfile] = useSaved("profile", {
    name: "Álvaro Méndez",
    email: "alvaro.mendez@peoplenet.com",
    phone: "+57 300 123 4567",
  });
  useEffect(() => {
    if (!menu) return;
    const previous = document.activeElement as HTMLElement | null;
    const panel = menuRef.current;
    const focusable = () =>
      Array.from(
        panel?.querySelectorAll<HTMLElement>(
          "a[href], button:not([disabled])",
        ) || [],
      ).filter((el) => el.getClientRects().length > 0);
    const background = document.querySelectorAll(
      ".pn-main, .vivid-bottom-nav, .pn-floating-eva",
    );
    background.forEach((el) => el.setAttribute("inert", ""));
    focusable()[0]?.focus();
    const trapFocus = (event: KeyboardEvent) => {
      if (event.key !== "Tab") return;
      const items = focusable();
      const first = items[0],
        last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    };
    panel?.addEventListener("keydown", trapFocus);
    return () => {
      panel?.removeEventListener("keydown", trapFocus);
      background.forEach((el) => el.removeAttribute("inert"));
      previous?.focus();
    };
  }, [menu]);
  useEffect(() => {
    const onEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenu(false);
    };
    window.addEventListener("keydown", onEscape);
    return () => window.removeEventListener("keydown", onEscape);
  }, []);
  useEffect(() => {
    setMenu(false);
    setSearch("");
    document.querySelector(".pn-main")?.scrollTo(0, 0);
    if (previousRoute.current !== location.pathname) {
      requestAnimationFrame(() =>
        document
          .querySelector<HTMLElement>("#pn-main-content")
          ?.focus({ preventScroll: true }),
      );
      previousRoute.current = location.pathname;
    }
  }, [location.pathname]);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(""), 4200);
    return () => clearTimeout(timer);
  }, [toast]);
  useEffect(() => {
    const viewport = window.visualViewport;
    const updateKeyboard = () => {
      const editing = document.activeElement?.matches(
        'input, textarea, select, [contenteditable="true"]',
      );
      setKeyboardOpen(
        Boolean(
          editing && viewport && window.innerHeight - viewport.height > 120,
        ),
      );
    };
    viewport?.addEventListener("resize", updateKeyboard);
    document.addEventListener("focusin", updateKeyboard);
    document.addEventListener("focusout", updateKeyboard);
    return () => {
      viewport?.removeEventListener("resize", updateKeyboard);
      document.removeEventListener("focusin", updateKeyboard);
      document.removeEventListener("focusout", updateKeyboard);
    };
  }, []);
  // Ola 0: con sesión almacenada, revalidar identidad contra /auth/me una vez
  // al montar. Un 401 limpia la sesión y redirige a /login desde el cliente
  // API; un fallo transitorio (5xx/red) no invalida la sesión local.
  useEffect(() => {
    let mounted = true;
    // Reuse the existing validation, including React StrictMode's effect replay.
    startupValidation.current ??= isAuthenticated()
      ? validateSession()
      : Promise.resolve();
    // A short first paint avoids blinking; slow validation stays covered.
    let timer: ReturnType<typeof setTimeout>;
    const firstPaint = new Promise<void>((resolve) => {
      timer = setTimeout(resolve, 350);
    });
    void Promise.all([startupValidation.current, firstPaint]).then(() => {
      if (mounted) setStarting(false);
    });
    return () => {
      mounted = false;
      clearTimeout(timer);
    };
  }, []);
  useEffect(() => {
    if (starting) return;
    const splash = document.getElementById("app-splash");
    // Paint the resolved route beneath the splash before cross-fading it out.
    let secondFrame = 0;
    let timer: ReturnType<typeof setTimeout>;
    const frame = requestAnimationFrame(() => {
      secondFrame = requestAnimationFrame(() => {
        splash?.classList.add("is-leaving");
        timer = setTimeout(() => {
          splash?.remove();
          document.documentElement.classList.remove("app-starting");
        }, reduceMotion ? 0 : 250);
      });
    });
    return () => {
      cancelAnimationFrame(frame);
      cancelAnimationFrame(secondFrame);
      clearTimeout(timer);
    };
  }, [starting, reduceMotion]);
  // Logout: limpiar sesión y datos demo (pn-v2-*) y navegar con recarga
  // completa para remontar la app sin heredar estado del usuario anterior.
  const handleLogout = () => {
    clearAllUserStorage();
    window.location.assign("/login");
  };
  const section = location.pathname.split("/")[2] || "";
  const activeSection =
    section === "org-chart"
      ? "team"
      : section === "profile"
        ? "account"
        : section;
  const title =
    nav.find(([path]) => path === activeSection)?.[2] ||
    ({
      account: "Mi perfil",
      notifications: "Notificaciones",
      assistant: "Asistente Eva",
    }[activeSection] ??
      "Resumen");
  const userName = displayName(readSession()?.user ?? null) || "Usuario";
  const userInitials = initialsOf(userName) || "PN";
  if (starting) return null;
  if (location.pathname === "/") return <Redirect to="/login" />;
  if (location.pathname === "/login") return <Login />;
  // Guard de sesión (Ola 0): sin sesión autenticada no se pinta NADA privado;
  // el Redirect evita renderizar el dashboard antes de mover a /login.
  if (!isAuthenticated()) return <Redirect to="/login" />;
  if (!performanceEvaluationEnabled && evaluationRoute)
    return <Redirect to="/dashboard" />;
  if (!location.pathname.startsWith("/dashboard"))
    return <Redirect to="/dashboard" />;
  return (
    <div className={`pn-app ${keyboardOpen ? "keyboard-open" : ""}`}>
      <a className="pn-skip-link" href="#pn-main-content">
        Ir al contenido
      </a>
      {menu && (
        <button
          className="pn-overlay"
          aria-label="Cerrar menú"
          onClick={() => setMenu(false)}
        />
      )}
      <aside
        id="pn-navigation"
        ref={menuRef}
        className={`pn-sidebar ${menu ? "is-open" : ""}`}
        role={menu ? "dialog" : undefined}
        aria-modal={menu ? true : undefined}
        aria-label={menu ? "Todos los módulos" : undefined}
      >
        <button
          className="vivid-close-menu"
          aria-label="Cerrar navegación"
          onClick={() => setMenu(false)}
        >
          <Icon name="close" />
        </button>
        <Brand />
        <button
          className="pn-workspace"
          onClick={() => history.push("/dashboard/account")}
        >
          <span className="workspace-icon">P</span>
          <span>
            <strong>PeopleNet Colombia</strong>
            <small>Mi espacio de trabajo</small>
          </span>
          <Icon name="unfold_more" size={18} />
        </button>
        <div className="pn-nav-label">MI ESPACIO</div>
        <nav aria-label="Navegación principal">
          {nav.map(([path, icon, label]) => (
            <Link
              aria-current={activeSection === path ? "page" : undefined}
              className={activeSection === path ? "active" : ""}
              key={path}
              to={"/dashboard" + (path ? "/" + path : "")}
            >
              <Icon name={icon} />
              <span>{label}</span>
            </Link>
          ))}
          {jefatura.state.data?.esJefe === true && (
            <Link to="/dashboard/requests?bandeja=jefe" onClick={() => setMenu(false)}
              className={location.search === "?bandeja=jefe" ? "active" : ""}
              aria-current={location.search === "?bandeja=jefe" ? "page" : undefined}
              data-pending={hayPendientesJefe || undefined}
              aria-description={hayPendientesJefe ? "Hay solicitudes pendientes de tu decisión" : undefined}>
              <Icon name="fact_check" />
              <span>Bandeja del jefe</span>
              {hayPendientesJefe && <span className="pn-pending-dot" aria-hidden="true" />}
            </Link>
          )}
        </nav>
        <div className="pn-sidebar-bottom">
          <Link className="pn-assistant-card" to="/dashboard/assistant">
            <span className="spark">
              <Icon name="auto_awesome" />
            </span>
            <strong>
              Un poco de ayuda,
              <br />
              muchas posibilidades.
            </strong>
            <p>Tu asistente está a un clic.</p>
            <span>
              {performanceEvaluationEnabled ? "Conoce a Eva" : "Abrir asistente"}{" "}
              <Icon name="arrow_outward" size={17} />
            </span>
          </Link>
          <Link className="pn-settings" to="/dashboard/account">
            <Icon name="settings" /> Mi perfil y preferencias
          </Link>
          <button
            className="pn-user"
            onClick={() => history.push("/dashboard/account")}
          >
            <Avatar name={userInitials} />
            <span>
              <strong>{userName}</strong>
              <small>
                {readSession()?.user?.email ||
                  "Sesión gestionada por el servidor"}
              </small>
            </span>
            <Icon name="chevron_right" size={17} />
          </button>
          <button className="pn-logout" onClick={handleLogout}>
            <Icon name="logout" size={16} /> Cerrar sesión
          </button>
        </div>
      </aside>
      <div className="pn-main">
        <header className="pn-topbar">
          <button
            className="pn-icon-button mobile-menu"
            aria-label="Abrir menú"
            aria-expanded={menu}
            aria-controls="pn-navigation"
            onClick={() => setMenu(!menu)}
          >
            <Icon name="menu" />
          </button>
          <div className="pn-breadcrumb">
            Mi espacio <Icon name="chevron_right" size={15} />
            <strong>
              {location.pathname.includes("assistant")
                ? "Asistente Eva"
                : title}
            </strong>
          </div>
          <div className="vivid-mobile-brand">
            <Brand />
          </div>
          <Link
            className="vivid-header-eva"
            to="/dashboard/assistant"
            aria-label={performanceEvaluationEnabled ? "Abrir asistente Eva" : "Abrir asistente"}
          >
            <Icon name="auto_awesome" size={17} />
            <span>{performanceEvaluationEnabled ? "Eva" : "Asistente"}</span>
          </Link>
          <div className="pn-global-search">
            <Search
              value={search}
              onChange={setSearch}
              placeholder="Buscar en tu espacio…"
            />
            {search && (
              <div className="pn-search-results">
                {nav
                  .filter((x) =>
                    x[2].toLowerCase().includes(search.toLowerCase()),
                  )
                  .map((x) => (
                    <Link key={x[0]} to={"/dashboard/" + x[0]}>
                      <Icon name={x[1]} />
                      {x[2]}
                    </Link>
                  ))}
                {!nav.some((x) =>
                  x[2].toLowerCase().includes(search.toLowerCase()),
                ) && <p>No hay módulos con ese nombre.</p>}
              </div>
            )}
          </div>
          <span className="pn-demo">Espacio de trabajo</span>
          <Link
            className="pn-icon-button notification-button"
            aria-label="Ver notificaciones"
            to="/dashboard/notifications"
          >
            <Icon name="notifications" />
            {seen.length < 3 && <i />}
          </Link>
          <Link
            className="pn-header-profile"
            aria-label="Mi perfil"
            to="/dashboard/account"
          >
            <Avatar name={userInitials} />
          </Link>
        </header>
        <motion.main
          id="pn-main-content"
          tabIndex={-1}
          aria-label={title}
          className={`pn-content route-${location.pathname.split("/")[2] || "home"}`}
          key={location.pathname}
          initial={reduceMotion ? false : { opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{
            duration: reduceMotion ? 0 : 0.22,
            ease: [0.2, 0.8, 0.2, 1],
          }}
        >
          <Switch>
            <Route exact path="/dashboard">
              <Home />
            </Route>
            <Route path="/dashboard/kpis">
              <Kpis notify={setToast} />
            </Route>
            <Route exact path="/dashboard/requests">
              <Requests jefatura={jefatura} hasPending={hayPendientesJefe}
                refreshPending={pendientesJefe.reload} />
            </Route>
            <Route path="/dashboard/requests/new">
              <RequestForm />
            </Route>
            <Route exact path="/dashboard/documents">
              <Documents reads={reads} />
            </Route>
            <Route path="/dashboard/documents/:id">
              <Reader
                reads={reads}
                onRead={(id) => {
                  setReads([...new Set([...reads, id])]);
                  setToast("Lectura confirmada. ¡Gracias por estar al día!");
                }}
              />
            </Route>
            <Route path={["/dashboard/team", "/dashboard/org-chart"]}>
              <Team />
            </Route>
            <Route exact path="/dashboard/evaluations">
              <Evaluations />
            </Route>
            <Route path="/dashboard/evaluations/chat">
              <Chat evaluation />
            </Route>
            <Route path="/dashboard/assistant">
              <Chat />
            </Route>
            <Route path="/dashboard/certificates">
              <Certificates name={profile.name} />
            </Route>
            <Route path="/dashboard/notifications">
              <Notifications seen={seen} setSeen={setSeen} />
            </Route>
            <Route path={["/dashboard/account", "/dashboard/profile"]}>
              <Profile
                profile={profile}
                save={(p) => {
                  setProfile(p);
                  setToast("Tus preferencias se guardaron.");
                }}
              />
            </Route>
            <Route>
              <div className="pn-empty">
                <h1>Esta página no existe</h1>
                <Link className="pn-button" to="/dashboard">
                  Volver al inicio
                </Link>
              </div>
            </Route>
          </Switch>
          <footer className="pn-footer">
            <span>Hecho para las personas. Impulsado por PeopleNet.</span>
            <span>
              © 2026 PeopleNet <i /> Colombia
            </span>
          </footer>
        </motion.main>
      </div>
      {toast && (
        <div
          className="pn-toast"
          role="status"
          aria-live="polite"
          aria-atomic="true"
        >
          <Icon name="check_circle" />
          {toast}
          <button aria-label="Cerrar aviso" onClick={() => setToast("")}>
            <Icon name="close" size={18} />
          </button>
        </div>
      )}
      <Link
        to="/dashboard/assistant"
        aria-label={performanceEvaluationEnabled ? "Abrir asistente Eva" : "Abrir asistente"}
        className="pn-floating-eva"
      >
        <Icon name="auto_awesome" />
        <span>Eva</span>
      </Link>
      <nav className="vivid-bottom-nav" aria-label="Navegación móvil">
        {[
          ["", "space_dashboard", "Inicio"],
          ["kpis", "monitoring", "Metas"],
          ["requests", "event_available", "Permisos"],
          ["documents", "auto_stories", "Biblioteca"],
        ].map(([path, icon, label]) => {
          const active = path
            ? location.pathname.startsWith("/dashboard/" + path)
            : location.pathname === "/dashboard";
          return (
            <Link
              key={path}
              to={"/dashboard" + (path ? "/" + path : "")}
              aria-current={active ? "page" : undefined}
              className={active ? "active" : ""}
            >
              {active && (
                <motion.span
                  className="bottom-active-pill"
                  layoutId="mobile-tab"
                  transition={
                    reduceMotion
                      ? { duration: 0 }
                      : { duration: 0.22, ease: "easeOut" }
                  }
                />
              )}
              <Icon name={icon} size={23} />
              <span>{label}</span>
            </Link>
          );
        })}
        <button
          onClick={() => setMenu(true)}
          aria-label="Más opciones"
          aria-expanded={menu}
          aria-controls="pn-navigation"
          className={
            menu ||
            (location.pathname !== "/dashboard" &&
              !["kpis", "requests", "documents"].some((path) =>
                location.pathname.startsWith("/dashboard/" + path),
              ))
              ? "active"
              : ""
          }
        >
          <Icon name="grid_view" size={23} />
          <span>Más</span>
        </button>
      </nav>
    </div>
  );
}
