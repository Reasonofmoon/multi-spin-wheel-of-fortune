// @vitest-environment node
import { createHash, createHmac, webcrypto } from 'node:crypto';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  animationFractionFromHmac,
  createFairnessSession,
  cryptographicId,
  commitmentForSeed,
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
  const segments = weights.map((weight, index) => ({
    id: `stat-${index}`,
    label: '중복',
    weight,
  }));
  for (let nonce = 0; nonce < drawCount; nonce += 1) {
    const draw = await drawSegment(
      segments,
      signer,
      fixedClientSeed,
      nonce,
      'statistical-wheel',
      cryptoProvider,
    );
    const value = draw.randomValue;
    let cumulative = 0;
    for (let index = 0; index < weights.length; index += 1) {
      cumulative += weights[index]!;
      if (value < cumulative) {
        expect(draw.segmentId).toBe(segments[index]!.id);
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

  it('creates UUID v4 identities and computes commitments independently', async () => {
    const id = cryptographicId(cryptoProvider);
    expect(id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
    expect(cryptographicId(cryptoProvider)).not.toBe(id);
    await expect(commitmentForSeed(fixedServerSeed, cryptoProvider)).resolves.toBe(
      createHash('sha256').update(Buffer.from(fixedServerSeed, 'hex')).digest('hex'),
    );
    await expect(commitmentForSeed('00', cryptoProvider)).rejects.toThrow(RangeError);
    await expect(commitmentForSeed('invalid', cryptoProvider)).rejects.toThrow(
      RangeError,
    );
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
      { numRuns: 1_000, seed: 20260930 },
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

  it('rejects the incomplete upper residue range using real SHA-256 retry evidence', async () => {
    let digestCalls = 0;
    const measuredCrypto = {
      getRandomValues: (bytes: Uint8Array) => cryptoProvider.getRandomValues(bytes),
      subtle: {
        importKey: cryptoProvider.subtle.importKey.bind(cryptoProvider.subtle),
        sign: cryptoProvider.subtle.sign.bind(cryptoProvider.subtle),
        digest: async (algorithm: 'SHA-256', data: ArrayBuffer) => {
          digestCalls += 1;
          return cryptoProvider.subtle.digest(algorithm, data);
        },
      },
    };
    const maximum = new Uint8Array(32).fill(255);
    const counter = Buffer.alloc(8);
    counter.writeBigUInt64BE(1n);
    const retry = createHash('sha256').update(maximum).update(counter).digest('hex');
    const expected = Number(BigInt(`0x${retry}`) % 3n);
    expect(await sampleUnbiasedInteger(maximum, 3, measuredCrypto)).toBe(expected);
    expect(digestCalls).toBe(1);
    // This adapter counts delegated Web Crypto calls, not a mock of the sampler.
    expect(await sampleUnbiasedInteger(maximum, 1, measuredCrypto)).toBe(0);
    expect(digestCalls).toBe(1);
    expect(() => animationFractionFromHmac('00'.repeat(31))).toThrow(RangeError);
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

    const emptyClient = await verifySessionLog(
      { ...log, clientSeed: '' },
      cryptoProvider,
    );
    expect(emptyClient.validLog).toBe(false);
    const duplicateNonce = await verifySessionLog(
      { ...log, draws: [draw0, draw0] },
      cryptoProvider,
    );
    expect(duplicateNonce.draws).toEqual([
      { nonce: 0, passed: true },
      { nonce: 0, passed: false },
    ]);
    const changedIdentity = await verifySessionLog(
      { ...log, draws: [{ ...draw0, segmentId: 'not-the-winner' }] },
      cryptoProvider,
    );
    expect(changedIdentity.draws[0]?.passed).toBe(false);
    const changedMac = await verifySessionLog(
      { ...log, draws: [{ ...draw0, hmac: '00'.repeat(32) }] },
      cryptoProvider,
    );
    expect(changedMac.draws[0]?.passed).toBe(false);

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

  it('keeps participant and penalty streams statistically independent', async () => {
    const signer = await createHmacSigner(fixedServerSeed, cryptoProvider);
    const segments = Array.from({ length: 7 }, (_, i) => ({
      id: `id-${i}`,
      label: '동명이인',
      weight: 1,
    }));
    const count = 20_000;
    const joint = Array.from({ length: 7 }, () => Array<number>(7).fill(0));
    const rows = Array<number>(7).fill(0);
    const columns = Array<number>(7).fill(0);
    for (let pair = 0; pair < count; pair += 1) {
      const participant = await drawSegment(
        segments,
        signer,
        fixedClientSeed,
        pair * 2,
        'participants',
        cryptoProvider,
      );
      const penalty = await drawSegment(
        segments,
        signer,
        fixedClientSeed,
        pair * 2 + 1,
        'penalties',
        cryptoProvider,
      );
      expect(participant.hmac).not.toBe(penalty.hmac);
      joint[participant.randomValue]![penalty.randomValue]! += 1;
      rows[participant.randomValue]! += 1;
      columns[penalty.randomValue]! += 1;
    }
    let chiSquare = 0;
    for (let row = 0; row < 7; row += 1) {
      for (let column = 0; column < 7; column += 1) {
        const expected = (rows[row]! * columns[column]!) / count;
        chiSquare += (joint[row]![column]! - expected) ** 2 / expected;
      }
    }
    // Chi-square independence df=(7-1)*(7-1)=36; exact even-df survival function.
    const half = chiSquare / 2;
    let term = 1;
    let sum = 1;
    for (let k = 1; k < 18; k += 1) {
      term *= half / k;
      sum += term;
    }
    const p = Math.exp(-half) * sum;
    console.info(
      JSON.stringify({ pairDraws: count, independence: { chiSquare, p, joint } }),
    );
    expect(p).toBeGreaterThan(0.001);
    expect(joint.every((row) => row.every((value) => value > 0))).toBe(true);
  }, 120_000);

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
