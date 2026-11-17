import { test } from '@e2e-dev/web';
import { expect } from 'e2e';

for (const scenario of ['manager', 'employee', 'denied', 'retry'] as const) {
  test(`bandeja del jefe: ${scenario}`, async ({ app, browser, screen }) => {
    const user = { userId: 36, username: 'innovations', employeeId: 16, roles: [] };
    let checkFailed = scenario === 'retry';
    let managerRequests = 0;
    const assigned = { id: 1, radicado: 'SOL-2026-0001', tipo: 'VACACIONES', estado: 'PENDIENTE_JEFE',
      colaboradorId: 10, colaboradorNombre: 'developer1', aprobadorId: 16, aprobadorNombre: 'innovations',
      descripcion: 'Solicitud para revisar', documentos: [], historial: [] };
    const own = { ...assigned, id: 2, radicado: 'SOL-PROPIA', colaboradorNombre: 'innovations' };
    const page = (content: object[]) => ({ content, totalElements: content.length, totalPages: 1, number: 0 });
    await browser.addInitScript(session => {
      localStorage.setItem('peoplenet-auth', JSON.stringify(session));
    }, { token: 'local-test-token', user });
    await browser.route('**/api/**', async route => {
      const url = new URL(route.request.url);
      if (url.pathname === '/api/auth/me') return route.fulfill({ json: user });
      if (url.pathname === '/api/solicitudes/check-jefatura') {
        if (checkFailed) return route.fulfill({ status: 503, json: { message: 'Intenta de nuevo' } });
        return route.fulfill({ json: { esJefe: scenario !== 'employee' } });
      }
      if (url.pathname === '/api/solicitudes/mias') return route.fulfill({ json: page([own]) });
      if (url.pathname === '/api/solicitudes/bandeja-jefe') {
        managerRequests++;
        await expect(route.request.headers['authorization']).toBe('Bearer local-test-token');
        await expect(url.searchParams.has('aprobadorId')).toBe(false);
        await expect(url.searchParams.has('employeeId')).toBe(false);
        if (scenario === 'denied') return route.fulfill({ status: 403, json: { message: 'Sin acceso a esta bandeja' } });
        return route.fulfill({ json: page([assigned]) });
      }
      if (url.pathname === '/api/solicitudes/1') return route.fulfill({ json: assigned });
      return route.fulfill({ status: 501, json: { message: 'Ruta no simulada' } });
    });
    await app.open('/dashboard/requests');
    await expect(screen.getByRole('heading', 'Permisos y solicitudes')).toBeVisible();
    if (scenario === 'employee') {
      await expect(screen.getByRole('button', 'Bandeja del jefe', { exact: true })).toHaveCount(0);
      await expect(managerRequests).toBe(0);
      return;
    }
    if (scenario === 'retry') {
      await expect(screen.getByText('No pudimos verificar tu acceso a la bandeja del jefe.')).toBeVisible();
      checkFailed = false;
      await screen.getByRole('button', 'Reintentar').tap();
    }
    await screen.getByRole('button', 'Bandeja del jefe', { exact: true }).tap();
    await expect(screen.getByRole('heading', 'Bandeja del jefe')).toBeVisible();
    await expect(screen.getByText('SOL-PROPIA')).toHaveCount(0);
    if (scenario === 'denied') {
      await expect(screen.getByText('Sin acceso a esta bandeja')).toBeVisible();
      await expect(screen.getByText('SOL-2026-0001')).toHaveCount(0);
      return;
    }
    await screen.getByRole('button', 'Ver solicitud SOL-2026-0001', { exact: true }).tap();
    await expect(screen.getByRole('dialog').getByText('SOL-2026-0001', { exact: true })).toBeVisible();
    await expect(screen.getByRole('dialog').getByText('developer1', { exact: true })).toBeVisible();
    await screen.getByRole('button', 'Cerrar ventana').tap();
    await screen.getByRole('button', 'Mis solicitudes', { exact: true }).tap();
    await expect(screen.getByRole('heading', 'Permisos y solicitudes')).toBeVisible();
    await expect(screen.getByText('SOL-2026-0001')).toHaveCount(0);
    await expect(managerRequests > 0).toBe(true);
  });
}
