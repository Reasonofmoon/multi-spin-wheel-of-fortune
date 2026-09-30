import { useMemo, useRef, useState } from 'react';
import WheelCanvas, { type WheelCanvasHandle } from './ui/WheelCanvas';
import type { Segment } from './domain/segments';
import styles from './PerfHarness.module.css';

type PerfResult = Readonly<{
  frames: number;
  averageMs: number;
  medianMs: number;
  p95Ms: number;
  framesAtOrUnder16_7Ms: number;
  frameTimes: readonly number[];
}>;

function percentile(sorted: readonly number[], fraction: number): number {
  if (sorted.length === 0) return 0;
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * fraction) - 1)]!;
}

export default function PerfHarness() {
  const segments = useMemo<Segment[]>(
    () =>
      Array.from({ length: 500 }, (_, index) => ({
        id: `perf-${index}`,
        label: `측정 참가자 ${index + 1}`,
        weight: (index % 10) + 1,
      })),
    [],
  );
  const wheelRef = useRef<WheelCanvasHandle>(null);
  const activeRef = useRef(false);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<PerfResult | null>(null);

  function measure(): void {
    if (activeRef.current) return;
    activeRef.current = true;
    setRunning(true);
    setResult(null);
    const frameTimes: number[] = [];
    let startedAt: number | null = null;
    let lastFrameAt: number | null = null;

    const frame = (timestamp: number): void => {
      if (startedAt === null) startedAt = timestamp;
      if (lastFrameAt !== null) frameTimes.push(timestamp - lastFrameAt);
      lastFrameAt = timestamp;
      const progress = Math.min(1, (timestamp - startedAt) / 5_000);
      const eased = 1 - (1 - progress) ** 2;
      wheelRef.current?.drawAtRotation(1_800 * eased);

      if (progress < 1) {
        requestAnimationFrame(frame);
        return;
      }

      const sorted = [...frameTimes].sort((first, second) => first - second);
      setResult({
        frames: frameTimes.length,
        averageMs: frameTimes.reduce((sum, value) => sum + value, 0) / frameTimes.length,
        medianMs: percentile(sorted, 0.5),
        p95Ms: percentile(sorted, 0.95),
        framesAtOrUnder16_7Ms: frameTimes.filter((value) => value <= 16.7).length,
        frameTimes,
      });
      activeRef.current = false;
      setRunning(false);
    };
    requestAnimationFrame(frame);
  }

  return (
    <main className={styles.page}>
      <a href="../">← 룰렛으로 돌아가기</a>
      <p className={styles.eyebrow}>500 SEGMENT RENDER TEST</p>
      <h1>휠 성능 측정</h1>
      <p>
        현재 기기에서 500개 가중치 세그먼트의 5초 애니메이션 프레임 간격을 기록합니다.
      </p>
      <WheelCanvas ref={wheelRef} segments={segments} rotationDeg={0} />
      <button type="button" onClick={measure} disabled={running}>
        {running ? '측정 중…' : '5초 성능 측정 시작'}
      </button>
      {result && (
        <section aria-live="polite" aria-labelledby="result-title">
          <h2 id="result-title">측정 결과</h2>
          <dl>
            <div>
              <dt>프레임 수</dt>
              <dd>{result.frames}</dd>
            </div>
            <div>
              <dt>평균 간격</dt>
              <dd>{result.averageMs.toFixed(2)} ms</dd>
            </div>
            <div>
              <dt>중앙값 간격</dt>
              <dd>{result.medianMs.toFixed(2)} ms</dd>
            </div>
            <div>
              <dt>95백분위 간격</dt>
              <dd>{result.p95Ms.toFixed(2)} ms</dd>
            </div>
            <div>
              <dt>16.7ms 이하 비율</dt>
              <dd>
                {((result.framesAtOrUnder16_7Ms / result.frames) * 100).toFixed(1)}%
              </dd>
            </div>
          </dl>
          <label htmlFor="raw-frame-times">원시 프레임 간격 (ms)</label>
          <textarea
            id="raw-frame-times"
            readOnly
            value={result.frameTimes.map((value) => value.toFixed(2)).join(', ')}
          />
        </section>
      )}
    </main>
  );
}
