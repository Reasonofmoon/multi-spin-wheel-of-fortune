import { segmentForWeightValue, validateSegments, type Segment } from './segments';

const SEED_BYTES = 32;
const MAX_TOTAL_WEIGHT = 500_000;
const DIGEST_BITS = BigInt(SEED_BYTES * 8);
const DIGEST_SPACE = 1n << DIGEST_BITS;
const encoder = new TextEncoder();

export type CryptoProvider = {
  getRandomValues(array: Uint8Array): Uint8Array;
  subtle: {
    digest(algorithm: 'SHA-256', data: ArrayBuffer): Promise<ArrayBuffer>;
    importKey(
      format: 'raw',
      keyData: ArrayBuffer,
      algorithm: { name: 'HMAC'; hash: 'SHA-256' },
      extractable: boolean,
      keyUsages: KeyUsage[],
    ): Promise<CryptoKey>;
    sign(algorithm: 'HMAC', key: CryptoKey, data: ArrayBuffer): Promise<ArrayBuffer>;
  };
};

export type FairnessSession = Readonly<{
  serverSeed: string;
  commitment: string;
  clientSeed: string;
}>;

export type FairnessDrawRecord = Readonly<{
  nonce: number;
  wheelId: string;
  segments: readonly Segment[];
  randomValue: number;
  segmentId: string;
  hmac: string;
}>;

export type FairnessSessionLog = Readonly<{
  version: 1;
  commitment: string;
  clientSeed: string;
  serverSeed: string;
  draws: readonly FairnessDrawRecord[];
}>;

export type DrawVerification = Readonly<{
  nonce: number;
  passed: boolean;
}>;

export type SessionVerification = Readonly<{
  validLog: boolean;
  commitmentValid: boolean;
  draws: readonly DrawVerification[];
}>;

export type HmacSigner = (message: string) => Promise<Uint8Array>;

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function hexToBytes(hex: string): Uint8Array {
  if (!/^(?:[0-9a-f]{2})+$/i.test(hex)) {
    throw new RangeError(
      'Seed and digest values must be even-length hexadecimal strings.',
    );
  }
  const bytes = new Uint8Array(hex.length / 2);
  for (let index = 0; index < bytes.length; index += 1) {
    bytes[index] = Number.parseInt(hex.slice(index * 2, index * 2 + 2), 16);
  }
  return bytes;
}

function arrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return Uint8Array.from(bytes).buffer;
}

function bytesToBigInt(bytes: Uint8Array): bigint {
  let value = 0n;
  for (const byte of bytes) value = (value << 8n) | BigInt(byte);
  return value;
}

function concatenate(left: Uint8Array, right: Uint8Array): Uint8Array {
  const output = new Uint8Array(left.length + right.length);
  output.set(left);
  output.set(right, left.length);
  return output;
}

function counterBytes(counter: number): Uint8Array {
  const bytes = new Uint8Array(8);
  new DataView(bytes.buffer).setBigUint64(0, BigInt(counter), false);
  return bytes;
}

export function animationFractionFromHmac(hmac: string): number {
  const digest = hexToBytes(hmac);
  if (digest.length !== SEED_BYTES)
    throw new RangeError('Animation entropy must contain 32 bytes.');
  const sample = bytesToBigInt(digest.slice(0, 6));
  return Number(sample) / 2 ** 48;
}

function validateTotalWeight(totalWeight: number): void {
  if (
    !Number.isInteger(totalWeight) ||
    totalWeight < 1 ||
    totalWeight > MAX_TOTAL_WEIGHT
  ) {
    throw new RangeError(`Total weight must be an integer in [1, ${MAX_TOTAL_WEIGHT}].`);
  }
}

/** Stable entry/session identity; randomness is centralized with the fairness boundary. */
export function cryptographicId(
  cryptoProvider: CryptoProvider = globalThis.crypto,
): string {
  const bytes = cryptoProvider.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6]! & 0x0f) | 0x40;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = bytesToHex(bytes);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export async function commitmentForSeed(
  serverSeed: string,
  cryptoProvider: CryptoProvider = globalThis.crypto,
): Promise<string> {
  const bytes = hexToBytes(serverSeed);
  if (bytes.length !== SEED_BYTES)
    throw new RangeError('Server seed must contain 32 bytes.');
  return bytesToHex(
    new Uint8Array(await cryptoProvider.subtle.digest('SHA-256', arrayBuffer(bytes))),
  );
}

export async function createFairnessSession(
  clientSeed?: string,
  cryptoProvider: CryptoProvider = globalThis.crypto,
): Promise<FairnessSession> {
  const serverSeedBytes = cryptoProvider.getRandomValues(new Uint8Array(SEED_BYTES));
  const resolvedClientSeed =
    clientSeed ?? bytesToHex(cryptoProvider.getRandomValues(new Uint8Array(SEED_BYTES)));
  if (resolvedClientSeed.length === 0)
    throw new RangeError('Client seed cannot be empty.');

  const commitmentBytes = new Uint8Array(
    await cryptoProvider.subtle.digest('SHA-256', arrayBuffer(serverSeedBytes)),
  );
  return {
    serverSeed: bytesToHex(serverSeedBytes),
    commitment: bytesToHex(commitmentBytes),
    clientSeed: resolvedClientSeed,
  };
}

