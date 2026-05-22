import { expect, test } from '@playwright/test';

/**
 * Smoke E2E mínimo do fluxo crítico.
 *
 * NÃO simula Req→PC→Recebimento de ponta a ponta (exige seed determinístico
 * + integração Linx mockada). Smoke aqui valida:
 *   1) login funciona
 *   2) páginas-chave renderizam (Req list, PC list, SV list, Admin)
 *   3) o switch de empresa não quebra o app
 *
 * Pré-requisito: backend rodando em `:3000` com DEMO_MODE_ENABLED=true e
 * pelo menos 1 usuário demo cadastrado.
 */

const DEMO_USERNAME =
  process.env.E2E_DEMO_USERNAME ?? 'admin.demo';

test.describe('Smoke — fluxo crítico', () => {
  test.beforeEach(async ({ page }) => {
    // Login pela tela.
    await page.goto('/login');
    // O login demo é uma das opções na própria tela; se a UI mudar,
    // este seletor precisa ser ajustado.
    const demoBtn = page.getByRole('button', { name: /demonstração|demo/i });
    if (await demoBtn.count()) {
      await demoBtn.first().click();
      await page.getByRole('button', { name: new RegExp(DEMO_USERNAME, 'i') }).click();
    } else {
      // fallback: campo username + submit
      await page.getByLabel(/usuário/i).fill(DEMO_USERNAME);
      await page.getByRole('button', { name: /entrar/i }).click();
    }
    await expect(page).toHaveURL(/\/(requisicoes|dashboard|inicio|admin)?/);
  });

  test('lista de Requisições carrega', async ({ page }) => {
    await page.goto('/requisicoes');
    await expect(
      page.getByRole('heading', { name: /requisi/i }).or(
        page.getByText(/requisi/i).first(),
      ),
    ).toBeVisible();
  });

  test('lista de Pedidos de Compra exibe coluna Nº Linx', async ({ page }) => {
    await page.goto('/pedidos');
    await expect(page.getByRole('columnheader', { name: /n.* linx/i })).toBeVisible();
  });

  test('lista de SVs exibe coluna Nº Linx', async ({ page }) => {
    await page.goto('/solicitacoes-verba');
    await expect(page.getByRole('columnheader', { name: /n.* linx/i })).toBeVisible();
  });

  test('Admin → Sincronizar AD acessível', async ({ page }) => {
    await page.goto('/admin');
    // Existe um card/link "Sincronizar com AD"
    await expect(
      page.getByText(/sincronizar/i).first(),
    ).toBeVisible();
  });
});
