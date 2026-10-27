import { test } from '@e2e-dev/web';
import { expect } from 'e2e';

test('la página de login carga', async ({ app, screen }) => {
  await app.open('/login');
  // Rediseño del login (commit 0a3f6ad): heading "Bienvenido de nuevo".
  await expect(screen.getByRole('heading', 'Bienvenido de nuevo')).toBeVisible();
  await expect(screen.getByPlaceholder('Usuario o correo corporativo')).toBeVisible();
  await expect(screen.getByPlaceholder('Contraseña')).toBeVisible();
});

test('la raíz redirige a /login sin sesión', async ({ app, browser }) => {
  await app.open('/');
  await expect(browser).toHaveURL(/\/login/);
});
