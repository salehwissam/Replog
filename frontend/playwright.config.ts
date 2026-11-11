import { defineConfig, devices } from '@playwright/test'

const externalBaseUrl = process.env.E2E_BASE_URL
const apiPort = process.env.REPLOG_API_PORT ?? '8000'
const webPort = process.env.REPLOG_WEB_PORT ?? '5173'
const python = process.env.REPLOG_PYTHON ?? '..\\backend\\.venv\\Scripts\\python.exe'

export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: externalBaseUrl ?? `http://localhost:${webPort}`,
    locale: 'pt-BR',
    timezoneId: 'America/Sao_Paulo',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'celular', use: { ...devices['Pixel 7'] } },
    { name: 'computador', use: { ...devices['Desktop Chrome'], viewport: { width: 1366, height: 860 } } },
  ],
  webServer: externalBaseUrl ? undefined : [
    {
      command: `${python} ..\\backend\\scripts\\run_e2e_server.py`,
      url: `http://127.0.0.1:${apiPort}/api/health`,
      reuseExistingServer: false,
      timeout: 60_000,
      env: { REPLOG_API_PORT: apiPort },
    },
    {
      command: `npx vite --port ${webPort} --strictPort`,
      url: `http://localhost:${webPort}`,
      env: { REPLOG_API_PORT: apiPort },
      reuseExistingServer: false,
      timeout: 60_000,
    },
  ],
})
