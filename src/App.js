import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Plus, X, Volume2, User, Award, RefreshCw, Info } from 'lucide-react';
import confetti from 'canvas-confetti';
import spinSound from './sounds/spin.mp3';
import winSound from './sounds/win.mp3';

const MultiSpinWheelOfFortune = () => {
  const [participants, setParticipants] = useState(() => {
    const saved = localStorage.getItem('participants');
    return saved ? JSON.parse(saved) : [];
  });
  const [penalties, setPenalties] = useState(() => {
    const saved = localStorage.getItem('penalties');
    return saved ? JSON.parse(saved) : [];
  });
  const [newParticipant, setNewParticipant] = useState('');
  const [newPenalty, setNewPenalty] = useState('');
  const [isSpinning, setIsSpinning] = useState(false);
  const [rotationAngle, setRotationAngle] = useState(0);
  const [result, setResult] = useState(null);
  const [showFireworks, setShowFireworks] = useState(false);
  const [remainingParticipants, setRemainingParticipants] = useState([]);
  const [gameResults, setGameResults] = useState(() => {
    const saved = localStorage.getItem('gameResults');
    return saved ? JSON.parse(saved) : [];
  });
  const [error, setError] = useState('');
  const [showRules, setShowRules] = useState(false);

  useEffect(() => {
    localStorage.setItem('participants', JSON.stringify(participants));
    localStorage.setItem('penalties', JSON.stringify(penalties));
    localStorage.setItem('gameResults', JSON.stringify(gameResults));
  }, [participants, penalties, gameResults]);

  const addParticipant = useCallback(() => {
    if (newParticipant.trim() === '') {
      setError('Participant name cannot be empty');
      return;
    }
    setParticipants(prev => [...prev, newParticipant.trim()]);
    setNewParticipant('');
    setError('');
  }, [newParticipant]);

  const addPenalty = useCallback(() => {
    if (newPenalty.trim() === '') {
      setError('Penalty cannot be empty');
      return;
    }
    setPenalties(prev => [...prev, newPenalty.trim()]);
    setNewPenalty('');
    setError('');
  }, [newPenalty]);

  const removeParticipant = useCallback((index) => {
    setParticipants(prev => prev.filter((_, i) => i !== index));
  }, []);

  const removePenalty = useCallback((index) => {
    setPenalties(prev => prev.filter((_, i) => i !== index));
  }, []);

  const getColor = useMemo(() => (index, total) => {
    const hue = (index * (360 / total)) % 360;
    return `hsl(${hue}, 70%, 50%)`;
  }, []);

  const spinWheel = useCallback(() => {
    if (remainingParticipants.length > 0 && penalties.length > 0 && !isSpinning) {
      setIsSpinning(true);
      playSound('spinning');
      
      const randomAngle = Math.floor(Math.random() * 360);
      const rotations = 5 * 360;
      const finalAngle = rotations + randomAngle;
      
      setRotationAngle(finalAngle);
      
      setTimeout(() => {
        const selectedIndex = getSelectedIndex(finalAngle % 360);
        const selectedParticipant = remainingParticipants[selectedIndex];
        const selectedPenalty = penalties[selectedIndex % penalties.length];
        
        setResult({ participant: selectedParticipant, penalty: selectedPenalty });
        setGameResults(prev => [...prev, { participant: selectedParticipant, penalty: selectedPenalty }]);
        setRemainingParticipants(prev => prev.filter(p => p !== selectedParticipant));
        
        setIsSpinning(false);
        playSound('fanfare');
        setShowFireworks(true);
        confetti({
          particleCount: 100,
          spread: 70,
          origin: { y: 0.6 }
        });
        setTimeout(() => setShowFireworks(false), 3000);
      }, 5000);
    } else if (remainingParticipants.length === 0) {
      setError('No participants left. Please reset the game or add more participants.');
    } else if (penalties.length === 0) {
      setError('No penalties available. Please add some penalties.');
    }
  }, [remainingParticipants, penalties, isSpinning]);

  const getSelectedIndex = useCallback((angle) => {
    const sectionAngle = 360 / remainingParticipants.length;
    return Math.floor(((360 - angle + sectionAngle / 2) % 360) / sectionAngle);
  }, [remainingParticipants.length]);

  const playSound = useCallback((sound) => {
    const audio = new Audio(sound === 'spinning' ? spinSound : winSound);
    audio.play().catch(error => console.error('Audio playback failed:', error));
  }, []);

  const calculateTextProps = useCallback((index, total, text) => {
    if (total === 0) return null; // 배열이 비어있을 때 null 반환
    const angle = ((index + 0.5) * (360 / total)) % 360;
    const radius = 38;
    const x = 50 + radius * Math.cos(angle * Math.PI / 180);
    const y = 50 + radius * Math.sin(angle * Math.PI / 180);
    const rotation = angle > 90 && angle < 270 ? angle + 180 : angle;
    
    return {
      x, 
      y, 
      rotate: rotation,
      text: text.length > 10 ? text.slice(0, 10) + '...' : text
    };
  }, []);

  const resetGame = useCallback(() => {
    setRemainingParticipants([...participants]);
    setGameResults([]);
    setResult(null);
    setRotationAngle(0);
    setError('');
  }, [participants]);

  useEffect(() => {
    setRemainingParticipants([...participants]);
  }, [participants]);

  return (
    <div className="App">
      <h1 className="text-responsive-large mb-8">Multi-Spin Wheel of Fortune</h1>
      <button onClick={() => setShowRules(!showRules)} className="info-button">
        <Info size={20} />
        {showRules ? 'Hide Rules' : 'Show Rules'}
      </button>
      {showRules && (
        <div className="rules-container">
          <h2>Game Rules</h2>
          <ol>
            <li>Add participants and penalties using the input fields below.</li>
            <li>Click "Spin the Wheel" to randomly select a participant and assign a penalty.</li>
            <li>The selected participant is removed from the wheel after each spin.</li>
            <li>Continue spinning until all participants have been selected or you choose to reset the game.</li>
            <li>Use the "Reset Game" button to start over with all participants.</li>
          </ol>
        </div>
      )}
      <div className="wheel-container">
        <svg viewBox="0 0 100 100" className="wheel" style={{ transform: `rotate(${rotationAngle}deg)` }}>
          {remainingParticipants.map((participant, index) => {
            const sectionAngle = 360 / remainingParticipants.length;
            const color = getColor(index, remainingParticipants.length);
            const textProps = calculateTextProps(index, remainingParticipants.length, participant);
            
            return (
              <g key={index}>
                <path
                  d={`M50 50 L50 0 A50 50 0 0 1 ${50 + 50 * Math.sin(sectionAngle * Math.PI / 180)} ${50 - 50 * Math.cos(sectionAngle * Math.PI / 180)} Z`}
                  fill={color}
                  transform={`rotate(${index * sectionAngle}, 50, 50)`}
                />
                {textProps && (
                  <text
                    x={textProps.x}
                    y={textProps.y}
                    transform={`rotate(${textProps.rotate}, ${textProps.x}, ${textProps.y})`}
                    textAnchor="middle"
                    className="wheel-text"
                  >
                    {textProps.text}
                  </text>
                )}
              </g>
            );
          })}
        </svg>
      </div>
      <button className="spin-button mt-6" onClick={spinWheel} disabled={isSpinning || remainingParticipants.length === 0 || penalties.length === 0}>
        Spin the Wheel
      </button>
      <div className="result-display text-responsive">
        {result ? `${result.participant} gets ${result.penalty}` : 'Your result will appear here'}
      </div>
      {error && <div className="error-message">{error}</div>}
      <div className="input-section">
        <div className="input-group">
          <input
            type="text"
            value={newParticipant}
            onChange={(e) => setNewParticipant(e.target.value)}
            placeholder="Enter participant name"
            className="input-field"
          />
          <button onClick={addParticipant} className="add-button">
            <Plus size={20} />
          </button>
        </div>
        <div className="input-group">
          <input
            type="text"
            value={newPenalty}
            onChange={(e) => setNewPenalty(e.target.value)}
            placeholder="Enter penalty"
            className="input-field"
          />
          <button onClick={addPenalty} className="add-button">
            <Plus size={20} />
          </button>
        </div>
      </div>
      <div className="game-results">
        <h2>Game Results</h2>
        <ul>
          {gameResults.map((result, index) => (
            <li key={index}>{result.participant}: {result.penalty}</li>
          ))}
        </ul>
      </div>
      <button onClick={resetGame} className="spin-button mt-6">
        Reset Game
      </button>
    </div>
  );
};

export default MultiSpinWheelOfFortune;