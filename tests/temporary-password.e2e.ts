import { test } from '@e2e-dev/web';
import { expect, secrets } from 'e2e';

for (const scenario of ['success', 'expired', 'cancel', 'missing-token'] as const) {
  test(`contraseña temporal: ${scenario}`, async ({ app, browser, screen }) => {
    let changed = false;
    let changes = 0;
    const user = { userId: 21, username: 'primer.ingreso', email: 'persona@example.test', roles: [],
      employeeId: null, requirePasswordChange: true, token: 'first-login-test-token' };
    await browser.route('**/api/**', async route => {
      const path = new URL(route.request.url).pathname;
      if (path === '/api/auth/login') {
        return route.fulfill({ json: { ...user, requirePasswordChange: !changed,
          token: scenario === 'missing-token' ? null : user.token } });
      }
      if (path === '/api/auth/change-password') {
        changes++;
        await expect(route.request.method).toBe('POST');
        await expect(route.request.headers['authorization']).toBe(`Bearer ${user.token}`);
        const body = JSON.parse(route.request.postData ?? '{}');
        await expect(Object.keys(body).sort()).toEqual(['confirmPassword', 'newPassword', 'userId']);
        await expect(body.userId).toBe(21);
        await expect(Boolean(body.newPassword.length >= 8 && body.newPassword === body.confirmPassword)).toBe(true);
        if (scenario === 'expired') return route.fulfill({ status: 401, json: { message: 'No autenticado' } });
        changed = true;
        return route.fulfill({ body: 'Contraseña cambiada exitosamente', contentType: 'text/plain' });
      }
      return route.fulfill({ status: 501, json: { message: 'Ruta no simulada' } });
    });
    await app.open('/login');
    await screen.getByLabel('Usuario o correo corporativo', { exact: true }).fill(user.username);
    await screen.getByLabel('Contraseña', { exact: true }).fill(secrets.get('recoveryOtherPassword'));
    await screen.getByRole('button', 'Iniciar sesión', { exact: true }).tap();
    if (scenario === 'missing-token') {
      await expect(screen.getByRole('alert')).toContainText('No se pudo iniciar el cambio');
      await expect(screen.getByRole('dialog')).toHaveCount(0);
      await expect(await browser.evaluate(() => localStorage.getItem('peoplenet-auth'))).toBe(null);
      return;
    }
    await expect(screen.getByRole('heading', 'Cambia tu contraseña temporal')).toBeVisible();
    await expect(await browser.evaluate(() => localStorage.getItem('peoplenet-auth'))).toBe(null);
    await expect(browser).toHaveURL(/\/login/);
    if (scenario === 'cancel') {
      await screen.getByRole('button', 'Cancelar cambio').tap();
      await expect(screen.getByRole('dialog')).toHaveCount(0);
      await expect(changes).toBe(0);
      await expect(await browser.evaluate(() => localStorage.getItem('peoplenet-auth'))).toBe(null);
      return;
    }
    await screen.getByLabel('Nueva contraseña', { exact: true }).fill(secrets.get('recoveryPassword'));
    await screen.getByLabel('Confirmar nueva contraseña', { exact: true }).fill(secrets.get('recoveryOtherPassword'));
    await screen.getByRole('button', 'Guardar nueva contraseña').tap();
    await expect(screen.getByRole('alert')).toContainText('Las contraseñas no coinciden');
    await expect(changes).toBe(0);
    await screen.getByLabel('Confirmar nueva contraseña', { exact: true }).fill(secrets.get('recoveryPassword'));
    await screen.getByRole('button', 'Guardar nueva contraseña').tap();
    if (scenario === 'expired') {
      await expect(screen.getByRole('alert')).toContainText('Tu ingreso temporal venció');
      await expect(screen.getByRole('heading', 'Cambia tu contraseña temporal')).toBeVisible();
      await expect(await browser.evaluate(() => localStorage.getItem('peoplenet-auth'))).toBe(null);
      return;
    }
    await expect(screen.getByRole('dialog')).toHaveCount(0);
    await expect(screen.getByRole('status')).toContainText('Contraseña actualizada');
    await expect(await browser.evaluate(() => localStorage.getItem('peoplenet-auth'))).toBe(null);
    await expect(screen.getByLabel('Contraseña', { exact: true })).toBeVisible();
    await screen.getByLabel('Contraseña', { exact: true }).fill(secrets.get('recoveryPassword'));
    await screen.getByRole('button', 'Iniciar sesión', { exact: true }).tap();
    await expect(browser).toHaveURL(/\/dashboard/);
    await expect(await browser.evaluate(() => {
      const session = JSON.parse(localStorage.getItem('peoplenet-auth') ?? 'null');
      return Boolean(session?.token && session.user.requirePasswordChange === false);
    })).toBe(true);
  });
}
