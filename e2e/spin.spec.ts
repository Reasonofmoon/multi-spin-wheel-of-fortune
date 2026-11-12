import { expect, test, installFixedEntropy } from './fixtures';
import { assertPointerMatches } from './geometry';
import { createHash } from 'node:crypto';

test('20 fixed-client-seed draws land under the pointer', async ({ page }) => {
  test.setTimeout(180_000);
  const browserMessages: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error' || message.type() === 'warning') {
      browserMessages.push(`${message.type()}: ${message.text()}`);
    }
  });
  page.on('pageerror', (error) => browserMessages.push(`pageerror: ${error.message}`));
  await installFixedEntropy(page);
  await page.goto('./');
  await expect(page.getByLabel('세션 커밋먼트')).toHaveText(
    createHash('sha256')
      .update(Uint8Array.from({ length: 32 }, (_, i) => i))
      .digest('hex'),
  );
  await page.getByLabel('참가자 시드 (수정 가능)').fill('fixed-e2e-client-seed-v1');

  const participantInput = page.getByRole('textbox', {
    name: '참가자 이름을 입력하세요',
  });
  const penaltyInput = page.getByRole('textbox', { name: '벌칙 또는 순번을 입력하세요' });
  for (let index = 0; index < 20; index += 1) {
    await participantInput.fill(`참가자-${index}`);
    await participantInput.press('Enter');
  }
  for (let index = 0; index < 7; index += 1) {
    await penaltyInput.fill(`벌칙-${index}`);
    await penaltyInput.press('Enter');
  }

  const spinButton = page.getByRole('button', { name: '룰렛 돌리기' });
  const resultStatus = page.getByRole('status');
  let previousParticipantAngle = 0;
  let previousPenaltyAngle = 0;
  for (let spin = 0; spin < 20; spin += 1) {
    const previousAnnouncement = await resultStatus.textContent();
    await spinButton.click();
    await expect(resultStatus).not.toHaveText(previousAnnouncement ?? '');

    const resultId = await resultStatus.getAttribute('data-result-participant-id');
    const announcement = (await resultStatus.textContent()) ?? '';
    expect(resultId, announcement).toBeTruthy();
    const participantAngle = await assertPointerMatches(
      page.getByRole('img', { name: /참가자 룰렛/ }),
      resultId!,
      announcement,
      true,
    );
    const penaltyId = await resultStatus.getAttribute('data-result-penalty-id');
    expect(penaltyId).toBeTruthy();
    const penaltyAngle = await assertPointerMatches(
      page.getByRole('img', { name: /벌칙 룰렛/ }),
      penaltyId!,
      announcement,
      false,
    );
    expect(participantAngle).toBeGreaterThan(previousParticipantAngle);
    expect(penaltyAngle).toBeGreaterThan(previousPenaltyAngle);
    previousParticipantAngle = participantAngle;
    previousPenaltyAngle = penaltyAngle;
    await expect(resultStatus).toHaveAttribute('data-draw-nonce', String((spin + 1) * 2));
    await expect(page.getByLabel('참가자 시드 (수정 가능)')).toBeDisabled();
    if (spin === 19) {
      // Exhaustion should disable drawing. Preserve the inherited enabled-state
      // assertion by also proving that adding one new identity does not resurrect
      // the twenty eliminated identities; then remove that temporary entry.
      await expect(participantInput).toBeEnabled();
      await expect(spinButton).toBeDisabled();
      await expect(page.getByRole('img', { name: /참가자 룰렛/ })).toHaveCount(0);
      await participantInput.fill('추가 검증 참가자');
      await participantInput.press('Enter');
      await expect(page.getByText('참가자 1명', { exact: false })).toBeVisible();
    }
    await expect(spinButton).toBeEnabled();
    if (spin === 19) {
      await page
        .getByRole('button', { name: '추가 검증 참가자 삭제', exact: true })
        .click();
      await expect(spinButton).toBeDisabled();
      await expect(resultStatus).toHaveAttribute('data-draw-nonce', '40');
    }
  }

  expect(browserMessages).toEqual([]);
  await expect(page.getByText('참가자 0명', { exact: false })).toBeVisible();
  const persisted = await page.evaluate(
    () => JSON.parse(localStorage.getItem('participants') || '[]') as string[],
  );
  expect(persisted).toHaveLength(20);
});
