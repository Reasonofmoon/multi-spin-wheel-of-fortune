import { createHash, createHmac, webcrypto } from 'node:crypto';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  animationFractionFromHmac,
  createFairnessSession,
  createHmacSigner,
  drawSegment,
  sampleUnbiasedInteger,
  verifySessionLog,
} from './fairness';
import type { Segment } from './segments';

const fixedServerSeed =
  '000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f';
const fixedClientSeed = 'reproducible-fairness-test-seed';
const cryptoProvider = webcrypto;

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function chiSquareForSevenBins(
  observed: readonly number[],
  expected: readonly number[],
): { statistic: number; pValue: number } {
  const statistic = observed.reduce((sum, count, index) => {
    const difference = count - expected[index]!;
    return sum + (difference * difference) / expected[index]!;
  }, 0);
  const half = statistic / 2;
  // Survival function for chi-square with six degrees of freedom.
  return {
    statistic,
    pValue: Math.exp(-half) * (1 + half + (half * half) / 2),
  };
}

async function countByWeights(
  signer: Awaited<ReturnType<typeof createHmacSigner>>,
  weights: readonly number[],
  drawCount: number,
): Promise<number[]> {
  const counts = Array.from({ length: weights.length }, () => 0);
  const totalWeight = weights.reduce((total, weight) => total + weight, 0);
  for (let nonce = 0; nonce < drawCount; nonce += 1) {
    const message = `${fixedClientSeed}:${nonce}:statistical-wheel`;
    const digest = await signer(message);
    const value = await sampleUnbiasedInteger(digest, totalWeight, cryptoProvider);
    let cumulative = 0;
    for (let index = 0; index < weights.length; index += 1) {
      cumulative += weights[index]!;
      if (value < cumulative) {
        counts[index] = counts[index]! + 1;
        break;
      }
    }
  }
  return counts;
}

const weightedSegments: Segment[] = [
  { id: 'one', label: '하나', weight: 1 },
  { id: 'two', label: '둘', weight: 2 },
  { id: 'three', label: '셋', weight: 3 },
  { id: 'four', label: '넷', weight: 5 },
  { id: 'five', label: '다섯', weight: 7 },
  { id: 'six', label: '여섯', weight: 11 },
  { id: 'seven', label: '일곱', weight: 13 },
];

