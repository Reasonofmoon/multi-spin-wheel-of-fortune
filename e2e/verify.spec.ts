import { expect, test } from '@playwright/test';

test('the standalone verifier route loads without the roulette app state', async ({
  page,
}) => {
  const browserMessages: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error' || message.type() === 'warning') {
      browserMessages.push(`${message.type()}: ${message.text()}`);
    }
  });
  page.on('pageerror', (error) => browserMessages.push(`pageerror: ${error.message}`));
  await page.goto('./verify/');

  await expect(page.getByRole('heading', { name: '추첨 검증' })).toBeVisible();
  await expect(page.getByLabel('세션 로그 JSON')).toBeVisible();
  await expect(page.getByRole('button', { name: '검증하기' })).toBeVisible();
  expect(browserMessages).toEqual([]);
});
