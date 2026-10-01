import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { Segment } from '../domain/segments';
import { wheelPalette, type WheelColor } from './wheel-palette';
import { splitGraphemes } from './grapheme';
import styles from './WheelCanvas.module.css';

type WheelLayout = Readonly<{
  segments: readonly Segment[];
  palette: readonly WheelColor[];
  bitmap: HTMLCanvasElement | null;
}>;

type WheelCanvasProps = Readonly<{
  segments: readonly Segment[];
  rotationDeg: number;
  label?: string;
  previousSegments?: readonly Segment[] | null;
  transitionProgress?: number;
}>;

export type WheelCanvasHandle = Readonly<{
  drawAtRotation: (rotationDeg: number, transitionProgress?: number) => void;
}>;

function fitLabel(
  context: CanvasRenderingContext2D,
  label: string,
  arcLength: number,
): { text: string; fontSize: number } | null {
  if (arcLength < 18) return null;

  const graphemes = splitGraphemes(label);
  if (graphemes.length === 0) return null;
  const maxWidth = arcLength * 0.76;
  context.font = '600 16px "Noto Sans KR", sans-serif';
  let visible = graphemes;
  let text = visible.join('');
  while (visible.length > 1 && context.measureText(text).width > maxWidth) {
    visible = visible.slice(0, -1);
    text = `${visible.join('')}…`;
  }
  const measured = context.measureText(text).width;
  const fontSize = Math.min(18, (16 * maxWidth) / measured);
  if (fontSize < 8 || !Number.isFinite(fontSize)) return null;
  return { text, fontSize };
}

function prepareLayout(
  segments: readonly Segment[],
  size: number,
  measurementContext: CanvasRenderingContext2D | null,
  pixelRatio: number,
): WheelLayout {
  const palette = segments.length > 0 ? wheelPalette(segments.length) : [];
  if (!measurementContext || segments.length === 0) {
    return { segments, palette, bitmap: null };
  }
  const bitmap = document.createElement('canvas');
  bitmap.width = Math.round(size * pixelRatio);
  bitmap.height = bitmap.width;
  const context = bitmap.getContext('2d');
  if (!context) return { segments, palette, bitmap: null };
  context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
  const totalWeight = segments.reduce((total, segment) => total + segment.weight, 0);
  const center = size / 2;
  const radius = size * 0.46;
  let prefix = 0;
  for (const [index, segment] of segments.entries()) {
    const start = (2 * Math.PI * prefix) / totalWeight;
    prefix += segment.weight;
    const end = (2 * Math.PI * prefix) / totalWeight;
    const color = palette[index]!;
    context.beginPath();
    context.moveTo(center, center);
    context.arc(center, center, radius, start, end, false);
    context.closePath();
    context.fillStyle = color.fill;
    context.fill();
    context.strokeStyle = '#ffffff';
    context.lineWidth = 0.6;
    context.stroke();

    const labelRadius = radius * 0.62;
    const label = fitLabel(
      measurementContext,
      segment.label,
      Math.min(labelRadius * (end - start), radius * 0.65),
    );
    if (!label) continue;
    const midpoint = (start + end) / 2;
    context.save();
    context.translate(
      center + Math.cos(midpoint) * labelRadius,
      center + Math.sin(midpoint) * labelRadius,
    );
    context.rotate(
      midpoint > Math.PI / 2 && midpoint < (3 * Math.PI) / 2
        ? midpoint + Math.PI
        : midpoint,
    );
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.font = `600 ${label.fontSize}px "Noto Sans KR", sans-serif`;
    context.fillStyle = color.text;
    context.fillText(label.text, 0, 0);
    context.restore();
  }
  return { segments, palette, bitmap };
}

function drawWheelLayer(
  context: CanvasRenderingContext2D,
  layout: WheelLayout,
  size: number,
  rotationDeg: number,
  opacity: number,
): void {
  if (!layout.bitmap || opacity === 0) return;
  // Rasterize all 500 paths/labels only when layout, size, or DPR changes. A spin
  // frame is one rotated bitmap blit per layer, independent of the segment count.
  context.save();
  context.globalAlpha = opacity;
  context.translate(size / 2, size / 2);
  context.rotate(((rotationDeg % 360) * Math.PI) / 180);
  context.drawImage(layout.bitmap, -size / 2, -size / 2, size, size);
  context.restore();
}

function drawPointer(context: CanvasRenderingContext2D, size: number): void {
  const center = size / 2;
  const tipY = size * 0.15;
  context.beginPath();
  context.moveTo(center, tipY);
  context.lineTo(center - size * 0.034, size * 0.025);
  context.lineTo(center + size * 0.034, size * 0.025);
  context.closePath();
  context.fillStyle = '#15251e';
  context.strokeStyle = '#ffffff';
  context.lineWidth = Math.max(1, size / 240);
  context.fill();
  context.stroke();
}

function renderCanvasFrame(
  canvas: HTMLCanvasElement,
  context: CanvasRenderingContext2D,
  size: number,
  rotationDeg: number,
  currentLayout: WheelLayout,
  previousLayout: WheelLayout | null,
  transitionProgress: number,
): void {
  const pixelRatio = Math.max(1, window.devicePixelRatio || 1);
  const pixelSize = Math.round(size * pixelRatio);
  if (canvas.width !== pixelSize || canvas.height !== pixelSize) {
    canvas.width = pixelSize;
    canvas.height = pixelSize;
    canvas.style.width = `${size}px`;
    canvas.style.height = `${size}px`;
  }
  canvas.dataset.rotationDeg = String(rotationDeg);
  canvas.dataset.transitionProgress = String(transitionProgress);
  context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
  context.clearRect(0, 0, size, size);

  if (previousLayout && transitionProgress < 1) {
    drawWheelLayer(context, previousLayout, size, rotationDeg, 1 - transitionProgress);
    drawWheelLayer(context, currentLayout, size, rotationDeg, transitionProgress);
  } else {
    drawWheelLayer(context, currentLayout, size, rotationDeg, 1);
  }
  drawPointer(context, size);
  context.beginPath();
  context.arc(size / 2, size / 2, size * 0.025, 0, 2 * Math.PI);
  context.fillStyle = '#15251e';
  context.fill();
  context.strokeStyle = '#ffffff';
  context.lineWidth = Math.max(1, size / 240);
  context.stroke();
}

