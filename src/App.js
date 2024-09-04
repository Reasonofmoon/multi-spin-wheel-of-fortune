import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Plus, X, User, Award, RefreshCw } from 'lucide-react';

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
  const [showFireworks, setShowFireworks] = useState(false);
  const [remainingParticipants, setRemainingParticipants] = useState([]);
  const [gameResults, setGameResults] = useState([]);
  const wheelRef = useRef(null);

  useEffect(() => {
    localStorage.setItem('participants', JSON.stringify(participants));
    localStorage.setItem('penalties', JSON.stringify(penalties));
  }, [participants, penalties]);

  useEffect(() => {
    setRemainingParticipants([...participants]);
  }, [participants]);

  const addParticipant = () => {
    if (newParticipant.trim() !== '') {
      setParticipants(prev => [...prev, newParticipant.trim()]);
      setNewParticipant('');
    }
  };

  const addPenalty = () => {
    if (newPenalty.trim() !== '') {
      setPenalties(prev => [...prev, newPenalty.trim()]);
      setNewPenalty('');
    }
  };

  const removeParticipant = (index) => {
    setParticipants(prev => prev.filter((_, i) => i !== index));
  };

  const removePenalty = (index) => {
    setPenalties(prev => prev.filter((_, i) => i !== index));
  };

  const getColor = (index, total) => {
    const hue = (index * (360 / total)) % 360;
    return `hsl(${hue}, 70%, 50%)`;
  };

  const getSelectedIndex = useCallback((angle) => {
    const sectionAngle = 360 / remainingParticipants.length;
    return Math.floor(((360 - angle + sectionAngle / 2) % 360) / sectionAngle);
  }, [remainingParticipants.length]);

  const spinWheel = useCallback(() => {
    if (remainingParticipants.length > 0 && penalties.length > 0 && !isSpinning) {
      setIsSpinning(true);
      
      const randomAngle = Math.floor(Math.random() * 360);
      const rotations = 5 * 360; // 5 full rotations
      const finalAngle = rotationAngle + rotations + randomAngle;
      
      setRotationAngle(finalAngle);
      
      setTimeout(() => {
        const selectedIndex = getSelectedIndex(finalAngle % 360);
        const selectedParticipant = remainingParticipants[selectedIndex];
        const selectedPenalty = penalties[selectedIndex % penalties.length];
        
        setGameResults(prev => [...prev, { participant: selectedParticipant, penalty: selectedPenalty }]);
        setRemainingParticipants(prev => prev.filter(p => p !== selectedParticipant));
        
        setIsSpinning(false);
        setShowFireworks(true);
        setTimeout(() => setShowFireworks(false), 3000);
      }, 5000); // Match this with the CSS animation duration
    }
  }, [remainingParticipants, penalties, isSpinning, rotationAngle, getSelectedIndex]);

  const calculateTextProps = (index, total, text) => {
    const angle = ((index + 0.5) * (360 / total)) % 360;
    const radius = 35; // Slightly smaller than the wheel radius to fit text inside
    const x = 50 + radius * Math.cos(angle * Math.PI / 180);
    const y = 50 + radius * Math.sin(angle * Math.PI / 180);
    const rotation = angle > 90 && angle < 270 ? angle + 180 : angle;
    
    return {
      x, 
      y, 
      rotate: rotation,
      text: text.length > 8 ? text.slice(0, 8) + '...' : text
    };
  };

  const resetGame = () => {
    setRemainingParticipants([...participants]);
    setGameResults([]);
    setRotationAngle(0);
    setIsSpinning(false);
  };

  return (
    <div className="p-2 bg-gradient-to-br from-yellow-400 via-red-500 to-pink-500 min-h-screen flex items-center justify-center font-sans">
      <div className="bg-white rounded-lg shadow-xl p-4 max-w-md w-full">
        <h1 className="text-2xl font-bold text-center text-pink-600 mb-4">🎉 다중 회전 운명의 룰렛 🎊</h1>
        
        <div className="grid grid-cols-1 gap-4 mb-4">
          <div>
            <h2 className="text-lg font-semibold mb-2 text-pink-500"><User className="inline mr-2" />참가자</h2>
            <div className="flex">
              <input
                type="text"
                value={newParticipant}
                onChange={(e) => setNewParticipant(e.target.value)}
                className="flex-grow p-2 border border-pink-300 rounded-l focus:outline-none focus:ring-2 focus:ring-pink-400"
                placeholder="참가자 이름"
              />
              <button onClick={addParticipant} className="bg-pink-500 text-white p-2 rounded-r hover:bg-pink-600 transition duration-300">
                <Plus size={20} />
              </button>
            </div>
          </div>
          <div>
            <h2 className="text-lg font-semibold mb-2 text-purple-500"><Award className="inline mr-2" />벌칙/순번</h2>
            <div className="flex">
              <input
                type="text"
                value={newPenalty}
                onChange={(e) => setNewPenalty(e.target.value)}
                className="flex-grow p-2 border border-purple-300 rounded-l focus:outline-none focus:ring-2 focus:ring-purple-400"
                placeholder="벌칙 또는 순번"
              />
              <button onClick={addPenalty} className="bg-purple-500 text-white p-2 rounded-r hover:bg-purple-600 transition duration-300">
                <Plus size={20} />
              </button>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4 mb-4">
          <div className="max-h-32 overflow-y-auto bg-pink-50 p-2 rounded">
            {participants.map((participant, index) => (
              <div key={index} className="flex justify-between items-center bg-white p-1 rounded mb-1 text-sm">
                <span className="text-pink-600">{participant}</span>
                <button onClick={() => removeParticipant(index)} className="text-red-500 hover:text-red-700">
                  <X size={16} />
                </button>
              </div>
            ))}
          </div>
          <div className="max-h-32 overflow-y-auto bg-purple-50 p-2 rounded">
            {penalties.map((penalty, index) => (
              <div key={index} className="flex justify-between items-center bg-white p-1 rounded mb-1 text-sm">
                <span className="text-purple-600">{penalty}</span>
                <button onClick={() => removePenalty(index)} className="text-red-500 hover:text-red-700">
                  <X size={16} />
                </button>
              </div>
            ))}
          </div>
        </div>

        <div className="flex justify-center mb-4">
          <div className="relative w-48 h-48 md:w-64 md:h-64">
            <svg className="w-full h-full" viewBox="0 0 100 100" ref={wheelRef}>
              <g transform={`rotate(${rotationAngle}, 50, 50)`} style={{transition: 'transform 5s cubic-bezier(0.25, 0.1, 0.25, 1)'}}>
                {remainingParticipants.map((participant, index) => {
                  const total = remainingParticipants.length;
                  const angle = (index * 360) / total;
                  const nextAngle = ((index + 1) * 360) / total;
                  const textProps = calculateTextProps(index, total, penalties[index % penalties.length]);
                  return (
                    <g key={index}>
                      <path 
                        d={`M50 50 L${50 + 48 * Math.cos(angle * Math.PI / 180)} ${50 + 48 * Math.sin(angle * Math.PI / 180)} A48 48 0 0 1 ${50 + 48 * Math.cos(nextAngle * Math.PI / 180)} ${50 + 48 * Math.sin(nextAngle * Math.PI / 180)} Z`} 
                        fill={getColor(index, total)} 
                      />
                      <text 
                        x={textProps.x} 
                        y={textProps.y} 
                        fill="white" 
                        fontSize="3"
                        fontWeight="bold" 
                        textAnchor="middle"
                        dominantBaseline="middle"
                        transform={`rotate(${textProps.rotate}, ${textProps.x}, ${textProps.y})`}
                      >
                        {textProps.text}
                      </text>
                    </g>
                  );
                })}
              </g>
              <circle cx="50" cy="50" r="3" fill="#3f3f46" />
              <path d="M50 5 L55 15 L50 12 L45 15 Z" fill="#3f3f46" />
            </svg>
            <button onClick={spinWheel} disabled={isSpinning || remainingParticipants.length === 0} 
                    className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 
                               bg-yellow-400 text-gray-800 p-2 rounded-full hover:bg-yellow-500 
                               transition duration-300 font-bold text-sm shadow-lg disabled:opacity-50 disabled:cursor-not-allowed">
              {isSpinning ? '돌아가는 중...' : remainingParticipants.length === 0 ? '게임 종료' : '돌리기!'}
            </button>
          </div>
        </div>

        <div className="mt-4 p-2 bg-gradient-to-r from-pink-200 to-purple-200 rounded-lg">
          <h2 className="font-bold text-xl text-gray-800 mb-2 text-center">🏆 게임 결과 🏆</h2>
          {gameResults.map((result, index) => (
            <div key={index} className="mb-1 text-center text-sm">
              <span className="font-semibold text-pink-600">{result.participant}</span>
              : <span className="font-semibold text-purple-600">{result.penalty}</span>
            </div>
          ))}
          {remainingParticipants.length > 0 && (
            <p className="text-center mt-2 text-sm">
              남은 참가자: <span className="font-bold text-green-600">{remainingParticipants.length}</span>명
            </p>
          )}
        </div>

        <div className="mt-4 flex justify-center">
          <button onClick={resetGame} className="bg-blue-500 text-white p-2 rounded hover:bg-blue-600 transition duration-300 text-sm">
            <RefreshCw size={16} className="inline mr-1" /> 게임 초기화
          </button>
        </div>

        {showFireworks && (
          <div className="fixed top-0 left-0 w-full h-full pointer-events-none">
            {[...Array(20)].map((_, i) => (
              <div key={i} 
                   className="absolute w-2 h-2 bg-yellow-400 rounded-full animate-firework"
                   style={{
                     left: `${Math.random() * 100}%`,
                     top: `${Math.random() * 100}%`,
                     animationDelay: `${Math.random() * 2}s`
                   }}></div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default MultiSpinWheelOfFortune;