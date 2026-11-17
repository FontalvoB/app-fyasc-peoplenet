import { test } from '@e2e-dev/web';
import { expect } from 'e2e';

test('la PWA recarga el codigo tras una actualizacion sin borrar los datos locales', async ({ app, browser, screen }) => {
  await browser.addInitScript(() => {
    sessionStorage.setItem('pwa-loads', String(Number(sessionStorage.getItem('pwa-loads') ?? 0) + 1));
  });
  await app.open('/login');
  await expect(screen.getByRole('heading', 'Bienvenido de nuevo')).toBeVisible();
  await browser.evaluate(async () => {
    await navigator.serviceWorker.ready;
    if (!navigator.serviceWorker.controller) await new Promise<void>(resolve =>
      navigator.serviceWorker.addEventListener('controllerchange', () => resolve(), { once: true }));
  });
  // Reopen as an installed PWA: the page starts with an existing controller.
  await app.open('/login');
  await expect(screen.getByRole('heading', 'Bienvenido de nuevo')).toBeVisible();
  const loads = await browser.evaluate(() => Number(sessionStorage.getItem('pwa-loads')));
  await browser.evaluate(() => localStorage.setItem('pwa-test-marker', 'preserved'));
  const advance = await fetch(new URL('/__test/advance', app.baseUrl), { method: 'POST' });
  await expect(advance.ok).toBe(true);
  await expect((await advance.json()).release > 1).toBe(true);
  await browser.evaluate(async () => { await (await navigator.serviceWorker.getRegistration())?.update(); });
  await expect.poll(async () => {
    const state = await browser.evaluate(() => ({ loads: Number(sessionStorage.getItem('pwa-loads')) }));
    return state.loads > loads;
  }, { timeout: 15000 }).toBe(true);
  await expect(screen.getByRole('heading', 'Bienvenido de nuevo')).toBeVisible();
  await expect(await browser.evaluate(() => localStorage.getItem('pwa-test-marker'))).toBe('preserved');
});
