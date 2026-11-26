import { test } from '@e2e-dev/web';
import { expect } from 'e2e';

const user = {
  userId: 123,
  employeeId: 123,
  username: 'laura.gomez',
  roles: [],
};
const session = { user, token: 'local-test-token' };

const baseSite = {
  id: 1,
  code: 'S1',
  name: 'Sede Principal Chapinero',
  address: 'Cra 7 # 63-44',
  city: 'Bogotá',
  latitude: 4.648612,
  longitude: -74.062841,
  radiusMeters: 50,
  maxGpsAccuracyMeters: 30,
  requireDynamicQr: false,
  qrRotationSeconds: 30,
  isPrimary: true,
};

function makeContext(overrides: {
  accepted?: boolean;
  profileType?: 'FIXED_SITE' | 'FIELD_ADVISOR' | 'HYBRID';
  requireBreaks?: boolean;
  requireLivePhotoShift?: boolean;
  requireLivePhotoVisit?: boolean;
  allowedNextEvents?: string[];
  todayRecords?: unknown[];
}) {
  return {
    employeeId: 123,
    employeeName: 'LAURA GÓMEZ',
    documentNumber: '1010123456',
    positionName: overrides.profileType === 'FIELD_ADVISOR' ? 'Asesor Comercial' : 'Analista',
    areaName: 'Comercial',
    serverTimeIso: '2026-11-26T15:30:00Z',
    consent: {
      accepted: overrides.accepted ?? true,
      policyVersion: 'v2026.1',
      acceptedAt: overrides.accepted === false ? null : '2026-11-26T12:00:00Z',
      revokedAt: null,
      photoRetentionDays: 90,
    },
    policy: {
      id: 2,
      code: overrides.profileType === 'FIELD_ADVISOR' ? 'CAMPO_ASESOR' : 'SEDE_FIJA',
      name: overrides.profileType === 'FIELD_ADVISOR' ? 'Asesores de Campo' : 'Sede Fija',
      profileType: overrides.profileType ?? 'FIXED_SITE',
      requireBreaks: overrides.requireBreaks ?? false,
      requireGeofence: overrides.profileType !== 'FIELD_ADVISOR',
      requireLivePhotoShift: overrides.requireLivePhotoShift ?? false,
      requireLivePhotoVisit: overrides.requireLivePhotoVisit ?? true,
      allowFreeVisits: true,
      allowRouteVisits: true,
      expectedStartTime: '08:00:00',
      expectedEndTime: '17:00:00',
      lateToleranceMinutes: 10,
      maxGpsAccuracyMeters: 40,
      photoRetentionDays: 90,
    },
    authorizedSites: [baseSite],
    allowedNextEvents: overrides.allowedNextEvents ?? ['CLOCK_IN'],
    todayRecords: overrides.todayRecords ?? [],
    lastValidRecord: null,
  };
}

function installBrowserMocks(
  browser: Parameters<Parameters<typeof test>[1]>[0]['browser'],
) {
  return browser.addInitScript((authSession) => {
    localStorage.setItem('peoplenet-auth', JSON.stringify(authSession));
    Object.defineProperty(navigator, 'geolocation', {
      configurable: true,
      value: {
        getCurrentPosition: (success: PositionCallback) => {
          success({
            coords: {
              latitude: 4.64865,
              longitude: -74.06281,
              accuracy: 12,
              altitude: null,
              altitudeAccuracy: null,
              heading: null,
              speed: null,
            },
            timestamp: Date.now(),
          } as GeolocationPosition);
        },
        watchPosition: () => 1,
        clearWatch: () => undefined,
      },
    });
  }, session);
}

