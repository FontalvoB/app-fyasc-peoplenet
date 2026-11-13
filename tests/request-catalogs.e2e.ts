import { test } from '@e2e-dev/web';
import { expect } from 'e2e';

for (const scenario of ['identity', 'retry', 'empty'] as const) {
  test(`solicitar permisos: catálogos ${scenario}`, async ({ app, browser, screen }) => {
    // Session intentionally has no employeeId. /solicitudes/me is authoritative.
    const user = { userId: 2, username: 'developer1', employeeId: null, roles: [] };
    await browser.addInitScript((session) => {
      localStorage.setItem('peoplenet-auth', JSON.stringify(session));
    }, { token: 'local-test-token', user });

    let denyCompanies = scenario === 'retry';
    await browser.route('**/api/**', async (route) => {
      const url = new URL(route.request.url);
      if (url.pathname === '/api/auth/me') return route.fulfill({ json: user });
      if (url.pathname === '/api/solicitudes/me') {
        return route.fulfill({ json: { id: 4, nombre: 'Empleado de prueba', empresaId: 2, empresaNombre: 'Fya tech' } });
      }
      if (url.pathname === '/api/solicitudes/empresas') {
        if (denyCompanies) {
          return route.fulfill({ status: 403, json: { message: 'Permiso solicitudes.crear requerido' } });
        }
        return route.fulfill({ json: scenario === 'empty' ? [] : [{ id: 2, name: 'Fya tech', active: true }] });
      }
      if (url.pathname === '/api/solicitudes/aprobadores/sugerido') {
        return route.fulfill({ json: scenario === 'empty' ? null : { id: 3, nombre: 'Jefe de prueba', liderInmediatoDelEmpleado: true } });
      }
      if (url.pathname === '/api/solicitudes/aprobadores') {
        // A suggested boss can be absent from the limited search result.
        return route.fulfill({ json: [] });
      }
      return route.fulfill({ json: {} });
    });
    await app.open('/dashboard/requests/new');

    if (scenario === 'empty') {
      await expect(screen.getByText('No tienes empresas activas asignadas para solicitar permisos. Solicita a Gestión Humana revisar tu vinculación.')).toBeVisible();
      await expect(screen.getByText('No hay aprobadores disponibles. Solicita a Gestión Humana revisar tu jefe inmediato.')).toBeVisible();
      await expect(screen.getByRole('button', 'Enviar solicitud')).toBeDisabled();
      return;
    }
    if (scenario === 'retry') {
      await expect(screen.getByRole('heading', 'Sección restringida')).toBeVisible();
      await expect(screen.getByRole('combobox', 'Empresa')).toBeDisabled();
      denyCompanies = false;
      await screen.getByRole('button', 'Reintentar').tap();
    }
    await expect(screen.getByRole('combobox', 'Empresa')).toHaveValue('2');
    await expect(screen.getByRole('combobox', 'Aprobador')).toHaveValue('3');
    await expect(screen.getByRole('option', 'Jefe de prueba (jefe inmediato)')).toBeAttached();

    if (scenario === 'identity') {
      for (const width of [320, 390, 768]) {
        await browser.setViewport({ width, height: 844 });
        for (const value of ['', '2026-12-10']) {
          await browser.locator('input[type="date"]').first().fill(value);
          await browser.locator('input[type="time"]').first().fill(value ? '08:30' : '');
          const overflowing = await browser.evaluate(() =>
            Array.from(document.querySelectorAll('input[type="date"], input[type="time"]'))
              .filter((input) => {
                const field = input.getBoundingClientRect();
                const container = input.parentElement!.getBoundingClientRect();
                return field.left < container.left - 1 || field.right > container.right + 1;
              })
              .map((input) => input.getAttribute('type')),
          );
          await expect(overflowing).toEqual([]);
        }
      }
    }
  });
}
