import { test } from '@e2e-dev/web';
import { expect } from 'e2e';

const user = { userId: 7, employeeId: 16, username: 'colaborador', roles: [] };
const session = { user, token: 'local-test-token' };

test('certificado propio: previsualizar, emitir y descargar', async ({ app, browser, screen }) => {
  const existing = {
    id: 40, certificateNumber: 'CERT-GH', certificateType: 'labor',
    companyName: 'Empresa de prueba', issueDate: '2026-11-10', status: 'ISSUED',
  };
  const issued = { ...existing, id: 41, certificateNumber: 'CERT-MIO' };
  let didIssue = false;
  await browser.addInitScript(value => {
    localStorage.setItem('peoplenet-auth', JSON.stringify(value));
  }, session);
  await browser.route('**/api/**', async route => {
    const path = new URL(route.request.url).pathname;
    if (path === '/api/auth/me') return route.fulfill({ json: user });
    if (path === '/api/certificates/me/preview') {
      await expect(didIssue).toBe(false);
      return route.fulfill({ path: 'public/icon-light-32x32.png' });
    }
    if (path === '/api/certificates/me') {
      await expect(route.request.headers.authorization).toBe('Bearer local-test-token');
      if (route.request.method === 'POST') {
        didIssue = true;
        return route.fulfill({ status: 201, json: issued });
      }
      return route.fulfill({
        json: {
          currentPage: 0, totalPages: 1, hasPreviousPage: false, hasNextPage: false,
          content: didIssue ? [issued, existing] : [existing],
        },
      });
    }
    if (path === '/api/certificates/me/41/download') {
      return route.fulfill({ body: '%PDF-1.4 fixture', contentType: 'application/pdf' });
    }
    return route.fulfill({ json: {} });
  });

  await app.open('/dashboard/certificates');
  await expect(screen.getByText('CERT-GH', { exact: true })).toBeVisible();
  await screen.getByRole('button', 'Generar certificado laboral').tap();
  await expect(screen.getByRole('img', 'Vista previa del certificado laboral')).toBeVisible();
  await expect(didIssue).toBe(false);
  await screen.getByRole('button', 'Emitir certificado').tap();
  await expect(screen.getByText('Certificado CERT-MIO emitido.')).toBeVisible();
  const download = browser.waitForResponse('**/api/certificates/me/41/download');
  await screen.getByRole('button', 'Descargar PDF').first().tap();
  await expect((await download).status).toBe(200);
});

test('perfil: reemplazar y quitar foto y cambiar la contraseña desde la sesión', async ({ app, browser, screen }) => {
  let photoUrl: string | null = null;
  let receivedOtp = false;
  await browser.addInitScript(value => {
    localStorage.setItem('peoplenet-auth', JSON.stringify(value));
  }, session);
  await browser.route('**/api/**', async route => {
    const { method, headers } = route.request;
    const path = new URL(route.request.url).pathname;
    if (path === '/api/auth/me') return route.fulfill({ json: user });
    if (path === '/api/profile/me/photo') {
      if (method === 'PUT') {
        await expect(headers['content-type']).toContain('multipart/form-data');
        photoUrl = '/icon-light-32x32.png';
      }
      if (method === 'DELETE') {
        photoUrl = null;
        return route.fulfill({ status: 204 });
      }
      return route.fulfill({ json: { url: photoUrl } });
    }
    if (path === '/api/profile/me/password/otp') {
      receivedOtp = true;
      return route.fulfill({ status: 204 });
    }
    if (path === '/api/profile/me/password') {
      await expect(headers.authorization).toBe('Bearer local-test-token');
      await expect(receivedOtp).toBe(true);
      const change = JSON.parse(route.request.postData ?? '{}');
      if (change.otp === '123456') return route.fulfill({ status: 204 });
      return route.fulfill({ status: 400, json: { message: 'Código inválido o vencido' } });
    }
    return route.fulfill({ json: {} });
  });

  await app.open('/dashboard/profile');
  await expect(screen.getByRole('button', 'Cargar foto')).toBeEnabled();
  await browser.locator('input[type="file"]').setInputFiles('public/icon-light-32x32.png');
  await expect(screen.getByRole('img', 'Foto de perfil')).toBeVisible();
  await app.open('/dashboard/profile');
  await expect(screen.getByRole('img', 'Foto de perfil')).toBeVisible();
  await screen.getByRole('button', 'Quitar foto').tap();
  await expect(screen.getByRole('button', 'Cargar foto')).toBeEnabled();
  await expect(screen.getByRole('img', 'Foto de perfil')).toHaveCount(0);

  await screen.getByRole('button', 'Enviar código a mi correo').tap();
  await screen.getByLabel('Código de verificación').fill('123450');
  await screen.getByLabel('Nueva contraseña', { exact: true }).fill('Fixture-Password123');
  await screen.getByLabel('Confirma la nueva contraseña').fill('Fixture-Password123');
  await screen.getByRole('button', 'Guardar contraseña').tap();
  await expect(screen.getByText('Código inválido o vencido')).toBeVisible();
  await screen.getByLabel('Código de verificación').fill('123456');
  await screen.getByRole('button', 'Guardar contraseña').tap();
  await expect(screen.getByText('Tu contraseña se actualizó. Puedes seguir usando esta sesión.')).toBeVisible();
  await expect(browser).toHaveURL(/\/dashboard\/profile/);
});

