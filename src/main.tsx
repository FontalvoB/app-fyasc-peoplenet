import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { initPwa } from "./lib/pwa";

import "./theme/variables.css";
import "./styles/fonts.css";

// Captura beforeinstallprompt y registra el SW antes del primer render.
initPwa();

const container = document.getElementById("root");
if (container) {
  const root = createRoot(container);
  root.render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  );
}
