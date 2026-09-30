import { MAX_SEGMENTS } from '../domain/segments';

export type WheelColor = Readonly<{
  fill: string;
  text: '#000000' | '#ffffff';
  perceptual: Readonly<{ l: number; a: number; b: number }>;
}>;

const GOLDEN_ANGLE = 137.50776405003785;

function oklchToLinearRgb(
  lightness: number,
  chroma: number,
  hueDeg: number,
): [number, number, number] {
  const hue = (hueDeg * Math.PI) / 180;
  const a = chroma * Math.cos(hue);
  const b = chroma * Math.sin(hue);
  const lRoot = lightness + 0.3963377774 * a + 0.2158037573 * b;
  const mRoot = lightness - 0.1055613458 * a - 0.0638541728 * b;
  const sRoot = lightness - 0.0894841775 * a - 1.291485548 * b;
  const l = lRoot ** 3;
  const m = mRoot ** 3;
  const s = sRoot ** 3;
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
}

function encodeSrgb(linear: number): number {
  const channel =
    linear <= 0.0031308 ? 12.92 * linear : 1.055 * linear ** (1 / 2.4) - 0.055;
  return Math.round(Math.max(0, Math.min(1, channel)) * 255);
}

function contrastRatio(first: number, second: number): number {
  const lighter = Math.max(first, second);
  const darker = Math.min(first, second);
  return (lighter + 0.05) / (darker + 0.05);
}

function colorAt(index: number, count: number): WheelColor {
  const lightness = index === count - 1 && count > 1 ? 0.8 : index % 2 === 0 ? 0.6 : 0.8;
  let hue = (index * GOLDEN_ANGLE) % 360;
  if (index === count - 1 && count > 1) {
    hue = ((((index - 1) * GOLDEN_ANGLE) % 360) + 180) % 360;
  }

  let chroma = 0.16;
  let rgb = oklchToLinearRgb(lightness, chroma, hue);
  for (let attempt = 0; attempt < 24; attempt += 1) {
    if (rgb.every((channel) => channel >= 0 && channel <= 1)) break;
    chroma *= 0.9;
    rgb = oklchToLinearRgb(lightness, chroma, hue);
  }

  const encoded = rgb.map(encodeSrgb);
  const fill = `#${encoded.map((channel) => channel.toString(16).padStart(2, '0')).join('')}`;
  const luminance = 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2];
  const blackContrast = contrastRatio(luminance, 0);
  const whiteContrast = contrastRatio(luminance, 1);
  const text = whiteContrast > blackContrast ? '#ffffff' : '#000000';
  const radians = (hue * Math.PI) / 180;

  return {
    fill,
    text,
    perceptual: {
      l: lightness,
      a: chroma * Math.cos(radians),
      b: chroma * Math.sin(radians),
    },
  };
}

export function wheelPalette(count: number): WheelColor[] {
  if (!Number.isInteger(count) || count < 1 || count > MAX_SEGMENTS) {
    throw new RangeError(`Palette size must be from 1 to ${MAX_SEGMENTS}.`);
  }
  return Array.from({ length: count }, (_, index) => colorAt(index, count));
}

export function perceptualDistance(first: WheelColor, second: WheelColor): number {
  const dl = first.perceptual.l - second.perceptual.l;
  const da = first.perceptual.a - second.perceptual.a;
  const db = first.perceptual.b - second.perceptual.b;
  return Math.sqrt(dl * dl + da * da + db * db);
}
