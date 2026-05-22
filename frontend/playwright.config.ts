import { defineConfig, devices } from '@playwright/test';

/**
 * Configuração Playwright para o P2P.
 *
 * - Roda contra o Vite dev (5173) ou contra build estático.
 * - DEMO_MODE_ENABLED=true no backend libera /auth/demo-users e demo-login,
 *   o que evita ter que cadastrar usuário LDAP só pra E2E.
 * - Em CI subimos backend + frontend via `webServer`.
 */
export default defineConfig({
  testDir: './tests/e2e',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false, // estado compartilhado em DB
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:5173',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    locale: 'pt-BR',
    timezoneId: 'America/Sao_Paulo',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
  // Em CI o E2E precisa do backend + front rodando. Localmente, assume
  // que o usuário já tem `npm run dev` aberto (mais rápido pra iterar).
  webServer: process.env.CI
    ? [
        {
          command: 'cd ../backend && DEMO_MODE_ENABLED=true node dist/src/main.js',
          port: 3000,
          reuseExistingServer: false,
          timeout: 120_000,
        },
        {
          command: 'npm run dev',
          port: 5173,
          reuseExistingServer: false,
          timeout: 60_000,
        },
      ]
    : undefined,
});