test('novedades: radicar una solicitud con varios soportes', async ({ app, browser, screen }) => {
  const boss = { id: 12, nombre: 'Jefe de prueba', liderInmediatoDelEmpleado: true };
  await browser.addInitScript(value => {
    localStorage.setItem('peoplenet-auth', JSON.stringify(value));
  }, session);
  await browser.route('**/api/**', async route => {
    const path = new URL(route.request.url).pathname;
    if (path === '/api/auth/me') return route.fulfill({ json: user });
    if (path === '/api/solicitudes/me') {
      return route.fulfill({ json: { id: user.employeeId, nombre: 'Colaborador', empresaId: 2 } });
    }
    if (path === '/api/solicitudes/empresas') {
      return route.fulfill({ json: [{ id: 2, name: 'Empresa de prueba', active: true }] });
    }
    if (path === '/api/solicitudes/aprobadores/sugerido') return route.fulfill({ json: boss });
    if (path === '/api/solicitudes/aprobadores') return route.fulfill({ json: [boss] });
    if (path === '/api/solicitudes' && route.request.method === 'POST') {
      const payload = JSON.parse(route.request.postData ?? '{}');
      await expect(payload.documentos.map((document: { nombreArchivo: string }) => document.nombreArchivo))
        .toEqual(['icon-light-32x32.png', 'apple-icon.png']);
      return route.fulfill({ status: 201, json: { radicado: 'SOL-PRUEBA', estado: 'PENDIENTE_JEFE' } });
    }
    return route.fulfill({ json: {} });
  });

  await app.open('/dashboard/requests/new');
  await expect(screen.getByRole('combobox', 'Aprobador')).toHaveValue('12');
  const futureDate = new Date(Date.now() + 2 * 86_400_000).toISOString().slice(0, 10);
  await browser.locator('input[type="date"]').first().fill(futureDate);
  await browser.locator('textarea').first().fill('Solicitud de prueba con documentos.');
  await browser.locator('input[type="file"]').setInputFiles([
    'public/icon-light-32x32.png', 'public/apple-icon.png', 'public/pwa-192x192.png',
  ]);
  await screen.getByRole('button', 'Quitar soporte pwa-192x192.png').tap();
  await expect(screen.getByRole('button', 'Quitar soporte icon-light-32x32.png')).toBeVisible();
  await expect(screen.getByRole('button', 'Quitar soporte apple-icon.png')).toBeVisible();
  await screen.getByRole('button', 'Enviar solicitud').tap();
  await expect(screen.getByRole('dialog').getByText('SOL-PRUEBA', { exact: true }).first()).toBeVisible();
});

