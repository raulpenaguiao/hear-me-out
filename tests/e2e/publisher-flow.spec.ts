import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { makeWav } from "../helpers/audio";

/**
 * Full journey: register → login → create channel → upload + record →
 * publish → listen publicly without an account → RSS → rotate tokens.
 */

test.describe.configure({ mode: "serial" });

const email = `e2e-${Date.now()}@ouveisto.test`;
const password = "uma-palavra-passe-segura";
let channelUrl = "";
let webUrl = "";
let rssUrl = "";

const fixtureDir = mkdtempSync(path.join(tmpdir(), "ouve-isto-e2e-"));
const wavPath = path.join(fixtureDir, "historia.wav");
writeFileSync(wavPath, makeWav(2));

async function login(page: Page) {
  await page.goto("/entrar");
  await page.getByLabel("E-mail").fill(email);
  await page.getByLabel("Palavra-passe").fill(password);
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page).toHaveURL(/\/painel$/);
}

test("redirects anonymous visitors away from the dashboard", async ({ page }) => {
  await page.goto("/painel/canais");
  await expect(page).toHaveURL(/\/entrar\?next=%2Fpainel%2Fcanais/);
});

test("publisher can register", async ({ page }) => {
  await page.goto("/registar");
  await page.getByLabel("Como te chamas? (opcional)").fill("Rita");
  await page.getByLabel("E-mail").fill(email);
  await page.getByLabel("Palavra-passe").fill(password);
  await page.getByRole("button", { name: "Criar conta" }).click();
  // Local Supabase has e-mail confirmation disabled, so we land in the dashboard.
  await expect(page).toHaveURL(/\/painel$/);
  await expect(page.getByRole("heading", { name: "Olá, Rita!" })).toBeVisible();
});

test("publisher can log out and log in again", async ({ page }) => {
  await login(page);
  await page.goto("/painel/conta");
  await page.getByRole("button", { name: "Terminar sessão" }).click();
  await expect(page).toHaveURL(/\/entrar$/);
  await page.goto("/painel");
  await expect(page).toHaveURL(/\/entrar/);

  await page.getByLabel("E-mail").fill(email);
  await page.getByLabel("Palavra-passe").fill("errada-errada");
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page.getByText("E-mail ou palavra-passe incorretos.")).toBeVisible();
  await login(page);
});

test("publisher can create a channel and see its secret links", async ({ page }) => {
  await login(page);
  await page.goto("/painel/canais/novo");
  await page.getByLabel("Nome do canal").fill("Peripécias");
  await page.getByLabel("Descrição").fill("Histórias & desabafos <ao> fim do dia");
  await page.getByRole("button", { name: "Criar canal" }).click();
  await expect(page).toHaveURL(/\/painel\/canais\/[0-9a-f-]+\?novo=1$/);
  channelUrl = page.url().split("?")[0]!;
  webUrl = (await page.getByTestId("web-url").textContent())!.trim();
  rssUrl = (await page.getByTestId("rss-url").textContent())!.trim();
  expect(webUrl).toMatch(/\/c\/[A-Za-z0-9_-]{43}$/);
  expect(rssUrl).toMatch(/\/rss\/[A-Za-z0-9_-]{43}$/);
});

test("publisher can upload an audio file and publish it", async ({ page }) => {
  await login(page);
  await page.goto(`${channelUrl}`);
  await page.getByRole("link", { name: "Novo episódio" }).click();
  await page.getByRole("tab", { name: "Carregar ficheiro" }).click();
  await page.getByTestId("audio-file-input").setInputFiles(wavPath);
  await expect(page.getByTestId("audio-preview")).toContainText("historia.wav");
  await page.getByLabel("Título").fill("A história do comboio");
  await page.getByLabel("Descrição (opcional)").fill("Perdi o comboio & ganhei um amigo.");
  await page.getByRole("button", { name: "Publicar" }).click();
  await expect(page).toHaveURL(/\/painel\/episodios\/[0-9a-f-]+\?publicado=1$/);
  await expect(page.getByText("Publicado!")).toBeVisible();
  await expect(page.getByTestId("owner-audio")).toBeVisible();
});

test("publisher can record audio in the browser and publish it", async ({ page }) => {
  await login(page);
  await page.goto("/painel/gravar");
  await page.getByRole("button", { name: "Começar a gravar" }).click();
  await expect(page.getByText("A gravar…")).toBeVisible();
  await expect(page.getByTestId("recording-timer")).toHaveText("0:02", { timeout: 10_000 });
  await page.getByRole("button", { name: "Parar gravação" }).click();
  await expect(page.getByTestId("audio-preview")).toBeVisible();
  await page.getByLabel("Título").fill("Uma gravação rápida");
  await page.getByRole("button", { name: "Publicar" }).click();
  await expect(page).toHaveURL(/\/painel\/episodios\/[0-9a-f-]+\?publicado=1$/);
});

test("a draft is saved but not visible to listeners", async ({ page }) => {
  await login(page);
  await page.goto("/painel/gravar");
  await page.getByRole("tab", { name: "Carregar ficheiro" }).click();
  await page.getByTestId("audio-file-input").setInputFiles(wavPath);
  await page.getByLabel("Título").fill("Rascunho secreto");
  await page.getByRole("button", { name: "Guardar rascunho" }).click();
  await expect(page).toHaveURL(/\?guardado=1$/);
  await expect(page.getByText("Rascunho guardado")).toBeVisible();
});