export async function createHmacSigner(
  serverSeed: string,
  cryptoProvider: CryptoProvider = globalThis.crypto,
): Promise<HmacSigner> {
  const keyBytes = hexToBytes(serverSeed);
  if (keyBytes.length !== SEED_BYTES)
    throw new RangeError('Server seed must contain 32 bytes.');
  const key = await cryptoProvider.subtle.importKey(
    'raw',
    arrayBuffer(keyBytes),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );

  return async (message: string): Promise<Uint8Array> =>
    new Uint8Array(
      await cryptoProvider.subtle.sign('HMAC', key, arrayBuffer(encoder.encode(message))),
    );
}

/**
 * Maps a 256-bit HMAC result without modulo bias. Rejected blocks are deterministically
 * expanded with SHA-256(originalDigest || uint64be(attempt)) until one is accepted.
 */
export async function sampleUnbiasedInteger(
  digest: Uint8Array,
  totalWeight: number,
  cryptoProvider: CryptoProvider = globalThis.crypto,
): Promise<number> {
  validateTotalWeight(totalWeight);
  if (digest.length !== SEED_BYTES)
    throw new RangeError('A draw digest must contain 32 bytes.');

  const range = BigInt(totalWeight);
  const acceptanceLimit = DIGEST_SPACE - (DIGEST_SPACE % range);
  let candidateBytes = digest;
  let attempt = 0;

  while (true) {
    const candidate = bytesToBigInt(candidateBytes);
    if (candidate < acceptanceLimit) return Number(candidate % range);
    attempt += 1;
    candidateBytes = new Uint8Array(
      await cryptoProvider.subtle.digest(
        'SHA-256',
        arrayBuffer(concatenate(digest, counterBytes(attempt))),
      ),
    );
  }
}

export async function drawSegment(
  segments: readonly Segment[],
  signer: HmacSigner,
  clientSeed: string,
  nonce: number,
  wheelId: string,
  cryptoProvider: CryptoProvider = globalThis.crypto,
): Promise<FairnessDrawRecord> {
  const totalWeight = validateSegments(segments);
  if (!clientSeed) throw new RangeError('Client seed cannot be empty.');
  if (!Number.isSafeInteger(nonce) || nonce < 0)
    throw new RangeError('Nonce must be a non-negative safe integer.');
  if (!wheelId) throw new RangeError('Wheel id cannot be empty.');

  const digest = await signer(`${clientSeed}:${nonce}:${wheelId}`);
  const randomValue = await sampleUnbiasedInteger(digest, totalWeight, cryptoProvider);
  const segment = segmentForWeightValue(segments, randomValue);
  return {
    nonce,
    wheelId,
    segments: segments.map((item) => ({ ...item })),
    randomValue,
    segmentId: segment.id,
    hmac: bytesToHex(digest),
  };
}

function isSegment(value: unknown): value is Segment {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.id === 'string' &&
    typeof candidate.label === 'string' &&
    typeof candidate.weight === 'number'
  );
}

function isDrawRecord(value: unknown): value is FairnessDrawRecord {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return (
    Number.isSafeInteger(candidate.nonce) &&
    typeof candidate.wheelId === 'string' &&
    Array.isArray(candidate.segments) &&
    candidate.segments.every(isSegment) &&
    Number.isInteger(candidate.randomValue) &&
    typeof candidate.segmentId === 'string' &&
    typeof candidate.hmac === 'string'
  );
}

export async function verifySessionLog(
  input: unknown,
  cryptoProvider: CryptoProvider = globalThis.crypto,
): Promise<SessionVerification> {
  if (typeof input !== 'object' || input === null) {
    return { validLog: false, commitmentValid: false, draws: [] };
  }
  const candidate = input as Record<string, unknown>;
  if (
    candidate.version !== 1 ||
    typeof candidate.commitment !== 'string' ||
    typeof candidate.clientSeed !== 'string' ||
    candidate.clientSeed.length === 0 ||
    typeof candidate.serverSeed !== 'string' ||
    !Array.isArray(candidate.draws)
  ) {
    return { validLog: false, commitmentValid: false, draws: [] };
  }

  let commitmentValid = false;
  let signer: HmacSigner | undefined;
  try {
    const seedBytes = hexToBytes(candidate.serverSeed);
    if (
      seedBytes.length !== SEED_BYTES ||
      !/^[0-9a-f]{64}$/i.test(candidate.commitment)
    ) {
      return { validLog: false, commitmentValid: false, draws: [] };
    }
    const digest = new Uint8Array(
      await cryptoProvider.subtle.digest('SHA-256', arrayBuffer(seedBytes)),
    );
    commitmentValid = bytesToHex(digest) === candidate.commitment.toLowerCase();
    signer = await createHmacSigner(candidate.serverSeed, cryptoProvider);
  } catch {
    return { validLog: false, commitmentValid: false, draws: [] };
  }

  const drawResults: DrawVerification[] = [];
  for (const [index, rawDraw] of candidate.draws.entries()) {
    if (!isDrawRecord(rawDraw)) {
      drawResults.push({ nonce: index, passed: false });
      continue;
    }

    let passed = false;
    try {
      const expected = await drawSegment(
        rawDraw.segments,
        signer,
        candidate.clientSeed,
        rawDraw.nonce,
        rawDraw.wheelId,
        cryptoProvider,
      );
      passed =
        commitmentValid &&
        rawDraw.nonce === index &&
        expected.hmac === rawDraw.hmac.toLowerCase() &&
        expected.randomValue === rawDraw.randomValue &&
        expected.segmentId === rawDraw.segmentId;
    } catch {
      passed = false;
    }
    drawResults.push({ nonce: rawDraw.nonce, passed });
  }

  return { validLog: true, commitmentValid, draws: drawResults };
}