test('novedades: renueva un enlace vencido al descargar un soporte', async ({ app, browser, screen }) => {
  const request = {
    id: 10, radicado: 'SOL-FIXTURE', tipo: 'PERMISO', estado: 'PENDIENTE_JEFE',
    descripcion: 'Solicitud con un soporte', documentos: [], historial: [],
  };
  let detailReads = 0;
  await browser.addInitScript(value => {
    localStorage.setItem('peoplenet-auth', JSON.stringify(value));
  }, session);
  await browser.route('**/api/**', async route => {
    const url = new URL(route.request.url);
    if (url.pathname === '/api/auth/me') return route.fulfill({ json: user });
    if (url.pathname === '/api/solicitudes/mias') {
      return route.fulfill({ json: { content: [request], totalElements: 1, totalPages: 1, number: 0 } });
    }
    if (url.pathname === '/api/solicitudes/10') {
      detailReads++;
      return route.fulfill({
        json: {
          ...request,
          documentos: [{
            id: 6, nombreArchivo: 'soporte.png', mimeType: 'image/png', tamanoBytes: 150,
            downloadUrl: new URL(detailReads === 1 ? '/fixture/vencido.png' : '/fixture/soporte.png', url).href,
          }],
        },
      });
    }
    return route.fulfill({ json: {} });
  });
  await browser.route('**/fixture/vencido.png', route => route.fulfill({ status: 403 }));
  await browser.route('**/fixture/soporte.png', route => route.fulfill({ path: 'public/icon-light-32x32.png' }));

  await app.open('/dashboard/requests');
  await screen.getByRole('button', 'Ver solicitud SOL-FIXTURE').tap();
  const download = browser.waitForResponse('**/fixture/soporte.png');
  await screen.getByRole('button', 'Descargar soporte soporte.png').tap();
  await expect((await download).status).toBe(200);
  await expect(detailReads).toBe(2);
});

test('KPIs propios: comentar, subir una evidencia y mostrar el cupo agotado', async ({ app, browser, screen }) => {
  const indicator = {
    id: 51, indicatorTitle: 'Cumplimiento de prueba', month: 'noviembre', year: 2026,
    measurementUnit: '%', targetPercentage: 100, finalResultValue: 92, active: true,
  };
  const comment = { id: 3, authorName: 'Colaborador', commentText: 'Comentario de prueba' };
  const evidence = {
    id: 5, status: 'PENDING', fileName: 'icon-light-32x32.png', hasFile: true,
    description: 'Archivo de prueba',
  };
  let posted = false;
  let uploaded = false;
  await browser.addInitScript(value => {
    localStorage.setItem('peoplenet-auth', JSON.stringify(value));
  }, session);
  await browser.route('**/api/**', async route => {
    const { method, headers } = route.request;
    const path = new URL(route.request.url).pathname;
    if (path === '/api/auth/me') return route.fulfill({ json: user });
    if (path.endsWith('/analytics')) return route.fulfill({ json: null });
    if (path.startsWith('/api/indicators/employee/16')) return route.fulfill({ json: [indicator] });
    if (path === '/api/indicators/me/51/comments') {
      if (method === 'POST') {
        await expect(JSON.parse(route.request.postData ?? '{}')).toEqual({ commentText: comment.commentText });
        posted = true;
        return route.fulfill({ status: 201, json: comment });
      }
      return route.fulfill({ json: posted ? [comment] : [] });
    }
    if (path === '/api/indicators/me/51/evidences') {
      if (method === 'POST') {
        await expect(headers['content-type']).toContain('multipart/form-data');
        uploaded = true;
        return route.fulfill({ status: 201, json: evidence });
      }
      return route.fulfill({
        json: {
          indicatorId: 51, assignmentId: 72, evidences: uploaded ? [evidence] : [],
          capacity: {
            count: uploaded ? 1 : 0, limit: 1, available: uploaded ? 0 : 1,
            unlimited: false, canSubmit: !uploaded, blockedReason: uploaded ? 'Cupo agotado' : null,
          },
        },
      });
    }
    return route.fulfill({ json: {} });
  });

  await app.open('/dashboard/kpis');
  await screen.getByRole('button', 'Ver detalle de Cumplimiento de prueba').tap();
  await screen.getByLabel('Nuevo comentario').fill(comment.commentText);
  await screen.getByRole('button', 'Enviar comentario').tap();
  await expect(screen.getByText(comment.commentText, { exact: true })).toBeVisible();
  await browser.locator('input[type="file"]').setInputFiles('public/icon-light-32x32.png');
  await screen.getByRole('button', 'Subir evidencia').tap();
  await expect(screen.getByText('Cupo agotado')).toBeVisible();
  await expect(screen.getByText(evidence.fileName, { exact: true })).toBeVisible();
});
