import { expect, test } from '@playwright/test';

type SegmentGeometry = {
  id: string;
  label: string;
  weight: number;
  color: string;
};

test('20 fixed-client-seed draws land under the pointer', async ({ page }) => {
  test.setTimeout(180_000);
  const browserMessages: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error' || message.type() === 'warning') {
      browserMessages.push(`${message.type()}: ${message.text()}`);
    }
  });
  page.on('pageerror', (error) => browserMessages.push(`pageerror: ${error.message}`));
  await page.goto('./');
  await expect(page.getByLabel('세션 커밋먼트')).toContainText(/[0-9a-f]{64}/i);
  await page.getByLabel('참가자 시드 (수정 가능)').fill('fixed-e2e-client-seed-v1');

  const participantInput = page.getByRole('textbox', {
    name: '참가자 이름을 입력하세요',
  });
  const penaltyInput = page.getByRole('textbox', { name: '벌칙 또는 순번을 입력하세요' });
  for (let index = 0; index < 20; index += 1) {
    await participantInput.fill(`참가자-${index}`);
    await participantInput.press('Enter');
  }
  await penaltyInput.fill('벌칙-고정');
  await penaltyInput.press('Enter');

  const spinButton = page.getByRole('button', { name: '룰렛 돌리기' });
  const resultStatus = page.getByRole('status');
  for (let spin = 0; spin < 20; spin += 1) {
    const previousAnnouncement = await resultStatus.textContent();
    await spinButton.click();
    await expect(resultStatus).not.toHaveText(previousAnnouncement ?? '');

    const resultId = await resultStatus.getAttribute('data-result-participant-id');
    const announcement = (await resultStatus.textContent()) ?? '';
    const canvas = page.getByRole('img', { name: /참가자 룰렛/ });
    const sample = await canvas.evaluate((element) => {
      const target = element as HTMLCanvasElement;
      const context = target.getContext('2d');
      if (!context) throw new Error('Canvas 2D is unavailable.');
      const previous = JSON.parse(
        target.dataset.previousSegments ?? '[]',
      ) as SegmentGeometry[];
      const current = JSON.parse(
        target.dataset.wheelSegments ?? '[]',
      ) as SegmentGeometry[];
      const rotation = Number(target.dataset.rotationDeg);
      const progress = Number(target.dataset.transitionProgress);
      const pixel = context.getImageData(
        Math.floor(target.width / 2),
        Math.floor(target.height * 0.3),
        1,
        1,
      ).data;
      return {
        previous,
        current,
        rotation,
        progress,
        pixel: [pixel[0], pixel[1], pixel[2]],
      };
    });

    expect(resultId, announcement).toBeTruthy();
    expect(sample.progress).toBeLessThan(0.12);
    const segments = sample.previous.length > 0 ? sample.previous : sample.current;
    const totalWeight = segments.reduce((sum, segment) => sum + segment.weight, 0);
    const remainder = (270 - sample.rotation) % 360;
    const localAngle = remainder < 0 ? remainder + 360 : remainder;
    const weightPosition = (localAngle * totalWeight) / 360;
    let cumulativeWeight = 0;
    let underPointer: SegmentGeometry | undefined;
    for (const segment of segments) {
      cumulativeWeight += segment.weight;
      if (weightPosition < cumulativeWeight) {
        underPointer = segment;
        break;
      }
    }

    expect(underPointer?.id, announcement).toBe(resultId);
    const colorChannels = underPointer?.color
      .match(/[0-9a-f]{2}/gi)
      ?.map((channel) => Number.parseInt(channel, 16));
    expect(colorChannels).toHaveLength(3);
    for (let channel = 0; channel < 3; channel += 1) {
      expect(
        Math.abs(sample.pixel[channel]! - colorChannels![channel]!),
      ).toBeLessThanOrEqual(30);
    }
    await expect(spinButton).toBeEnabled();
  }

  expect(browserMessages).toEqual([]);
  await expect(page.getByText('참가자 0명')).toBeVisible();
});
