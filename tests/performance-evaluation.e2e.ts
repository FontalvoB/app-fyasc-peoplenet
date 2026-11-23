import { test } from '@e2e-dev/web';
import { expect } from 'e2e';

test('evaluación de desempeño: respeta el flag en inicio y enlaces directos', async ({ app, browser, screen }) => {
  const enabled = process.env.VITE_PERFORMANCE_EVALUATION === 'true';
  const user = { userId: 42, username: 'fixture', employeeId: 20, roles: [{ id: 1, name: 'USER' }] };
  let periodRequests = 0;

  await browser.addInitScript(session => {
    localStorage.setItem('peoplenet-auth', JSON.stringify(session));
  }, { token: 'local-test-token', user });
  await browser.route('**/api/**', async route => {
    const path = new URL(route.request.url).pathname;
    if (path === '/api/auth/me') return route.fulfill({ json: user });
    if (path === '/api/evaluations/periods') {
      periodRequests++;
      return route.fulfill({ json: [] });
    }
    return route.fulfill({ status: 403, json: { message: 'Ruta fuera de la prueba' } });
  });

  await app.open('/dashboard');
  await expect(screen.getByRole('link', 'Ver mis metas')).toBeVisible();
  const evaluationLinks = await browser.evaluate(() =>
    document.querySelectorAll('a[href="/dashboard/evaluations"]').length,
  );
  await expect(evaluationLinks).toBe(enabled ? 2 : 0);

  for (const path of ['/dashboard/evaluations', '/dashboard/evaluations/chat']) {
    await app.open(path);
    await expect(browser).toHaveURL(enabled ? path : '/dashboard');
    if (!enabled) await expect(screen.getByRole('link', 'Ver mis metas')).toBeVisible();
  }
  await expect(periodRequests > 0).toBe(enabled);
});
