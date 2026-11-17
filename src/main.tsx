import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { registerSW } from "virtual:pwa-register";

import "./theme/variables.css";
import "./styles/fonts.css";

if (import.meta.env.MODE === "pwa") {
  registerSW({
    immediate: true,
    onRegisteredSW(_url, registration) {
      // Installed PWAs can stay suspended for days; check again on foreground.
      const checkForUpdate = () => {
        if (document.visibilityState === "visible" && navigator.onLine) {
          void registration?.update().catch(() => undefined);
        }
      };
      document.addEventListener("visibilitychange", checkForUpdate);
      window.addEventListener("online", checkForUpdate);
    },
  });
}

const container = document.getElementById("root");
if (container) {
  const root = createRoot(container);
  root.render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  );
}
