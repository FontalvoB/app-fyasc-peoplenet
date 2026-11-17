import { test } from '@e2e-dev/web';
import { expect } from 'e2e';

for (const scenario of ['approve', 'reject', 'other', 'forbidden', 'busy', 'processed', 'foreign', 'own'] as const) {
  test(`decisión del jefe: ${scenario}`, async ({ app, browser, screen }) => {
    const user = { userId: 36, username: 'innovations', employeeId: 16, roles: [{ id: 2, name: 'SUPERVISOR' }] };
    let state = scenario === 'processed' ? 'APROBADA_JEFE' : 'PENDIENTE_JEFE';
    let posts = 0;
    let lists = 0;
    let release: () => void = () => {};
    const held = new Promise<void>(resolve => { release = resolve; });
    const solicitud = () => ({ id: 91, radicado: 'SOL-TEST-91', tipo: 'VACACIONES', estado: state,
      colaboradorId: 10, colaboradorNombre: 'developer1', aprobadorId: scenario === 'foreign' ? 17 : 16,
      aprobadorNombre: 'innovations', descripcion: 'Solicitud de prueba', documentos: [], historial: [] });
    await browser.addInitScript(session => {
      localStorage.setItem('peoplenet-auth', JSON.stringify(session));
    }, { token: 'local-test-token', user });
    await browser.route('**/api/**', async route => {
      const url = new URL(route.request.url);
      if (url.pathname === '/api/auth/me') return route.fulfill({ json: user });
      if (url.pathname === '/api/solicitudes/check-jefatura') return route.fulfill({ json: { esJefe: true } });
      if (url.pathname === '/api/solicitudes/bandeja-jefe' || url.pathname === '/api/solicitudes/mias') {
        lists++;
        return route.fulfill({ json: { content: [solicitud()], totalElements: 1, totalPages: 1, number: 0 } });
      }
      if (url.pathname === '/api/solicitudes/91') return route.fulfill({ json: solicitud() });
      if (url.pathname === '/api/solicitudes/causales/activas') {
        await expect(url.searchParams.get('tipo')).toBe('RECHAZO');
        await expect(url.searchParams.get('audience')).toBe('JEFE');
        await expect(url.searchParams.get('tipoSolicitud')).toBe('VACACIONES');
        if (scenario === 'other') return route.fulfill({ status: 503, json: { message: 'Catálogo no disponible' } });
        return route.fulfill({ json: [{ id: 7, descripcion: 'Fuera del plazo', activo: true }] });
      }
      if (url.pathname === '/api/solicitudes/91/decision') {
        posts++;
        await expect(route.request.method).toBe('POST');
        await expect(route.request.headers['authorization']).toBe('Bearer local-test-token');
        const body = JSON.parse(route.request.postData ?? '{}');
        await expect(body).toEqual({ rol: 'JEFE', decision: scenario === 'reject' || scenario === 'other' ? 'RECHAZAR' : 'APROBAR',
          causal: scenario === 'reject' ? 'Fuera del plazo' : scenario === 'other' ? 'Causal de prueba' : null,
          observaciones: 'Revisión de prueba' });
        if (scenario === 'forbidden') return route.fulfill({ status: 403, json: { message: 'Solo el aprobador asignado puede decidir esta solicitud' } });
        if (scenario === 'busy') await held;
        state = body.decision === 'APROBAR' ? 'APROBADA_JEFE' : 'RECHAZADA_JEFE';
        return route.fulfill({ json: solicitud() });
      }
      return route.fulfill({ status: 501, json: { message: 'Ruta no simulada' } });
    });
    await app.open(scenario === 'own' ? '/dashboard/requests' : '/dashboard/requests?bandeja=jefe');
    if (scenario === 'other') await browser.setViewport({ width: 320, height: 568 });
    await screen.getByRole('button', 'Ver solicitud SOL-TEST-91', { exact: true }).tap();
    await expect(screen.getByRole('dialog').getByText('SOL-TEST-91', { exact: true })).toBeVisible();
    if (scenario === 'processed' || scenario === 'foreign' || scenario === 'own') {
      await expect(screen.getByRole('button', 'Aprobar solicitud', { exact: true })).toHaveCount(0);
      await expect(screen.getByRole('button', 'Rechazar solicitud', { exact: true })).toHaveCount(0);
      await expect(posts).toBe(0);
      return;
    }
    const rejection = scenario === 'reject' || scenario === 'other';
    await screen.getByRole('button', rejection ? 'Rechazar solicitud' : 'Aprobar solicitud', { exact: true }).tap();
    await expect(posts).toBe(0); // Selecting an action must not send it.
    const confirm = screen.getByRole('button', rejection ? 'Confirmar rechazo' : 'Confirmar aprobación', { exact: true });
    if (rejection) {
      await expect(confirm).toBeDisabled();
      await screen.getByLabel('Causal de rechazo *', { exact: true }).selectOption({ value: scenario === 'other' ? 'OTRA' : '7' });
      if (scenario === 'other') {
        await expect(confirm).toBeDisabled();
        await screen.getByLabel('Describe la causal *', { exact: true }).fill('Causal de prueba');
      }
    }
    await screen.getByLabel('Observaciones (opcional)', { exact: true }).fill('Revisión de prueba');
    await confirm.tap();
    if (scenario === 'busy') {
      await expect(screen.getByRole('button', 'Guardando…', { exact: true })).toBeDisabled();
      await expect(screen.getByRole('button', 'Cerrar ventana')).toBeDisabled();
      await expect(posts).toBe(1);
      release();
    }
    if (scenario === 'forbidden') {
      await expect(screen.getByRole('alert')).toContainText('Solo el aprobador asignado');
      await expect(screen.getByRole('dialog')).toBeVisible();
      await expect(confirm).toBeEnabled();
      await expect(state).toBe('PENDIENTE_JEFE');
      return;
    }
    await expect(screen.getByRole('dialog')).toHaveCount(0);
    await expect(screen.getByRole('status')).toContainText(rejection ? 'Rechazada por jefe' : 'aprobada por el jefe');
    await expect(posts).toBe(1);
    await expect.poll(() => lists > 1).toBe(true);
  });
}
