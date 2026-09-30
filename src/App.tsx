import { useEffect, useMemo, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import {
  animationFractionFromHmac,
  createFairnessSession,
  createHmacSigner,
  drawSegment,
  type FairnessSession,
} from './domain/fairness';
import { rotationAtProgress, solveRestAngle, targetRotationAtRest } from './domain/spin';
import type { Segment } from './domain/segments';
import WheelCanvas, { type WheelCanvasHandle } from './ui/WheelCanvas';
import styles from './App.module.css';

type LegacyKey = 'participants' | 'penalties';
type GameResult = Readonly<{
  participantId: string;
  participant: string;
  penalty: string;
}>;

function readLegacyList(key: LegacyKey): string[] {
  try {
    const value = localStorage.getItem(key);
    if (!value) return [];
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed) &&
      parsed.every((item): item is string => typeof item === 'string')
      ? parsed
      : [];
  } catch {
    return [];
  }
}

function toSegments(labels: readonly string[], prefix: string): Segment[] {
  return labels.map((label, index) => ({
    id: `${prefix}-${index}`,
    label,
    weight: 1,
  }));
}

function persistLegacyList(key: LegacyKey, list: string[]): void {
  try {
    localStorage.setItem(key, JSON.stringify(list));
  } catch {
    // Keep the in-memory session usable if browser storage is unavailable.
  }
}

