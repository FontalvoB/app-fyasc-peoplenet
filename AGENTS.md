# AGENTS.md — app-fyasc-peoplenet (PeopleNet móvil)

Ionic React + Capacitor sobre Vite (React 18, TypeScript, Tailwind 4). Dev server en 5173 con proxy `/api` → kpis-ms `:8080` (vite.config.ts). Compila a Android/iOS con Capacitor (`android/`, `ios/`).

## Commands

```bash
npm install
npm run dev         # vite → http://localhost:5173
npm run build       # tsc && vite build
```

## Tests e2e (framework `e2e` de TesterArmy)

```bash
npx e2e run           # suite (targets desktop + phone 390x844)
npx e2e run --headed  # ver el navegador
npx e2e list          # listar sin correr
```

- Config `e2e.config.ts`: target `desktop` y `phone` sobre `http://localhost:5173`; arranca Vite si no hay server (`reuseExisting`), log en `.e2e/logs/app.log`.
- Tests deterministas en `tests/*.e2e.ts` (locators + `expect`). Sin `agents` → no se necesita modelo ni API key.
- Para probar la app nativa de Capacitor: sin Android SDK local hoy. Opciones: servir la build (`vite preview`) y apuntar `APP_URL`, o instalar el SDK y migrar el target a `@e2e-dev/mobile`.
- Skill del framework: `.agents/skills/e2e/SKILL.md` — leerla antes de escribir o correr un test e2e. Docs offline: `node_modules/e2e/docs/`.
