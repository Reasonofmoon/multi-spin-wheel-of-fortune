import { expect, test } from './fixtures';

test('GitHub Pages base path serves the Korean app shell', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error' || message.type() === 'warning') {
      errors.push(`${message.type()}: ${message.text()}`);
    }
  });
  page.on('pageerror', (error) => errors.push(error.message));

  await page.goto('./');
  await expect(page.getByRole('heading', { name: '다중 회전 룰렛' })).toBeVisible();
  await expect(
    page.getByRole('textbox', { name: '참가자 이름을 입력하세요' }),
  ).toBeVisible();
  expect(errors).toEqual([]);
});