export default function App() {
  const [participants, setParticipants] = useState<string[]>(() =>
    readLegacyList('participants'),
  );
  const [penalties, setPenalties] = useState<string[]>(() => readLegacyList('penalties'));
  const [participantInput, setParticipantInput] = useState('');
  const [penaltyInput, setPenaltyInput] = useState('');
  const [fairnessSession, setFairnessSession] = useState<FairnessSession | null>(null);
  const [clientSeed, setClientSeed] = useState('');
  const [revealedServerSeed, setRevealedServerSeed] = useState<string | null>(null);
  const [sessionEnded, setSessionEnded] = useState(false);
  const [fairnessError, setFairnessError] = useState('');
  const [isCreatingSession, setIsCreatingSession] = useState(false);
  const [rotationDeg, setRotationDeg] = useState(0);
  const rotationRef = useRef(0);
  const wheelCanvasRef = useRef<WheelCanvasHandle>(null);
  const animationFrameRef = useRef<number | null>(null);
  const spinInFlightRef = useRef(false);
  const [isSpinning, setIsSpinning] = useState(false);
  const [drawNonce, setDrawNonce] = useState(0);
  const [results, setResults] = useState<GameResult[]>([]);
  const [previousWheel, setPreviousWheel] = useState<readonly Segment[] | null>(null);
  const [transitionProgress, setTransitionProgress] = useState(1);
  const [spinError, setSpinError] = useState('');
  const wheelSegments = useMemo(
    () => toSegments(participants, 'participant'),
    [participants],
  );
  const penaltySegments = useMemo(() => toSegments(penalties, 'penalty'), [penalties]);

  useEffect(() => {
    let cancelled = false;
    void createFairnessSession()
      .then((session) => {
        if (cancelled) return;
        setFairnessSession(session);
        setClientSeed(session.clientSeed);
      })
      .catch(() => {
        if (!cancelled)
          setFairnessError('이 브라우저에서 암호학적 난수를 사용할 수 없습니다.');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(
    () => () => {
      if (animationFrameRef.current !== null)
        cancelAnimationFrame(animationFrameRef.current);
    },
    [],
  );

  useEffect(() => persistLegacyList('participants', participants), [participants]);
  useEffect(() => persistLegacyList('penalties', penalties), [penalties]);

  async function beginNewSession(): Promise<void> {
    if (spinInFlightRef.current || isCreatingSession || !fairnessSession) return;
    if (drawNonce > 0 && !sessionEnded) {
      setFairnessError(
        '새 세션을 시작하기 전에 현재 세션을 종료하고 서버 시드를 공개해 주세요.',
      );
      return;
    }
    setFairnessError('');
    setIsCreatingSession(true);
    try {
      const session = await createFairnessSession(
        clientSeed === '' ? undefined : clientSeed,
      );
      setFairnessSession(session);
      setClientSeed(session.clientSeed);
      setRevealedServerSeed(null);
      setSessionEnded(false);
      setDrawNonce(0);
    } catch {
      setFairnessError(
        '세션을 시작할 수 없습니다. 페이지를 새로고침해 다시 시도해 주세요.',
      );
    } finally {
      setIsCreatingSession(false);
    }
  }

  function revealServerSeed(): void {
    if (!fairnessSession) return;
    setRevealedServerSeed(fairnessSession.serverSeed);
    setSessionEnded(true);
  }

  async function spinWheel(): Promise<void> {
    if (
      spinInFlightRef.current ||
      isCreatingSession ||
      !fairnessSession ||
      sessionEnded ||
      wheelSegments.length === 0 ||
      penaltySegments.length === 0
    ) {
      return;
    }

    spinInFlightRef.current = true;
    setIsSpinning(true);
    setSpinError('');
    try {
      const signer = await createHmacSigner(fairnessSession.serverSeed);
      const [participantDraw, penaltyDraw] = await Promise.all([
        drawSegment(wheelSegments, signer, clientSeed, drawNonce, 'participants'),
        drawSegment(penaltySegments, signer, clientSeed, drawNonce + 1, 'penalties'),
      ]);
      setDrawNonce((nonce) => nonce + 2);

      const selectedIndex = wheelSegments.findIndex(
        (segment) => segment.id === participantDraw.segmentId,
      );
      const selectedParticipant = wheelSegments[selectedIndex];
      const selectedPenalty = penaltySegments.find(
        (segment) => segment.id === penaltyDraw.segmentId,
      );
      if (!selectedParticipant || !selectedPenalty) {
        throw new Error('The committed draw did not resolve to a configured segment.');
      }

      const restAngle = solveRestAngle(
        wheelSegments,
        participantDraw.segmentId,
        270,
        animationFractionFromHmac(participantDraw.hmac),
      );
      const startRotation = rotationRef.current;
      const targetRotation = targetRotationAtRest(startRotation, restAngle, 5);
      const reducedMotion =
        window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
      const nextParticipants = participants.filter((_, index) => index !== selectedIndex);
      const result = {
        participantId: selectedParticipant.id,
        participant: selectedParticipant.label,
        penalty: selectedPenalty.label,
      };

      const completeImmediately = (): void => {
        rotationRef.current = targetRotation;
        setRotationDeg(targetRotation);
        setResults((current) => [...current, result]);
        setParticipants(nextParticipants);
        setPreviousWheel(null);
        setTransitionProgress(1);
        setIsSpinning(false);
        spinInFlightRef.current = false;
        animationFrameRef.current = null;
      };

      if (reducedMotion) {
        completeImmediately();
        return;
      }

      let spinStartedAt: number | null = null;
      const spinFrame = (timestamp: number): void => {
        if (spinStartedAt === null) spinStartedAt = timestamp;
        const progress = Math.min(1, (timestamp - spinStartedAt) / 5_000);
        const angle = rotationAtProgress(startRotation, targetRotation, progress);
        rotationRef.current = angle;
        wheelCanvasRef.current?.drawAtRotation(angle);

        if (progress < 1) {
          animationFrameRef.current = requestAnimationFrame(spinFrame);
          return;
        }

        rotationRef.current = targetRotation;
        setRotationDeg(targetRotation);
        setPreviousWheel(wheelSegments);
        setParticipants(nextParticipants);
        setTransitionProgress(0);
        setResults((current) => [...current, result]);

        let transitionStartedAt: number | null = null;
        const reflowFrame = (frameTime: number): void => {
          if (transitionStartedAt === null) transitionStartedAt = frameTime;
          // Hold the committed winning slice briefly, then crossfade the intentional reflow.
          const reflowElapsed = frameTime - transitionStartedAt - 160;
          const reflowProgress = Math.min(1, Math.max(0, reflowElapsed / 320));
          wheelCanvasRef.current?.drawAtRotation(targetRotation, reflowProgress);
          if (reflowProgress < 1) {
            animationFrameRef.current = requestAnimationFrame(reflowFrame);
            return;
          }
          setPreviousWheel(null);
          setTransitionProgress(1);
          setIsSpinning(false);
          spinInFlightRef.current = false;
          animationFrameRef.current = null;
        };
        animationFrameRef.current = requestAnimationFrame(reflowFrame);
      };
      animationFrameRef.current = requestAnimationFrame(spinFrame);
    } catch {
      setSpinError(
        '추첨을 완료할 수 없습니다. 세션 시드와 브라우저 암호화 기능을 확인해 주세요.',
      );
      setIsSpinning(false);
      spinInFlightRef.current = false;
      animationFrameRef.current = null;
    }
  }

  function addItem(event: FormEvent<HTMLFormElement>, kind: LegacyKey): void {
    event.preventDefault();
    const input = kind === 'participants' ? participantInput : penaltyInput;
    const label = input.trim();
    if (!label) return;

    if (kind === 'participants') {
      setParticipants((items) => [...items, label]);
      setParticipantInput('');
    } else {
      setPenalties((items) => [...items, label]);
      setPenaltyInput('');
    }
  }

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <p className={styles.eyebrow}>CLASSROOM · PARTY · FAIR PLAY</p>
        <h1>다중 회전 룰렛</h1>
        <p className={styles.intro}>참가자와 벌칙을 등록해 순서를 정해 보세요.</p>
      </header>

      <section className={styles.fairnessPanel} aria-labelledby="fairness-title">
        <div className={styles.fairnessHeading}>
          <div>
            <h2 id="fairness-title">공정성 커밋먼트</h2>
            <p>추첨 전에 공개되는 서버 시드 SHA-256</p>
          </div>
          <span className={styles.commitmentBadge}>SHA-256</span>
        </div>
        <code className={styles.commitment} aria-label="세션 커밋먼트">
          {fairnessSession?.commitment ?? '암호학적 난수를 준비하는 중…'}
        </code>
        <label className={styles.seedLabel} htmlFor="client-seed">
          참가자 시드 (수정 가능)
        </label>
        <input
          id="client-seed"
          className={styles.seedInput}
          value={clientSeed}
          onChange={(event) => setClientSeed(event.currentTarget.value)}
          disabled={!fairnessSession || sessionEnded || isSpinning || isCreatingSession}
          autoComplete="off"
        />
        <div className={styles.sessionActions}>
          <button
            type="button"
            onClick={() => void beginNewSession()}
            disabled={!fairnessSession || isSpinning || isCreatingSession}
          >
            새 세션 시작
          </button>
          <button
            type="button"
            onClick={revealServerSeed}
            disabled={!fairnessSession || sessionEnded || isSpinning || isCreatingSession}
          >
            세션 종료 및 시드 공개
          </button>
        </div>
        {fairnessError && (
          <p className={styles.fairnessError} role="alert">
            {fairnessError}
          </p>
        )}
        {revealedServerSeed && (
          <p className={styles.revealedSeed} aria-live="polite">
            공개된 서버 시드: <code>{revealedServerSeed}</code>
          </p>
        )}
      </section>

      <section className={styles.panel} aria-label="룰렛 설정">
        <RosterEditor
          title="참가자"
          hint="참가자 이름을 입력하세요"
          value={participantInput}
          onChange={setParticipantInput}
          disabled={isSpinning}
          items={participants}
          onSubmit={(event) => addItem(event, 'participants')}
          onRemove={(index) =>
            setParticipants((items) => items.filter((_, i) => i !== index))
          }
          accent="green"
        />
        <RosterEditor
          title="벌칙 / 순번"
          hint="벌칙 또는 순번을 입력하세요"
          value={penaltyInput}
          onChange={setPenaltyInput}
          disabled={isSpinning}
          items={penalties}
          onSubmit={(event) => addItem(event, 'penalties')}
          onRemove={(index) =>
            setPenalties((items) => items.filter((_, i) => i !== index))
          }
          accent="orange"
        />
      </section>

      <section className={styles.wheelPanel} aria-labelledby="wheel-title">
        <h2 id="wheel-title">추첨 휠</h2>
        {wheelSegments.length > 0 || previousWheel ? (
          <WheelCanvas
            ref={wheelCanvasRef}
            segments={wheelSegments}
            rotationDeg={rotationDeg}
            previousSegments={previousWheel}
            transitionProgress={transitionProgress}
          />
        ) : (
          <p className={styles.wheelEmpty}>참가자를 추가하면 휠이 준비됩니다.</p>
        )}
        <p className={styles.count}>
          참가자 {participants.length}명 <span aria-hidden="true">·</span> 항목{' '}
          {penalties.length}개
        </p>
        <button
          className={styles.spinButton}
          type="button"
          onClick={() => void spinWheel()}
          disabled={
            isSpinning ||
            !fairnessSession ||
            sessionEnded ||
            participants.length === 0 ||
            penalties.length === 0
          }
        >
          {isSpinning ? '추첨 및 결과 정리 중…' : '룰렛 돌리기'}
        </button>
        <p className={styles.spinError} role="alert">
          {spinError}
        </p>
        <p
          className={styles.resultAnnouncement}
          role="status"
          aria-live="polite"
          data-result-participant-id={results.at(-1)?.participantId ?? ''}
        >
          {results.length > 0
            ? `결과: ${results.at(-1)!.participant} — 벌칙: ${results.at(-1)!.penalty}`
            : '아직 추첨 결과가 없습니다.'}
        </p>
        {results.length > 0 && (
          <ol className={styles.resultsList} aria-label="추첨 결과 기록">
            {results.map((result, index) => (
              <li key={`${index}-${result.participant}`}>
                <span>{result.participant}</span>
                <span>{result.penalty}</span>
              </li>
            ))}
          </ol>
        )}
      </section>

      <footer className={styles.footer}>
        <p>데이터는 이 기기의 브라우저에 저장됩니다.</p>
        <a href="./verify/">세션 로그 검증</a>
        <span aria-hidden="true"> · </span>
        <a href="./perf/">휠 성능 측정</a>
      </footer>
    </main>
  );
}

type RosterEditorProps = {
  title: string;
  hint: string;
  value: string;
  onChange: (value: string) => void;
  disabled: boolean;
  items: string[];
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onRemove: (index: number) => void;
  accent: 'green' | 'orange';
};

function RosterEditor({
  title,
  hint,
  value,
  onChange,
  disabled,
  items,
  onSubmit,
  onRemove,
  accent,
}: RosterEditorProps) {
  return (
    <section className={styles.roster} aria-labelledby={`${accent}-title`}>
      <div className={styles.rosterHeading}>
        <h2 id={`${accent}-title`}>{title}</h2>
        <span className={styles.badge}>{items.length}</span>
      </div>
      <form className={styles.form} onSubmit={onSubmit}>
        <label className={styles.visuallyHidden} htmlFor={`${accent}-input`}>
          {hint}
        </label>
        <input
          id={`${accent}-input`}
          value={value}
          onChange={(event) => onChange(event.currentTarget.value)}
          placeholder={hint}
          autoComplete="off"
          disabled={disabled}
        />
        <button type="submit" aria-label={`${title} 추가`} disabled={disabled}>
          추가
        </button>
      </form>
      <ul className={styles.list}>
        {items.map((item, index) => (
          <li className={styles.listItem} key={`${item}-${index}`}>
            <span>{item}</span>
            <button
              type="button"
              className={styles.remove}
              aria-label={`${item} 삭제`}
              disabled={disabled}
              onClick={() => onRemove(index)}
            >
              삭제
            </button>
          </li>
        ))}
        {items.length === 0 && (
          <li className={styles.empty}>아직 등록된 항목이 없습니다.</li>
        )}
      </ul>
    </section>
  );
}
