import { expect, installFixedEntropy, test } from './fixtures';
import { assertPointerMatches } from './geometry';

test('reduced motion resolves within 300 ms without intermediate spin frames', async ({
  page,
}) => {
  await installFixedEntropy(page);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.addInitScript(() => {
    localStorage.setItem('participants', JSON.stringify(['가', '나', '다', '라']));
    localStorage.setItem('penalties', JSON.stringify(['P', 'Q', 'R']));
  });
  await page.goto('./');
  const spin = page.getByRole('button', { name: '룰렛 돌리기' });
  await expect(spin).toBeEnabled();
  const resolvedMs = await page.evaluate(async () => {
    const button = document.querySelector<HTMLButtonElement>(
      'button[class*="spinButton"]',
    );
    const status = document.querySelector<HTMLElement>('[data-result-participant-id]');
    if (!button || !status) throw new Error('The spin controls are absent.');
    const started = performance.now();
    button.click();
    await new Promise<void>((resolve, reject) => {
      const frame = (): void => {
        if (status.dataset.resultParticipantId) resolve();
        else if (performance.now() - started > 1_000)
          reject(new Error('Reduced-motion result did not resolve.'));
        else requestAnimationFrame(frame);
      };
      requestAnimationFrame(frame);
    });
    return performance.now() - started;
  });
  expect(resolvedMs).toBeLessThanOrEqual(300);
  const status = page.getByRole('status');
  const id = await status.getAttribute('data-result-participant-id');
  expect(id).toBeTruthy();
  await assertPointerMatches(
    page.getByRole('img', { name: /참가자 룰렛/ }),
    id!,
    'reduced-motion result',
    true,
  );
  const angles = await page
    .getByRole('img', { name: /참가자 룰렛/ })
    .evaluate(async (canvas) => {
      const observed: number[] = [];
      for (let count = 0; count < 8; count += 1) {
        await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
        observed.push(Number((canvas as HTMLCanvasElement).dataset.rotationDeg));
      }
      return observed;
    });
  expect(new Set(angles).size).toBe(1);
  await expect(spin).toBeEnabled();
});

test('double-click and Space spam consume exactly one pair and cannot edit in flight', async ({
  page,
}) => {
  await installFixedEntropy(page);
  await page.addInitScript(() => {
    localStorage.setItem('participants', JSON.stringify(['A', 'B', 'C']));
    localStorage.setItem('penalties', JSON.stringify(['P', 'Q']));
  });
  await page.goto('./');
  const spin = page.getByRole('button', { name: '룰렛 돌리기' });
  await expect(spin).toBeEnabled();
  await spin.evaluate((button) => {
    for (let count = 0; count < 30; count += 1) (button as HTMLButtonElement).click();
  });
  for (let count = 0; count < 10; count += 1) await page.keyboard.press('Space');
  await expect(
    page.getByRole('textbox', { name: '참가자 이름을 입력하세요' }),
  ).toBeDisabled();
  await expect(page.getByRole('button', { name: 'A 삭제', exact: true })).toBeDisabled();
  await expect(page.getByRole('status')).toHaveAttribute('data-draw-nonce', '2');
  await expect(spin).toBeEnabled({ timeout: 10_000 });
  await expect(
    page.getByRole('list', { name: '추첨 결과 기록' }).getByRole('listitem'),
  ).toHaveCount(1);
  await expect(page.getByRole('status')).toHaveAttribute('data-draw-nonce', '2');
  expect(
    await page.evaluate(
      () => JSON.parse(localStorage.getItem('participants') || '[]') as string[],
    ),
  ).toHaveLength(3);
});

test('an oversized legacy roster is preserved and does not crash the renderer', async ({
  page,
}) => {
  await page.addInitScript(() => {
    localStorage.setItem(
      'participants',
      JSON.stringify(Array.from({ length: 501 }, (_, i) => `항목 ${i}`)),
    );
    localStorage.setItem('penalties', JSON.stringify(['P']));
  });
  await page.goto('./');
  await expect(page.getByRole('heading', { name: '다중 회전 룰렛' })).toBeVisible();
  await expect(page.getByRole('button', { name: '룰렛 돌리기' })).toBeDisabled();
  await expect(
    page.getByText('모든 기존 항목을 보존했습니다.', { exact: false }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => JSON.parse(localStorage.getItem('participants') || '[]') as string[],
    ),
  ).toHaveLength(501);
});

test('corrupt legacy JSON is not overwritten during initial recovery', async ({
  page,
}) => {
  await page.addInitScript(() => localStorage.setItem('participants', '{'));
  await page.goto('./');
  await expect(page.getByRole('heading', { name: '다중 회전 룰렛' })).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem('participants'))).toBe('{');
});
