import { expect, test as base } from '@playwright/test';
import type { Page } from '@playwright/test';

export const test = base.extend<{ runtimeMessages: string[] }>({
  runtimeMessages: [
    async ({ context }, use) => {
      const messages: string[] = [];
      const listen = (page: Page): void => {
        page.on('console', (message) => {
          if (message.type() === 'error' || message.type() === 'warning') {
            messages.push(`${message.type()}: ${message.text()}`);
          }
        });
        page.on('pageerror', (error) => messages.push(`pageerror: ${error.message}`));
      };
      context.pages().forEach(listen);
      context.on('page', listen);
      await use(messages);
      expect(
        messages,
        'No console errors/warnings or uncaught browser exceptions',
      ).toEqual([]);
    },
    { auto: true },
  ],
});

export { expect };

/** Deterministic test entropy input only; HMAC, sampler, solver and Canvas are real. */
export async function installFixedEntropy(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const original = crypto.getRandomValues.bind(crypto);
    let seedCalls = 0;
    crypto.getRandomValues = function <T extends ArrayBufferView | null>(array: T): T {
      if (array instanceof Uint8Array && array.byteLength === 32) {
        const base = (seedCalls % 2) * 128 + Math.floor(seedCalls / 2);
        for (let index = 0; index < array.length; index += 1)
          array[index] = (base + index) % 256;
        seedCalls += 1;
      } else {
        // Keep UUID entropy cryptographic; only the two 32-byte seed inputs are fixed.
        original(array);
      }
      return array;
    };
  });
}
