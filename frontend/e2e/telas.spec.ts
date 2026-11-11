import { expect, test } from '@playwright/test'

import { waitForToken } from './mailpit'

const OUT = process.env.SCREENSHOTS
const PASSWORD = 'Treino-Pesado-2026'

test.skip(!OUT, 'defina SCREENSHOTS para gerar as capturas')

test('capturas das telas principais', async ({ page }, info) => {
  test.setTimeout(120_000)
  const shot = async (name: string, wait = 1400) => {
    await page.waitForTimeout(wait)
    await page.screenshot({ path: `${OUT}/${info.project.name}-${name}.png`, fullPage: false })
  }
  const email = `visual.${Date.now()}@exemplo.com`

  await page.goto('/entrar')
  await shot('01-entrar', 2200)

  await page.goto('/cadastrar')
  await page.getByLabel('Nome').fill('Ana Souza')
  await page.getByLabel('E-mail').fill(email)
  await page.getByLabel('Senha', { exact: true }).fill(PASSWORD)
  await page.getByLabel('Confirme a senha').fill(PASSWORD)
  await page.getByRole('button', { name: 'Criar conta' }).click()
  const token = await waitForToken(email, 'Confirme seu e-mail')
  await page.goto(`/confirmar-email#token=${token}`)
  await page.getByLabel('Senha do cadastro').fill(PASSWORD)
  await page.getByRole('button', { name: 'Confirmar e-mail' }).click()
  await page.goto('/entrar')
  await page.getByLabel('E-mail').fill(email)
  await page.getByLabel('Senha', { exact: true }).fill(PASSWORD)
  await page.getByRole('button', { name: 'Entrar' }).click()
  await expect(page).toHaveURL(/\/boas-vindas$/)
  await shot('01b-boas-vindas')
  await page.getByRole('link', { name: 'Pular por agora' }).click()
  await expect(page.getByRole('heading', { name: /, Ana$/ })).toBeVisible()
  await shot('02-inicio-vazio')
  await page.goto('/estatisticas')
  await shot('02b-estatisticas-vazio', 2000)

  await page.goto('/programas')
  await shot('03-programas')
  await page.getByRole('button', { name: /ABC clássico/ }).click()
  await shot('04-programa-detalhe', 900)
  await page.getByRole('button', { name: 'Usar este programa' }).click()
  await expect(page.getByRole('heading', { name: 'Treinar' })).toBeVisible()
  await shot('05-treinar')

  await page.getByRole('button', { name: /Peito, ombros e tríceps/ }).click()
  await expect(page.getByText('Treino em andamento')).toBeVisible()
  await page.getByLabel('Carga', { exact: true }).fill('60')
  await page.getByLabel('Repetições', { exact: true }).fill('10')
  await shot('06-treino')
  await page.getByRole('button', { name: 'Registrar série' }).click()
  await page.getByLabel('Carga', { exact: true }).fill('80')
  await page.getByLabel('Repetições', { exact: true }).fill('6')
  await page.getByRole('button', { name: 'Registrar série' }).click()
  await shot('07-recorde', 900)
  await page.waitForTimeout(3500)
  await page.mouse.wheel(0, 700)
  await shot('08-treino-series', 800)

  await page.goto('/')
  await shot('09-inicio-com-treino', 2200)
  await page.goto('/recordes')
  await shot('10-recordes')
  await page.goto('/historico')
  await shot('11-historico')
  await page.goto('/estatisticas')
  await shot('12-estatisticas', 2000)
})