const WheelCanvas = forwardRef<WheelCanvasHandle, WheelCanvasProps>(function WheelCanvas(
  {
    segments,
    rotationDeg,
    label = '참가자 룰렛',
    previousSegments = null,
    transitionProgress = 1,
  },
  ref,
) {
  const stageRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawFrameRef = useRef<((rotation: number, progress: number) => void) | null>(
    null,
  );
  const [size, setSize] = useState(320);
  const [pixelRatio, setPixelRatio] = useState(() =>
    Math.max(1, window.devicePixelRatio || 1),
  );
  const measurementCanvas = useMemo(() => document.createElement('canvas'), []);
  const measurementContext = useMemo(
    () =>
      typeof CanvasRenderingContext2D === 'undefined'
        ? null
        : measurementCanvas.getContext('2d'),
    [measurementCanvas],
  );
  const currentLayout = useMemo(
    () => prepareLayout(segments, size, measurementContext, pixelRatio),
    [measurementContext, segments, size, pixelRatio],
  );
  const previousLayout = useMemo(
    () =>
      previousSegments
        ? prepareLayout(previousSegments, size, measurementContext, pixelRatio)
        : null,
    [measurementContext, previousSegments, size, pixelRatio],
  );
  const renderState = useRef({
    size,
    rotationDeg,
    currentLayout,
    previousLayout,
    transitionProgress,
    propsRotation: rotationDeg,
    propsProgress: transitionProgress,
  });
  if (renderState.current.propsRotation !== rotationDeg) {
    renderState.current.rotationDeg = rotationDeg;
    renderState.current.propsRotation = rotationDeg;
  }
  if (renderState.current.propsProgress !== transitionProgress) {
    renderState.current.transitionProgress = transitionProgress;
    renderState.current.propsProgress = transitionProgress;
  }
  renderState.current = { ...renderState.current, size, currentLayout, previousLayout };
  const currentGeometry = useMemo(
    () =>
      JSON.stringify(
        segments.map((segment, index) => ({
          id: segment.id,
          label: segment.label,
          weight: segment.weight,
          color: currentLayout.palette[index]?.fill,
        })),
      ),
    [currentLayout.palette, segments],
  );
  const previousGeometry = useMemo(
    () =>
      previousSegments
        ? JSON.stringify(
            previousSegments.map((segment, index) => ({
              id: segment.id,
              label: segment.label,
              weight: segment.weight,
              color: previousLayout?.palette[index]?.fill,
            })),
          )
        : '',
    [previousLayout?.palette, previousSegments],
  );

  useImperativeHandle(
    ref,
    () => ({
      drawAtRotation: (angle, progress = renderState.current.transitionProgress) => {
        renderState.current = {
          ...renderState.current,
          rotationDeg: angle,
          transitionProgress: progress,
        };
        drawFrameRef.current?.(angle, progress);
      },
    }),
    [],
  );

  useEffect(() => {
    const stage = stageRef.current;
    const canvas = canvasRef.current;
    if (!stage || !canvas || typeof CanvasRenderingContext2D === 'undefined') return;

    let resizeObserver: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver((entries) => {
        const width = entries[0]?.contentRect.width;
        if (width && width > 0) setSize(Math.min(560, width));
      });
      resizeObserver.observe(stage);
    } else {
      const width = stage.getBoundingClientRect().width;
      if (width > 0) setSize(Math.min(560, width));
    }
    const resize = (): void => {
      setPixelRatio(Math.max(1, window.devicePixelRatio || 1));
      const state = renderState.current;
      drawFrameRef.current?.(state.rotationDeg, state.transitionProgress);
    };
    window.addEventListener('resize', resize);
    return () => {
      resizeObserver?.disconnect();
      window.removeEventListener('resize', resize);
    };
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || typeof CanvasRenderingContext2D === 'undefined') return;
    const context = canvas.getContext('2d');
    if (!context) return;

    const draw = (angle: number, progress: number): void =>
      renderCanvasFrame(
        canvas,
        context,
        size,
        angle,
        currentLayout,
        previousLayout,
        progress,
      );
    drawFrameRef.current = draw;
    draw(renderState.current.rotationDeg, renderState.current.transitionProgress);
    return () => {
      if (drawFrameRef.current === draw) drawFrameRef.current = null;
    };
  }, [currentLayout, previousLayout, rotationDeg, size, transitionProgress]);

  return (
    <div className={styles.stage} ref={stageRef}>
      <canvas
        className={styles.canvas}
        ref={canvasRef}
        role="img"
        data-rotation-deg={rotationDeg}
        data-transition-progress={transitionProgress}
        data-wheel-segments={currentGeometry}
        data-previous-segments={previousGeometry}
        aria-label={`${label}: ${segments.map((segment) => `${segment.label}, 가중치 ${segment.weight}`).join('; ')}`}
      />
      <ul className={styles.screenReaderList} aria-label="현재 룰렛 항목 및 가중치">
        {segments.map((segment) => (
          <li key={segment.id}>
            {segment.label}: 가중치 {segment.weight}
          </li>
        ))}
      </ul>
    </div>
  );
});

export default WheelCanvas;
