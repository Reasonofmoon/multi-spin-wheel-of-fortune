import { expect, test } from './fixtures';

test('500-segment harness records actual frame intervals and paint time', async ({
  page,
}, testInfo) => {
  await page.goto('./perf/');
  await page.getByRole('button', { name: '5초 성능 측정 시작' }).click();
  const result = page.locator('[data-perf-result]');
  await expect(result).toBeVisible({ timeout: 10_000 });
  const raw = await result.getAttribute('data-perf-result');
  expect(raw).toBeTruthy();
  const metrics = JSON.parse(raw!) as {
    frames: number;
    averageMs: number;
    p95Ms: number;
    p95DrawMs: number;
    frameTimes: number[];
    drawTimes: number[];
    devicePixelRatio: number;
  };
  expect(metrics.frameTimes).toHaveLength(metrics.frames);
  expect(metrics.drawTimes.length).toBeGreaterThanOrEqual(metrics.frames);
  expect(metrics.p95DrawMs).toBeLessThanOrEqual(16.7);
  // RAF frame pacing belongs to the actual machine; raw intervals are preserved,
  // not replaced with synthetic 16.67 ms values or hidden behind a mocked clock.
  await testInfo.attach('500-segment-frame-times.json', {
    body: raw!,
    contentType: 'application/json',
  });
  console.info(
    JSON.stringify({
      project: testInfo.project.name,
      frames: metrics.frames,
      averageMs: metrics.averageMs,
      p95Ms: metrics.p95Ms,
      p95DrawMs: metrics.p95DrawMs,
      devicePixelRatio: metrics.devicePixelRatio,
    }),
  );
});
