import { expect, test } from "@playwright/test";

/** Smoke checks for the mobile layout (Pixel 7 viewport). */

test("landing and auth pages fit a phone screen", async ({ page }) => {
  for (const path of ["/", "/entrar", "/registar"]) {
    await page.goto(path);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow, path).toBeLessThanOrEqual(0);
  }
});

test("mobile dashboard shows the bottom navigation with a record button", async ({ page }) => {
  const email = `e2e-mobile-${Date.now()}@ouveisto.test`;
  await page.goto("/registar");
  await page.getByLabel("E-mail").fill(email);
  await page.getByLabel("Palavra-passe").fill("uma-palavra-passe-segura");
  await page.getByRole("button", { name: "Criar conta" }).click();
  await expect(page).toHaveURL(/\/painel$/);
  const nav = page.getByRole("navigation", { name: "Principal" }).last();
  await expect(nav.getByRole("link", { name: "Gravar" })).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});
