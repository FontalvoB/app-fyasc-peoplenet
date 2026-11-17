import type { E2EConfig } from 'e2e';
import { web } from '@e2e-dev/web';

export default {
  tests: ['pwa-tests/**/*.e2e.ts'],
  targets: [{ name: 'pwa', engine: web({ viewport: { width: 390, height: 844 } }),
    app: { url: 'http://127.0.0.1:4174', command: {
      executable: 'node', args: ['scripts/serve-pwa-test.mjs'], log: '.e2e/logs/pwa.log',
    } },
  }],
} satisfies E2EConfig;
