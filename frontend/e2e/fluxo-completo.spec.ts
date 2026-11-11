import { expect, test } from '@playwright/test'

import { waitForToken } from './mailpit'

const PASSWORD = 'Treino-Pesado-2026'

test('fluxo completo: cadastro → treino → recordes → histórico → sair', async ({ page, context }, info) => {
  const email = `ana.${info.project.name}.${Date.now()}@exemplo.com`

  await page.goto('/cadastrar')
  await page.getByLabel('Nome').fill('Ana Souza')
  await page.getByLabel('E-mail').fill(email)
  await page.getByLabel('Senha', { exact: true }).fill(PASSWORD)
  await page.getByLabel('Confirme a senha').fill(PASSWORD)
  await page.getByRole('button', { name: 'Criar conta' }).click()
  await expect(page.getByRole('heading', { name: 'Confira seu e-mail' })).toBeVisible()

  const token = await waitForToken(email, 'Confirme seu e-mail')
  await page.goto(`/confirmar-email#token=${token}`)
  await expect(page).toHaveURL(/\/confirmar-email$/)
  await page.getByLabel('Senha do cadastro').fill(PASSWORD)
  await page.getByRole('button', { name: 'Confirmar e-mail' }).click()
  await expect(page.getByText('E-mail confirmado!')).toBeVisible()

  await page.goto('/entrar')
  await page.getByLabel('E-mail').fill(email)
  await page.getByLabel('Senha', { exact: true }).fill(PASSWORD)
  await page.getByRole('button', { name: 'Entrar' }).click()
  await expect(page).toHaveURL(/\/boas-vindas$/)
  await page.getByRole('link', { name: 'Pular por agora' }).click()
  await expect(page.getByRole('heading', { name: /, Ana$/ })).toBeVisible()

  const session = (await context.cookies()).find((c) => c.name.endsWith('replog_session'))
  if (session?.name.startsWith('__Host-')) expect(session.secure).toBe(true)
  expect(session?.httpOnly).toBe(true)
  expect(session?.sameSite).toBe('Lax')
  const storage = await page.evaluate(() => JSON.stringify(localStorage))
  expect(storage).not.toContain(session!.value)

  await page.goto('/divisoes')
  await page.getByRole('button', { name: /Criar Treino A/ }).click()
  await page.getByLabel('Nome', { exact: true }).fill('Peito e tríceps')
  await page.getByRole('button', { name: 'Adicionar exercício' }).click()
  await page.getByLabel('Buscar exercício').fill('supino reto com barra')
  await page.getByRole('button', { name: /^Supino reto com barra/ }).click()
  await page.getByRole('button', { name: 'Salvar divisão' }).click()
  await expect(page.getByText('Peito e tríceps')).toBeVisible()

  await page.goto('/treino')
  await page.getByRole('button', { name: /Peito e tríceps/ }).click()
  await expect(page.getByText('Treino em andamento')).toBeVisible()

  const carga = page.getByLabel('Carga', { exact: true })
  const reps = page.getByLabel('Repetições', { exact: true })
  await carga.fill('60')
  await reps.fill('10')
  await expect(page.getByRole('img', { name: 'Por lado: 20 kg' })).toBeVisible()
  await page.getByRole('button', { name: 'Registrar série' }).click()
  await expect(page.getByLabel('Série 1', { exact: true })).toBeVisible()
  await expect(page.getByText('1 série ·')).toBeVisible()
  await expect(page.getByText('Descansando')).toBeVisible()

  await carga.fill('70')
  await reps.fill('8')
  await page.getByRole('button', { name: 'Registrar série' }).click()
  await expect(page.getByText('Novo recorde pessoal!')).toBeVisible()
  await expect(page.getByLabel('Série 2', { exact: true })).toBeVisible()

  await page.getByRole('button', { name: 'Finalizar', exact: true }).click()
  await page.getByRole('button', { name: 'Finalizar treino' }).click()
  await expect(page).toHaveURL(/\/historico\/\d+$/)
  await expect(page.getByRole('heading', { name: 'Recordes neste treino' })).toBeVisible()
  await expect(page.getByRole('heading', { name: /Treino A — Peito e tríceps/ })).toBeVisible()

  await page.goto('/historico')
  await expect(page.getByText(/Treino A — Peito e tríceps/)).toBeVisible()

  await page.goto('/recordes')
  await expect(page.getByRole('heading', { name: 'Supino reto com barra' })).toBeVisible()
  await page.goto('/estatisticas')
  await expect(page.getByRole('heading', { name: 'Séries por semana' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Desempenho por exercício' })).toBeVisible()

  await page.goto('/mais')
  await page.getByRole('main').getByRole('button', { name: 'Sair' }).click()
  await expect(page.getByRole('heading', { name: 'Entrar' })).toBeVisible()
  await page.goto('/historico')
  await expect(page.getByRole('heading', { name: 'Entrar' })).toBeVisible()
})

test('nenhum texto da interface aparece em inglês nas telas públicas', async ({ page }) => {
  for (const route of ['/entrar', '/cadastrar', '/esqueci-senha', '/pagina-que-nao-existe']) {
    await page.goto(route)
    const text = (await page.locator('body').innerText()).toLowerCase()
    for (const word of ['password', 'sign in', 'login', 'submit', 'loading', 'error', 'not found']) {
      expect(text, `${route} contém "${word}"`).not.toContain(word)
    }
  }
})

test('a página não rola na horizontal no celular', async ({ page }, info) => {
  test.skip(info.project.name !== 'celular', 'só no celular')
  for (const route of ['/entrar', '/cadastrar']) {
    await page.goto(route)
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
    expect(overflow, route).toBeLessThanOrEqual(0)
  }
})
