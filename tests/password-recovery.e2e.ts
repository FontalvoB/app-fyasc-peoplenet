import { test } from '@e2e-dev/web';
import { expect, secrets } from 'e2e';

for (const scenario of ['success', 'expired', 'unavailable'] as const) {
  test(`recuperar contraseña: ${scenario}`, async ({ app, browser, screen }) => {
    let sends = 0;
    let confirmations = 0;
    await browser.route('**/api/**', async route => {
      const path = new URL(route.request.url).pathname;
      if (path === '/api/auth/request-password-reset') {
        sends++;
        await expect(route.request.method).toBe('POST');
        await expect(JSON.parse(route.request.postData ?? '{}')).toEqual({ email: 'persona@example.test' });
        return route.fulfill({ status: scenario === 'unavailable' && sends === 1 ? 500 : 200,
          json: { success: !(scenario === 'unavailable' && sends === 1), message: 'Servicio de correo no disponible' } });
      }
      if (path === '/api/auth/confirm-password-reset') {
        confirmations++;
        const body = JSON.parse(route.request.postData ?? '{}');
        await expect(route.request.method).toBe('POST');
        await expect(Object.keys(body).sort()).toEqual(['confirmPassword', 'newPassword', 'token']);
        await expect(Boolean(body.token && body.newPassword.length >= 8 && body.newPassword === body.confirmPassword)).toBe(true);
        return route.fulfill({ status: scenario === 'expired' && confirmations === 1 ? 400 : 200,
          json: { success: !(scenario === 'expired' && confirmations === 1), message: 'Error al recuperar contraseña', errorDetails: 'El token ha expirado' } });
      }
      return route.fulfill({ status: 501, json: { message: 'Ruta no simulada' } });
    });
    await app.open('/login');
    await screen.getByRole('button', '¿Olvidaste tu contraseña?').tap();
    await screen.getByLabel('Correo electrónico', { exact: true }).fill('persona@example.test');
    await screen.getByRole('button', 'Enviar código', { exact: true }).tap();
    if (scenario === 'unavailable') {
      await expect(screen.getByRole('alert')).toContainText('Servicio de correo no disponible');
      await expect(screen.getByLabel('Correo electrónico', { exact: true })).toBeVisible();
      await screen.getByRole('button', 'Enviar código', { exact: true }).tap();
    }
    await screen.getByLabel('Código del correo', { exact: true }).fill(secrets.get('recoveryCode'));
    await screen.getByLabel('Nueva contraseña', { exact: true }).fill(secrets.get('recoveryPassword'));
    await screen.getByLabel('Confirmar nueva contraseña', { exact: true }).fill(secrets.get('recoveryOtherPassword'));
    await screen.getByRole('button', 'Restablecer contraseña', { exact: true }).tap();
    await expect(screen.getByRole('alert')).toContainText('Las contraseñas no coinciden');
    await expect(confirmations).toBe(0);
    await screen.getByLabel('Confirmar nueva contraseña', { exact: true }).fill(secrets.get('recoveryPassword'));
    await screen.getByRole('button', 'Restablecer contraseña', { exact: true }).tap();
    if (scenario === 'expired') {
      await expect(screen.getByRole('alert')).toContainText('haber vencido');
      await expect(screen.getByRole('button', 'Volver a iniciar sesión')).toHaveCount(0);
      await screen.getByRole('button', 'Solicitar otro código').tap();
      await screen.getByRole('button', 'Enviar código', { exact: true }).tap();
      await screen.getByLabel('Código del correo', { exact: true }).fill(secrets.get('recoveryCode'));
      await screen.getByRole('button', 'Restablecer contraseña', { exact: true }).tap();
    }
    await expect(screen.getByRole('status')).toContainText('Contraseña restablecida');
    await screen.getByRole('button', 'Volver a iniciar sesión').tap();
    await expect(screen.getByRole('heading', 'Bienvenido de nuevo')).toBeVisible();
    await expect(screen.getByRole('dialog')).toHaveCount(0);
    await expect(await browser.evaluate(() => localStorage.getItem('peoplenet-auth'))).toBe(null);
  });
}
