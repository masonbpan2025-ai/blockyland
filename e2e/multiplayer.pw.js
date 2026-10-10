import { test, expect } from '@playwright/test';
import { SERVER_PRESETS } from '../src/multiplayer/serverDirectory.js';

test('server directory selects compatible addresses and fits desktop and mobile', async ({ page }) => {
  // Allow the first page to finish Vite's cold dependency optimization.
  test.setTimeout(120000);
  await page.goto('/multiplayer.html', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#multiplayer-status')).toContainText('Multiplayer ready', { timeout: 100000 });
  await expect(page.locator('#server-name')).toHaveValue('ArchMC');
  await expect(page.getByText('Hypixel', { exact: true })).toHaveCount(0);
  await expect(page.getByText('Herobrine', { exact: true })).toHaveCount(0);
  for (const preset of SERVER_PRESETS) {
    const card = page.locator(`#${preset.id}`);
    await expect(card).toContainText(preset.browserAddress || preset.address);
    await card.click();
    await expect(card).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('#server-address')).toHaveValue(preset.address);
    await expect(page.locator('#server-version')).toHaveValue(preset.version);
  }
  await page.locator('#archmc-preset').click();
  await page.screenshot({ path: 'test-results/multiplayer-desktop.png', fullPage: true });
  await page.setViewportSize({ width: 375, height: 812 });
  await expect(page.locator('#connect-server')).toBeVisible();
  await expect(page.locator('#connect-server')).toBeInViewport();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole('link', { name: 'Back to main menu' }).scrollIntoViewIfNeeded();
  await expect(page.getByRole('link', { name: 'Back to main menu' })).toBeInViewport();
  await expect(page.locator('#connect-server')).toBeInViewport();
  await page.screenshot({ path: 'test-results/multiplayer-mobile.png', fullPage: true });
});

test('initial menu hides Multiplayer while the direct URL remains accessible', async ({ page }) => {
  await page.route('**/src/main.js', route => route.fulfill({ contentType: 'text/javascript', body: '// Local game initialization deliberately unavailable in this navigation test.' }));
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('button', { name: 'Multiplayer', exact: true })).toHaveCount(0);
  await page.goto('/multiplayer.html', { waitUntil: 'domcontentloaded' });
  await expect(page).toHaveURL(/multiplayer\.html$/);
  await expect(page.getByRole('heading', { name: 'Multiplayer' })).toBeVisible();
  await expect(page.locator('#multiplayer-status')).toContainText('Multiplayer ready');
});

test('PikaNetwork launch loads self-hosted client with selected server and offline player name', async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/multiplayer.html');
  await expect(page.locator('#connect-server')).toBeEnabled();
  await expect(page.getByText('Hypixel', { exact: true })).toHaveCount(0);
  await page.locator('#pika-preset').click();
  await page.locator('#offline-username').fill('MyPlayer');
  await page.getByRole('button', { name: 'Connect', exact: true }).click();
  await expect(page).toHaveURL(/127\.0\.0\.1:3011\/\?ip=top.pika.host/);
  await expect(page.getByText('Account Override', { exact: true })).toBeVisible({ timeout: 45000 });
  await expect(page.locator('option', { hasText: 'Any other MS account' })).toHaveCount(1);
  await expect(page.getByRole('textbox', { name: 'Defaults to IP' })).toHaveValue('PikaNetwork');
  await expect(page.locator('input:visible').first()).toHaveValue('top.pika.host');
  await expect(page.getByRole('textbox', { name: 'MyPlayer', exact: true })).toHaveValue('MyPlayer');
  await expect(page.getByRole('combobox', { name: 'Account Override' })).toHaveValue('-1');
  await page.screenshot({ path: 'test-results/multiplayer-client.png' });
  expect(errors).toEqual([]);
});

test('connection check shows backend result and invalid addresses stay on the page', async ({ page }) => {
  await page.route('**/api/multiplayer/status?**', route => route.fulfill({ json: { version: { name: 'Fixture Java' }, players: { online: 7 } } }));
  await page.goto('/multiplayer.html');
  await expect(page.locator('#connect-server')).toBeEnabled();
  await page.getByRole('button', { name: 'Check server' }).click();
  await expect(page.locator('#multiplayer-status')).toContainText('7 players online');
  await page.locator('#server-address').fill('https://invalid.example');
  await page.getByRole('button', { name: 'Connect', exact: true }).click();
  await expect(page.locator('#multiplayer-status')).toContainText('Enter a server hostname');
  await expect(page).toHaveURL(/multiplayer\.html$/);
  await page.screenshot({ path: 'test-results/multiplayer-form.png' });
});
