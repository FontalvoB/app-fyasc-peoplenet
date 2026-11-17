import { test } from '@e2e-dev/web';
import { expect } from 'e2e';

test('pendientes del jefe: conteo independiente de la página y actualización al entrar', async ({ app, browser, screen }) => {
  const user = { userId: 36, username: 'innovations', employeeId: 16, roles: [{ id: 2, name: 'SUPERVISOR' }] };
  let pending = 2;
  let counts = 0;
  await browser.addInitScript(session => {
    localStorage.setItem('peoplenet-auth', JSON.stringify(session));
  }, { token: 'local-test-token', user });
  await browser.route('**/api/**', async route => {
    const url = new URL(route.request.url);
    if (url.pathname === '/api/auth/me') return route.fulfill({ json: user });
    if (url.pathname === '/api/solicitudes/check-jefatura') return route.fulfill({ json: { esJefe: true } });
    if (url.pathname === '/api/solicitudes/bandeja-jefe' && url.searchParams.get('size') === '1') {
      counts++;
      await expect(url.searchParams.get('estado')).toBe('PENDIENTE_JEFE');
      await expect(route.request.headers['authorization']).toBe('Bearer local-test-token');
      await expect(url.searchParams.has('aprobadorId')).toBe(false);
      return route.fulfill({ json: { content: [], totalElements: pending } });
    }
    if (url.pathname === '/api/solicitudes/bandeja-jefe' || url.pathname === '/api/solicitudes/mias') {
      // The visible page contains no pending rows. The indicator must use the server count.
      return route.fulfill({ json: { content: [], totalElements: 0, totalPages: 0, number: 0 } });
    }
    return route.fulfill({ status: 501, json: { message: 'Ruta no simulada' } });
  });
  await app.open('/dashboard/requests');
  const tab = screen.getByRole('button', 'Bandeja del jefe', { exact: true });
  await expect(tab).toHaveAttribute('data-pending', 'true');
  await expect(tab).toHaveAttribute('aria-description', 'Hay solicitudes pendientes de tu decisión');
  const phone = await browser.evaluate(() => window.innerWidth < 1024);
  if (phone) await screen.getByRole('button', 'Más opciones', { exact: true }).tap();
  const link = screen.getByRole('link', 'Bandeja del jefe', { exact: true });
  await expect(link).toHaveAttribute('data-pending', 'true');
  // Leave Permisos using the sidebar, then simulate another client processing all pending requests.
  await screen.getByRole('link', 'Resumen', { exact: true }).tap();
  pending = 0;
  const previousCounts = counts;
  if (phone) await screen.getByRole('button', 'Más opciones', { exact: true }).tap();
  await screen.getByRole('link', 'Bandeja del jefe', { exact: true }).tap();
  await expect(tab).not.toHaveAttribute('data-pending', 'true');
  await expect.poll(() => counts > previousCounts).toBe(true);
});