test('asistencia: gate de consentimiento Ley 1581 -> aceptación -> carga del hub', async ({
  app,
  browser,
  screen,
}) => {
  let consentAccepted = false;
  await installBrowserMocks(browser);
  await browser.route('**/*tile.openstreetmap.org/**', (route) =>
    route.fulfill({ path: 'public/icon-light-32x32.png' }),
  );
  await browser.route('**/api/**', async (route) => {
    const path = new URL(route.request.url).pathname;
    if (path === '/api/auth/me') return route.fulfill({ json: user });
    if (path === '/api/attendance/me/context') {
      return route.fulfill({ json: makeContext({ accepted: consentAccepted }) });
    }
    if (path === '/api/attendance/me/consent' && route.request.method === 'POST') {
      const body = JSON.parse(route.request.postData ?? '{}');
      await expect(body).toEqual({ policyVersion: 'v2026.1', accepted: true });
      consentAccepted = true;
      return route.fulfill({
        json: {
          accepted: true,
          policyVersion: 'v2026.1',
          acceptedAt: '2026-11-26T15:30:05Z',
          revokedAt: null,
          photoRetentionDays: 90,
        },
      });
    }
    return route.fulfill({ json: {} });
  });

  await app.open('/dashboard/attendance');
  await expect(screen.getByRole('heading', 'Autorización para registro de asistencia')).toBeVisible();
  await expect(screen.getByText('Ley 1581 de 2012')).toBeVisible();
  await expect(screen.getByText('90 días')).toBeVisible();

  await screen.getByRole('button', 'Autorizo el tratamiento').tap();
  await expect(screen.getByText('HORA OFICIAL DEL SERVIDOR')).toBeVisible();
  await expect(screen.getByRole('button', 'MARCAR ASISTENCIA').first()).toBeVisible();
  await expect(screen.getByRole('heading', 'Selecciona el tipo de marcación')).toBeVisible();
});