describe('commit-reveal fairness protocol', () => {
  it('creates a 32-byte server seed and SHA-256 commitment before a draw', async () => {
    const session = await createFairnessSession('editable-client-seed', cryptoProvider);
    const expected = createHash('sha256')
      .update(Buffer.from(session.serverSeed, 'hex'))
      .digest('hex');

    expect(session.serverSeed).toMatch(/^[0-9a-f]{64}$/);
    expect(session.commitment).toBe(expected);
    expect(session.clientSeed).toBe('editable-client-seed');
    const defaultSeedSession = await createFairnessSession(undefined, cryptoProvider);
    expect(defaultSeedSession.clientSeed).toMatch(/^[0-9a-f]{64}$/);
    await expect(createFairnessSession('', cryptoProvider)).rejects.toThrow(RangeError);
  });

  it('uses the specified HMAC-SHA256 message and returns a reproducible weighted draw', async () => {
    const signer = await createHmacSigner(fixedServerSeed, cryptoProvider);
    const message = `${fixedClientSeed}:17:participants`;
    const expectedHmac = createHmac('sha256', Buffer.from(fixedServerSeed, 'hex'))
      .update(message, 'utf8')
      .digest('hex');
    const digest = await signer(message);
    expect(bytesToHex(digest)).toBe(expectedHmac);

    const first = await drawSegment(
      weightedSegments,
      signer,
      fixedClientSeed,
      17,
      'participants',
      cryptoProvider,
    );
    const repeated = await drawSegment(
      weightedSegments,
      signer,
      fixedClientSeed,
      17,
      'participants',
      cryptoProvider,
    );
    expect(first).toEqual(repeated);
    expect(weightedSegments.some((segment) => segment.id === first.segmentId)).toBe(true);
    expect(first.randomValue).toBeGreaterThanOrEqual(0);
    expect(first.randomValue).toBeLessThan(42);
  });

  it('maps arbitrary 256-bit inputs into the legal range in at least 1,000 generated cases', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uint8Array({ minLength: 32, maxLength: 32 }),
        fc.integer({ min: 1, max: 500_000 }),
        async (digest, totalWeight) => {
          const value = await sampleUnbiasedInteger(digest, totalWeight, cryptoProvider);
          expect(Number.isInteger(value)).toBe(true);
          expect(value).toBeGreaterThanOrEqual(0);
          expect(value).toBeLessThan(totalWeight);
        },
      ),
      { numRuns: 1_000 },
    );
  });

  it('derives a reproducible non-constant visual offset fraction from HMAC bytes', () => {
    const first = animationFractionFromHmac('01'.repeat(32));
    const second = animationFractionFromHmac('02'.repeat(32));
    expect(first).toBeGreaterThanOrEqual(0);
    expect(first).toBeLessThan(1);
    expect(second).toBeGreaterThanOrEqual(0);
    expect(second).toBeLessThan(1);
    expect(first).not.toBe(second);
    expect(() => animationFractionFromHmac('not-hex')).toThrow(RangeError);
  });

  it('takes the rejection path instead of reducing the all-ones digest modulo the range', async () => {
    const rejectedMaximum = new Uint8Array(32).fill(255);
    const value = await sampleUnbiasedInteger(rejectedMaximum, 3, cryptoProvider);
    expect(value).toBeGreaterThanOrEqual(0);
    expect(value).toBeLessThan(3);
  });

  it('rejects invalid ranges, digest lengths, and malformed seeds', async () => {
    const validDigest = new Uint8Array(32);
    for (const range of [0, -1, 1.5, 500_001]) {
      await expect(
        sampleUnbiasedInteger(validDigest, range, cryptoProvider),
      ).rejects.toThrow(RangeError);
    }
    await expect(
      sampleUnbiasedInteger(new Uint8Array(31), 7, cryptoProvider),
    ).rejects.toThrow(RangeError);
    await expect(createHmacSigner('xyz', cryptoProvider)).rejects.toThrow(RangeError);
    await expect(createHmacSigner('00'.repeat(31), cryptoProvider)).rejects.toThrow(
      RangeError,
    );

    const signer = await createHmacSigner(fixedServerSeed, cryptoProvider);
    await expect(
      drawSegment([], signer, fixedClientSeed, 0, 'wheel', cryptoProvider),
    ).rejects.toThrow(RangeError);
    await expect(
      drawSegment(weightedSegments, signer, '', 0, 'wheel', cryptoProvider),
    ).rejects.toThrow(RangeError);
    await expect(
      drawSegment(weightedSegments, signer, fixedClientSeed, -1, 'wheel', cryptoProvider),
    ).rejects.toThrow(RangeError);
    await expect(
      drawSegment(weightedSegments, signer, fixedClientSeed, 0, '', cryptoProvider),
    ).rejects.toThrow(RangeError);
  });

  it('verifies a session log and marks modified or malformed draws as failed', async () => {
    const signer = await createHmacSigner(fixedServerSeed, cryptoProvider);
    const draw0 = await drawSegment(
      weightedSegments,
      signer,
      fixedClientSeed,
      0,
      'participants',
      cryptoProvider,
    );
    const draw1 = await drawSegment(
      weightedSegments,
      signer,
      fixedClientSeed,
      1,
      'penalties',
      cryptoProvider,
    );
    const commitment = createHash('sha256')
      .update(Buffer.from(fixedServerSeed, 'hex'))
      .digest('hex');
    const log = {
      version: 1,
      commitment,
      clientSeed: fixedClientSeed,
      serverSeed: fixedServerSeed,
      draws: [draw0, draw1],
    };

    await expect(verifySessionLog(log, cryptoProvider)).resolves.toEqual({
      validLog: true,
      commitmentValid: true,
      draws: [
        { nonce: 0, passed: true },
        { nonce: 1, passed: true },
      ],
    });

    const modified = await verifySessionLog(
      { ...log, draws: [{ ...draw0, randomValue: (draw0.randomValue + 1) % 42 }] },
      cryptoProvider,
    );
    expect(modified.draws).toEqual([{ nonce: 0, passed: false }]);

    const badCommitment = await verifySessionLog(
      { ...log, commitment: 'f'.repeat(64) },
      cryptoProvider,
    );
    expect(badCommitment.commitmentValid).toBe(false);
    expect(badCommitment.draws.every((draw) => !draw.passed)).toBe(true);

    const malformedCommitment = await verifySessionLog(
      { ...log, commitment: 'not-a-digest' },
      cryptoProvider,
    );
    expect(malformedCommitment).toEqual({
      validLog: false,
      commitmentValid: false,
      draws: [],
    });
    const malformedSeed = await verifySessionLog(
      { ...log, serverSeed: 'z'.repeat(64) },
      cryptoProvider,
    );
    expect(malformedSeed.validLog).toBe(false);

    const invalidSnapshot = await verifySessionLog(
      {
        ...log,
        draws: [{ ...draw0, segments: [{ id: 'broken', label: 'Broken', weight: 0 }] }],
      },
      cryptoProvider,
    );
    expect(invalidSnapshot.draws).toEqual([{ nonce: 0, passed: false }]);

    const badNonce = await verifySessionLog(
      { ...log, draws: [{ ...draw1, nonce: 1 }] },
      cryptoProvider,
    );
    expect(badNonce.draws).toEqual([{ nonce: 1, passed: false }]);

    const malformedDraw = await verifySessionLog(
      { ...log, draws: ['not a draw'] },
      cryptoProvider,
    );
    expect(malformedDraw.draws).toEqual([{ nonce: 0, passed: false }]);
    expect(await verifySessionLog(null, cryptoProvider)).toEqual({
      validLog: false,
      commitmentValid: false,
      draws: [],
    });
    expect(await verifySessionLog({ version: 3 }, cryptoProvider)).toEqual({
      validLog: false,
      commitmentValid: false,
      draws: [],
    });
  });

  it('passes deterministic chi-square tests for weighted and seven-equal-slice wheels', async () => {
    const signer = await createHmacSigner(fixedServerSeed, cryptoProvider);
    const drawCount = 200_000;
    const weighted = await countByWeights(signer, [1, 2, 3, 5, 7, 11, 13], drawCount);
    const weightedExpected = [1, 2, 3, 5, 7, 11, 13].map(
      (weight) => (drawCount * weight) / 42,
    );
    const weightedStats = chiSquareForSevenBins(weighted, weightedExpected);
    expect(weightedStats.pValue).toBeGreaterThan(0.001);

    const equal = await countByWeights(
      signer,
      Array.from({ length: 7 }, () => 1),
      drawCount,
    );
    const equalExpected = Array.from({ length: 7 }, () => drawCount / 7);
    const equalStats = chiSquareForSevenBins(equal, equalExpected);
    expect(equalStats.pValue).toBeGreaterThan(0.001);
    console.info(
      JSON.stringify({
        drawCount,
        weighted: {
          counts: weighted,
          chiSquare: weightedStats.statistic,
          p: weightedStats.pValue,
        },
        sevenEqual: {
          counts: equal,
          chiSquare: equalStats.statistic,
          p: equalStats.pValue,
        },
      }),
    );
  }, 300_000);
});
