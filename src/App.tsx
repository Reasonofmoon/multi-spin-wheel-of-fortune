import { useEffect, useMemo, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import {
  animationFractionFromHmac,
  createFairnessSession,
  createHmacSigner,
  cryptographicId,
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
  penaltyId: string;
  nonce: number;
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

function toSegments(labels: readonly string[]): Segment[] {
  return labels.map((label) => ({
    id: cryptographicId(),
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
  const [participants, setParticipants] = useState<Segment[]>(() =>
    toSegments(readLegacyList('participants')),
  );
  const [penalties, setPenalties] = useState<Segment[]>(() =>
    toSegments(readLegacyList('penalties')),
  );
  const [eliminatedIds, setEliminatedIds] = useState<readonly string[]>([]);
  const lastPersistedParticipants = useRef(participants);
  const lastPersistedPenalties = useRef(penalties);
  const [participantInput, setParticipantInput] = useState('');
  const [penaltyInput, setPenaltyInput] = useState('');
  const [fairnessSession, setFairnessSession] = useState<FairnessSession | null>(null);
  const [clientSeed, setClientSeed] = useState('');
  const [revealedServerSeed, setRevealedServerSeed] = useState<string | null>(null);
  const [sessionEnded, setSessionEnded] = useState(false);
  const [fairnessError, setFairnessError] = useState('');
  const [isCreatingSession, setIsCreatingSession] = useState(false);
  const sessionCreationRef = useRef(false);
  const [rotationDeg, setRotationDeg] = useState(0);
  const rotationRef = useRef(0);
  const penaltyRotationRef = useRef(0);
  const [penaltyRotationDeg, setPenaltyRotationDeg] = useState(0);
  const penaltyCanvasRef = useRef<WheelCanvasHandle>(null);
  const mountedRef = useRef(true);
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
    () => participants.filter((entry) => !eliminatedIds.includes(entry.id)).slice(0, 500),
    [participants, eliminatedIds],
  );
  const penaltySegments = useMemo(() => penalties.slice(0, 500), [penalties]);

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

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (animationFrameRef.current !== null)
        cancelAnimationFrame(animationFrameRef.current);
    };
  }, []);

  // Until versioned migration in M4, never overwrite legacy bytes on mount, nor
  // mutate the persisted base roster merely because a round eliminates an entry.
  useEffect(() => {
    if (participants !== lastPersistedParticipants.current) {
      persistLegacyList(
        'participants',
        participants.map((entry) => entry.label),
      );
      lastPersistedParticipants.current = participants;
    }
  }, [participants]);
  useEffect(() => {
    if (penalties !== lastPersistedPenalties.current) {
      persistLegacyList(
        'penalties',
        penalties.map((entry) => entry.label),
      );
      lastPersistedPenalties.current = penalties;
    }
  }, [penalties]);

  async function beginNewSession(): Promise<void> {
    if (spinInFlightRef.current || sessionCreationRef.current || !fairnessSession) return;
    if (drawNonce > 0 && !sessionEnded) {
      setFairnessError(
        '새 세션을 시작하기 전에 현재 세션을 종료하고 서버 시드를 공개해 주세요.',
      );
      return;
    }
    sessionCreationRef.current = true;
    setFairnessError('');
    setIsCreatingSession(true);
    try {
      const session = await createFairnessSession(
        clientSeed === '' ? undefined : clientSeed,
      );
      if (!mountedRef.current) return;
      setFairnessSession(session);
      setClientSeed(session.clientSeed);
      setRevealedServerSeed(null);
      setSessionEnded(false);
      setDrawNonce(0);
      setEliminatedIds([]);
      setResults([]);
    } catch {
      setFairnessError(
        '세션을 시작할 수 없습니다. 페이지를 새로고침해 다시 시도해 주세요.',
      );
    } finally {
      sessionCreationRef.current = false;
      if (mountedRef.current) setIsCreatingSession(false);
    }
  }

  function revealServerSeed(): void {
    if (!fairnessSession || spinInFlightRef.current || sessionCreationRef.current) return;
    setRevealedServerSeed(fairnessSession.serverSeed);
    setSessionEnded(true);
  }

  async function spinWheel(): Promise<void> {
    if (
      spinInFlightRef.current ||
      sessionCreationRef.current ||
      !fairnessSession ||
      sessionEnded ||
      wheelSegments.length === 0 ||
      penaltySegments.length === 0 ||
      participants.length > 500 ||
      penalties.length > 500
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
      if (!mountedRef.current) return;
      setDrawNonce((nonce) => nonce + 2);

      const selectedParticipant = wheelSegments.find(
        (segment) => segment.id === participantDraw.segmentId,
      );
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
      const penaltyRest = solveRestAngle(
        penaltySegments,
        penaltyDraw.segmentId,
        270,
        animationFractionFromHmac(penaltyDraw.hmac),
      );
      const penaltyStart = penaltyRotationRef.current;
      const penaltyTarget = targetRotationAtRest(penaltyStart, penaltyRest, 5);
      const startRotation = rotationRef.current;
      const targetRotation = targetRotationAtRest(startRotation, restAngle, 5);
      const reducedMotion =
        window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
      const result = {
        participantId: selectedParticipant.id,
        participant: selectedParticipant.label,
        penalty: selectedPenalty.label,
        penaltyId: selectedPenalty.id,
        nonce: drawNonce,
      };

      const land = (): void => {
        rotationRef.current = targetRotation;
        penaltyRotationRef.current = penaltyTarget;
        setRotationDeg(targetRotation);
        setPenaltyRotationDeg(penaltyTarget);
        setResults((current) => [...current, result]);
        setPreviousWheel(wheelSegments);
        setEliminatedIds((ids) => [...ids, selectedParticipant.id]);
        setTransitionProgress(0);

        let transitionStartedAt: number | null = null;
        const reflowFrame = (frameTime: number): void => {
          if (transitionStartedAt === null) transitionStartedAt = frameTime;
          // The winning snapshot is readable before an intentional crossfade.
          const holdMs = reducedMotion ? 200 : 600;
          const fadeMs = reducedMotion ? 50 : 320;
          const reflowElapsed = frameTime - transitionStartedAt - holdMs;
          const reflowProgress = Math.min(1, Math.max(0, reflowElapsed / fadeMs));
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

      if (reducedMotion) {
        wheelCanvasRef.current?.drawAtRotation(targetRotation);
        penaltyCanvasRef.current?.drawAtRotation(penaltyTarget);
        land();
        return;
      }

      let spinStartedAt: number | null = null;
      const spinFrame = (timestamp: number): void => {
        if (spinStartedAt === null) spinStartedAt = timestamp;
        const progress = Math.min(1, (timestamp - spinStartedAt) / 3_200);
        const angle = rotationAtProgress(startRotation, targetRotation, progress);
        rotationRef.current = angle;
        wheelCanvasRef.current?.drawAtRotation(angle);
        const penaltyAngle = rotationAtProgress(penaltyStart, penaltyTarget, progress);
        penaltyRotationRef.current = penaltyAngle;
        penaltyCanvasRef.current?.drawAtRotation(penaltyAngle);

        if (progress < 1) {
          animationFrameRef.current = requestAnimationFrame(spinFrame);
          return;
        }

        land();
      };
      animationFrameRef.current = requestAnimationFrame(spinFrame);
    } catch {
      if (!mountedRef.current) return;
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
    if (spinInFlightRef.current) return;
    if ((kind === 'participants' ? participants : penalties).length >= 500) return;
    const input = kind === 'participants' ? participantInput : penaltyInput;
    const label = input.trim();
    if (!label) return;

    if (kind === 'participants') {
      setParticipants((items) => [...items, { id: cryptographicId(), label, weight: 1 }]);
      setParticipantInput('');
    } else {
      setPenalties((items) => [...items, { id: cryptographicId(), label, weight: 1 }]);
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
          onChange={(event) => {
            if (!spinInFlightRef.current && drawNonce === 0)
              setClientSeed(event.currentTarget.value);
          }}
          disabled={
            !fairnessSession ||
            sessionEnded ||
            isSpinning ||
            isCreatingSession ||
            drawNonce > 0
          }
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
          onRemove={(id) => {
            if (!spinInFlightRef.current)
              setParticipants((items) => items.filter((entry) => entry.id !== id));
          }}
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
          onRemove={(id) => {
            if (!spinInFlightRef.current)
              setPenalties((items) => items.filter((entry) => entry.id !== id));
          }}
          accent="orange"
        />
      </section>

      <section className={styles.wheelPanel} aria-labelledby="wheel-title">
        <h2 id="wheel-title">추첨 휠</h2>
        <div className={styles.wheels}>
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
          {penaltySegments.length > 0 && (
            <WheelCanvas
              ref={penaltyCanvasRef}
              segments={penaltySegments}
              rotationDeg={penaltyRotationDeg}
              label="벌칙 룰렛"
            />
          )}
        </div>
        {(participants.length > 500 || penalties.length > 500) && (
          <p role="alert">
            모든 기존 항목을 보존했습니다. 휠당 500개 이하로 편집한 뒤 추첨해 주세요.
          </p>
        )}
        <p className={styles.count}>
          참가자 {wheelSegments.length}명 <span aria-hidden="true">·</span> 항목{' '}
          {penalties.length}개
        </p>
        <button
          className={styles.spinButton}
          type="button"
          onClick={() => void spinWheel()}
          disabled={
            isSpinning ||
            isCreatingSession ||
            !fairnessSession ||
            sessionEnded ||
            wheelSegments.length === 0 ||
            penalties.length === 0 ||
            participants.length > 500 ||
            penalties.length > 500
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
          data-result-penalty-id={results.at(-1)?.penaltyId ?? ''}
          data-draw-nonce={drawNonce}
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
  items: readonly Segment[];
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onRemove: (id: string) => void;
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
          disabled={disabled || items.length >= 500}
        />
        <button
          type="submit"
          aria-label={`${title} 추가`}
          disabled={disabled || items.length >= 500}
        >
          추가
        </button>
      </form>
      <ul className={styles.list}>
        {items.map((item) => (
          <li className={styles.listItem} key={item.id}>
            <span>{item.label}</span>
            <button
              type="button"
              className={styles.remove}
              aria-label={`${item.label} 삭제`}
              disabled={disabled}
              onClick={() => onRemove(item.id)}
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