test('asistencia FIXED_SITE: 4 eventos vs 2 eventos, comprobante SHA-256 y novedad prellenada', async ({
  app,
  browser,
  screen,
}) => {
  let requireBreaks = true;
  let punched = false;
  const createdPunch = {
    id: 45,
    receiptCode: 'AS-20261126-000045',
    employeeId: 123,
    employeeName: 'LAURA GÓMEZ',
    documentNumber: '1010123456',
    siteId: 1,
    siteName: 'Sede Principal Chapinero',
    eventType: 'CLOCK_IN',
    serverTimestamp: '2026-11-26T15:30:03Z',
    deviceTimestamp: '2026-11-26T15:30:02Z',
    latitude: 4.64865,
    longitude: -74.06281,
    gpsAccuracyMeters: 12,
    distanceToSiteMeters: 6,
    channel: 'PWA',
    status: 'APPROVED',
    effectiveStatus: 'APPROVED',
    lateMinutes: 0,
    checks: [{ key: 'GEOFENCE', outcome: 'OK', detail: 'A 6 m de la sede (radio 50 m)' }],
    evidenceHash: 'a3f19c8e2b4d7012ff9900aabbccddeeff11223344556677889900aabbcc1234',
    photoPresignedUrl: null,
    photoPurgedAt: null,
    reviewedStatus: null,
    reviewedByName: null,
    reviewedAt: null,
    reviewJustification: null,
    corrections: [],
  };

  await installBrowserMocks(browser);
  await browser.route('**/*tile.openstreetmap.org/**', (route) =>
    route.fulfill({ path: 'public/icon-light-32x32.png' }),
  );
  await browser.route('**/api/**', async (route) => {
    const path = new URL(route.request.url).pathname;
    if (path === '/api/auth/me') return route.fulfill({ json: user });
    if (path === '/api/attendance/me/context') {
      return route.fulfill({
        json: makeContext({
          accepted: true,
          profileType: 'FIXED_SITE',
          requireBreaks,
          requireLivePhotoShift: false,
          allowedNextEvents: punched ? ['CLOCK_OUT'] : ['CLOCK_IN'],
          todayRecords: punched ? [createdPunch] : [],
        }),
      });
    }
    if (path === '/api/attendance/me/punches' && route.request.method === 'POST') {
      await expect(route.request.headers['content-type']).toContain('multipart/form-data');
      punched = true;
      return route.fulfill({ status: 201, json: createdPunch });
    }
    if (path === '/api/attendance/me/punches') {
      return route.fulfill({ json: punched ? [createdPunch] : [] });
    }
    if (path === '/api/solicitudes/me') {
      return route.fulfill({
        json: { id: 123, nombre: 'LAURA GÓMEZ', cargo: 'Analista', empresaId: 2 },
      });
    }
    if (path === '/api/solicitudes/empresas') {
      return route.fulfill({ json: [{ id: 2, name: 'Fya Social Capital', active: true }] });
    }
    if (path === '/api/solicitudes/aprobadores/sugerido') {
      return route.fulfill({
        json: { id: 12, nombre: 'Jefe inmediato', liderInmediatoDelEmpleado: true },
      });
    }
    if (path === '/api/solicitudes/aprobadores') {
      return route.fulfill({
        json: [{ id: 12, nombre: 'Jefe inmediato', liderInmediatoDelEmpleado: true }],
      });
    }
    if (path === '/api/solicitudes' && route.request.method === 'POST') {
      const body = JSON.parse(route.request.postData ?? '{}');
      await expect(body.tipo).toBe('NOVEDAD_ASISTENCIA');
      await expect(body.attendanceRecordId).toBe(45);
      return route.fulfill({
        status: 201,
        json: {
          id: 901,
          radicado: 'SOL-ASIST-901',
          tipo: 'NOVEDAD_ASISTENCIA',
          estado: 'PENDIENTE_JEFE',
          aprobadorNombre: 'Jefe inmediato',
          attendanceRecordId: 45,
        },
      });
    }
    return route.fulfill({ json: {} });
  });

  // 1) Política con descansos (4 eventos)
  await app.open('/dashboard/attendance');
  await expect(screen.getByRole('button', /Entrada/)).toBeEnabled();
  await expect(screen.getByRole('button', /Inicio descanso/)).toBeDisabled();
  await expect(screen.getByRole('button', /Fin descanso/)).toBeDisabled();
  await expect(screen.getByRole('button', /Salida/)).toBeDisabled();

  // 2) Política sin descansos (2 eventos) -> flujo completo hasta comprobante SHA-256
  requireBreaks = false;
  await app.open('/dashboard/attendance');
  await expect(screen.getByRole('button', /Entrada/)).toBeEnabled();
  await expect(screen.getByRole('button', /Salida/)).toBeDisabled();
  await expect(screen.getByRole('button', /Inicio descanso/)).toHaveCount(0);
  await expect(screen.getByRole('button', /Fin descanso/)).toHaveCount(0);

  await screen.getByRole('button', /Entrada/).tap();
  await expect(screen.getByText('±12 m')).toBeVisible();
  await expect(screen.getByText('Sede Principal Chapinero', { exact: true })).toBeVisible();
  await screen.getByRole('button', 'Continuar').tap();

  await expect(screen.getByRole('heading', 'Confirmar marcación')).toBeVisible();
  await screen.getByRole('button', 'Confirmar marcación').tap();

  await expect(screen.getByRole('heading', 'AS-20261126-000045')).toBeVisible();
  await expect(screen.getByText('a3f19c8e2b4d7012ff9900aabbccddeeff11223344556677889900aabbcc1234')).toBeVisible();
  await expect(screen.getByText('A 6 m de la sede (radio 50 m)')).toBeVisible();

  await screen.getByRole('button', 'Reportar novedad sobre esta marcación').tap();
  await expect(browser).toHaveURL(/\/dashboard\/requests\/new\?tipo=NOVEDAD_ASISTENCIA&attendanceRecordId=45/);
  await expect(screen.getByRole('button', 'Novedad de asistencia')).toHaveAttribute('aria-pressed', 'true');
  await expect(screen.getByText('Solicitud vinculada a la marcación de asistencia #45.')).toBeVisible();
  await expect(screen.getByRole('combobox', 'Empresa')).toHaveValue('2');
  await expect(screen.getByRole('combobox', 'Aprobador')).toHaveValue('12');

  await browser.locator('textarea').first().fill('El GPS tardó en estabilizar al ingresar.');
  await screen.getByRole('button', 'Enviar solicitud').tap();
  await expect(screen.getByRole('dialog').getByText('SOL-ASIST-901', { exact: true }).first()).toBeVisible();
});