test("dashboard shows counts and recent activity", async ({ page }) => {
  await login(page);
  await expect(page.getByTestId("stat-channels")).toHaveText("1");
  await expect(page.getByTestId("stat-published")).toHaveText("2");
  await expect(page.getByText("Rascunho secreto")).toBeVisible();
});

test("anyone with the link can listen without an account", async ({ browser }) => {
  const context = await browser.newContext(); // no cookies, no session
  const page = await context.newPage();
  const response = await page.goto(webUrl);
  expect(response?.status()).toBe(200);
  await expect(page.getByRole("heading", { name: "Peripécias" })).toBeVisible();
  await expect(page.getByText("Histórias & desabafos <ao> fim do dia")).toBeVisible();
  const episodes = page.getByTestId("public-episode");
  await expect(episodes).toHaveCount(2);
  await expect(page.getByText("Rascunho secreto")).toHaveCount(0);
  // Newest first.
  await expect(episodes.first()).toContainText("Uma gravação rápida");
  await expect(page.getByTestId("public-rss-url")).toHaveText(rssUrl);
  await expect(page.getByText("Copia este link RSS")).toBeVisible();

  const robots = await page.locator('meta[name="robots"]').getAttribute("content");
  expect(robots).toContain("noindex");

  // The audio element source supports range requests.
  const src = await episodes.nth(1).locator("audio source").getAttribute("src");
  const head = await context.request.head(src!);
  expect(head.status()).toBe(200);
  expect(head.headers()["accept-ranges"]).toBe("bytes");
  const ranged = await context.request.get(src!, { headers: { Range: "bytes=0-11" } });
  expect(ranged.status()).toBe(206);
  expect(ranged.headers()["content-range"]).toMatch(/^bytes 0-11\/\d+$/);
  expect((await ranged.body()).subarray(0, 4).toString()).toBe("RIFF");
  await context.close();
});

test("the RSS feed is valid and lists published episodes", async ({ request }) => {
  const res = await request.get(rssUrl);
  expect(res.status()).toBe(200);
  expect(res.headers()["content-type"]).toBe("application/rss+xml; charset=utf-8");
  const xml = await res.text();
  expect(xml).toContain('<rss version="2.0"');
  expect(xml).toContain("<title>Peripécias</title>");
  expect(xml).toContain("<title>A história do comboio</title>");
  expect(xml).toContain("<title>Uma gravação rápida</title>");
  expect(xml).not.toContain("Rascunho secreto");
  expect(xml).toContain("Perdi o comboio &amp; ganhei um amigo.");
  const enclosures = [...xml.matchAll(/<enclosure url="([^"]+)" length="(\d+)" type="([^"]+)"\/>/g)];
  expect(enclosures).toHaveLength(2);
  for (const [, url, length, type] of enclosures) {
    const audio = await request.get(url!);
    expect(audio.status()).toBe(200);
    expect(audio.headers()["content-type"]).toBe(type);
    expect(audio.headers()["content-length"]).toBe(length);
  }
  const etag = res.headers()["etag"]!;
  const cached = await request.get(rssUrl, { headers: { "If-None-Match": etag } });
  expect(cached.status()).toBe(304);
});

test("invalid tokens are rejected", async ({ page, request }) => {
  const fake = "A".repeat(43);
  expect((await request.get(`/rss/${fake}`)).status()).toBe(404);
  expect((await request.get(`/rss/not-a-token`)).status()).toBe(404);
  const res = await page.goto(`/c/${fake}`);
  expect(res?.status()).toBe(404);
  await expect(page.getByText("Este link não está disponível")).toBeVisible();
});

test("rotating tokens revokes the previous links immediately", async ({ page, request }) => {
  const oldWeb = webUrl;
  const oldRss = rssUrl;
  const feed = await (await request.get(oldRss)).text();
  const oldEnclosure = /<enclosure url="([^"]+)"/.exec(feed)![1]!;

  await login(page);
  await page.goto(channelUrl);
  await page.getByRole("button", { name: "Novos links (ambos)" }).click();
  await page.getByRole("button", { name: "Sim, gerar novo link" }).click();
  await expect(page.getByText("Novos links gerados.")).toBeVisible();
  await page.reload();
  webUrl = (await page.getByTestId("web-url").textContent())!.trim();
  rssUrl = (await page.getByTestId("rss-url").textContent())!.trim();
  expect(webUrl).not.toBe(oldWeb);
  expect(rssUrl).not.toBe(oldRss);

  expect((await request.get(oldRss)).status()).toBe(404);
  expect((await request.get(oldEnclosure)).status()).toBe(404);
  expect((await request.get(oldWeb)).status()).toBe(404);
  expect((await request.get(rssUrl)).status()).toBe(200);
  expect((await request.get(webUrl)).status()).toBe(200);
});

test("unpublishing removes an episode from the feed and page", async ({ page, request }) => {
  await login(page);
  await page.goto(channelUrl);
  await page.getByRole("link", { name: /A história do comboio/ }).click();
  await page.getByRole("button", { name: "Despublicar" }).click();
  await expect(page.getByText("Episódio despublicado")).toBeVisible();
  const xml = await (await request.get(rssUrl)).text();
  expect(xml).not.toContain("A história do comboio");
  expect(xml).toContain("Uma gravação rápida");
});