test('asistencia FIELD_ADVISOR: pestaña Visitas de Campo con Mi Ruta del Día y Visita Libre', async ({
  app,
  browser,
  screen,
}) => {
  const now = new Date();
  const todayIso = new Date(now.getTime() - now.getTimezoneOffset() * 60_000)
    .toISOString()
    .slice(0, 10);

  await installBrowserMocks(browser);
  await browser.route('**/*tile.openstreetmap.org/**', (route) =>
    route.fulfill({ path: 'public/icon-light-32x32.png' }),
  );
  await browser.route('**/api/**', async (route) => {
    const path = new URL(route.request.url).pathname;
    if (path === '/api/auth/me') return route.fulfill({ json: user });
    if (path === '/api/attendance/me/context') {
      return route.fulfill({
        json: makeContext({
          accepted: true,
          profileType: 'FIELD_ADVISOR',
          requireBreaks: false,
          requireLivePhotoShift: false,
          requireLivePhotoVisit: true,
        }),
      });
    }
    if (path === '/api/attendance/field/my-routes') {
      return route.fulfill({
        json: [
          {
            id: 10,
            advisorEmployeeId: 123,
            advisorName: 'LAURA GÓMEZ',
            routeDate: todayIso,
            name: 'Ruta Norte Bogotá',
            status: 'IN_PROGRESS',
            notes: 'Priorizar renovaciones',
            stops: [
              {
                id: 31,
                stopOrder: 1,
                plannedTime: '09:30:00',
                objective: 'Radicación firma',
                status: 'PENDING',
                client: {
                  id: 8,
                  code: 'CL-008',
                  name: 'Colegio San Patricio',
                  address: 'Cra 15 # 120-10',
                  city: 'Bogotá',
                  contactName: 'Carlos Ruiz',
                  contactPhone: '3001112233',
                  latitude: 4.6991,
                  longitude: -74.0412,
                  geofenceRadiusMeters: 80,
                },
                visitId: null,
              },
              {
                id: 32,
                stopOrder: 2,
                plannedTime: '11:00:00',
                objective: 'Entrega portafolio',
                status: 'CHECKED_IN',
                client: {
                  id: 9,
                  code: 'CL-009',
                  name: 'Clínica del Country',
                  address: 'Cra 16 # 82-57',
                  city: 'Bogotá',
                  contactName: 'Ana Silva',
                  contactPhone: '3002223344',
                  latitude: 4.6685,
                  longitude: -74.0568,
                  geofenceRadiusMeters: 80,
                },
                visitId: 76,
              },
            ],
          },
        ],
      });
    }
    if (path === '/api/attendance/field/my-visits') {
      return route.fulfill({
        json: [
          {
            id: 80,
            receiptCode: 'FV-20261126-000080',
            employeeId: 123,
            employeeName: 'LAURA GÓMEZ',
            visitMode: 'FREE',
            routeStopId: null,
            clientId: null,
            clientName: 'Ferretería Central',
            address: 'Calle 72 # 14-20',
            checkinTimestamp: `${todayIso}T14:00:00Z`,
            checkinLatitude: 4.657,
            checkinLongitude: -74.061,
            checkinAccuracyMeters: 15,
            distanceToClientMeters: null,
            checkinPhotoPresignedUrl: null,
            photoPurgedAt: null,
            checkoutTimestamp: null,
            checkoutLatitude: null,
            checkoutLongitude: null,
            durationMinutes: null,
            notes: 'Visita comercial en frío',
            status: 'APPROVED',
            effectiveStatus: 'APPROVED',
            checks: [],
            evidenceHash: 'f8d2...',
            reviewedStatus: null,
            reviewedByName: null,
            reviewedAt: null,
            reviewJustification: null,
          },
        ],
      });
    }
    return route.fulfill({ json: {} });
  });

  await app.open('/dashboard/attendance');
  const fieldTab = screen.getByRole('button', 'Visitas de Campo');
  await expect(fieldTab).toBeVisible();
  await fieldTab.tap();

  await expect(screen.getByRole('button', 'Mi Ruta del Día')).toBeVisible();
  await expect(screen.getByRole('button', 'Visita Libre')).toBeVisible();
  await expect(screen.getByRole('heading', 'Ruta Norte Bogotá')).toBeVisible();
  await expect(screen.getByText('Colegio San Patricio', { exact: true })).toBeVisible();
  await expect(screen.getByText('Clínica del Country', { exact: true })).toBeVisible();
  await expect(screen.getByRole('button', 'Registrar llegada (Check-in)')).toBeVisible();
  await expect(screen.getByRole('button', 'Cerrar visita (Check-out)')).toBeVisible();

  await screen.getByRole('button', 'Visita Libre').tap();
  await expect(screen.getByRole('heading', 'Registrar visita libre')).toBeVisible();
  await expect(screen.getByLabel('Nombre del cliente o punto visitado')).toBeVisible();
  await expect(screen.getByRole('heading', 'Visitas libres abiertas hoy')).toBeVisible();
  await expect(screen.getByText('Ferretería Central', { exact: true })).toBeVisible();
  await expect(screen.getByRole('button', 'Cerrar visita (Check-out)')).toBeVisible();
});
