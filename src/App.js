import React, { useState, useEffect, useRef } from 'react';
import { Plus, X, Volume2, User, Award, RefreshCw } from 'lucide-react';

const MultiSpinWheelOfFortune = () => {
  const [participants, setParticipants] = useState([]);
  const [penalties, setPenalties] = useState([]);
  const [newParticipant, setNewParticipant] = useState('');
  const [newPenalty, setNewPenalty] = useState('');
  const [isSpinning, setIsSpinning] = useState(false);
  const [rotationAngle, setRotationAngle] = useState(0);
  const [result, setResult] = useState(null);
  const [showFireworks, setShowFireworks] = useState(false);
  const [remainingParticipants, setRemainingParticipants] = useState([]);
  const [gameResults, setGameResults] = useState([]);
  const wheelRef = useRef(null);

  const addParticipant = () => {
    if (newParticipant.trim() !== '') {
      setParticipants([...participants, newParticipant.trim()]);
      setNewParticipant('');
    }
  };

  const addPenalty = () => {
    if (newPenalty.trim() !== '') {
      setPenalties([...penalties, newPenalty.trim()]);
      setNewPenalty('');
    }
  };

  const removeParticipant = (index) => {
    setParticipants(participants.filter((_, i) => i !== index));
  };

  const removePenalty = (index) => {
    setPenalties(penalties.filter((_, i) => i !== index));
  };

  const getColor = (index, total) => {
    const hue = (index * (360 / total)) % 360;
    return `hsl(${hue}, 70%, 50%)`;
  };

  const spinWheel = () => {
    if (remainingParticipants.length > 0 && penalties.length > 0 && !isSpinning) {
      setIsSpinning(true);
      playSound('spinning');
      
      const randomAngle = Math.floor(Math.random() * 360);
      const rotations = 5 * 360; // 5 full rotations
      const finalAngle = rotations + randomAngle;
      
      setRotationAngle(finalAngle);
      
      setTimeout(() => {
        const selectedIndex = getSelectedIndex(finalAngle % 360);
        const selectedParticipant = remainingParticipants[selectedIndex];
        const selectedPenalty = penalties[selectedIndex % penalties.length];
        
        setResult({ participant: selectedParticipant, penalty: selectedPenalty });
        setGameResults([...gameResults, { participant: selectedParticipant, penalty: selectedPenalty }]);
        setRemainingParticipants(remainingParticipants.filter(p => p !== selectedParticipant));
        
        setIsSpinning(false);
        playSound('fanfare');
        setShowFireworks(true);
        setTimeout(() => setShowFireworks(false), 3000);
      }, 5000); // Match this with the CSS animation duration
    }
  };

  const getSelectedIndex = (angle) => {
    const sectionAngle = 360 / remainingParticipants.length;
    return Math.floor(((360 - angle + sectionAngle / 2) % 360) / sectionAngle);
  };

  const playSound = (sound) => {
    console.log(`Playing sound: ${sound}`);
  };

  const calculateTextProps = (index, total, text) => {
    const angle = ((index + 0.5) * (360 / total)) % 360;
    const radius = 38; // Slightly smaller than the wheel radius to fit text inside
    const x = 50 + radius * Math.cos(angle * Math.PI / 180);
    const y = 50 + radius * Math.sin(angle * Math.PI / 180);
    const rotation = angle > 90 && angle < 270 ? angle + 180 : angle;
    
    return {
      x, 
      y, 
      rotate: rotation,
      text: text.length > 10 ? text.slice(0, 10) + '...' : text
    };
  };

  const resetGame = () => {
    setRemainingParticipants([...participants]);
    setGameResults([]);
    setResult(null);
    setRotationAngle(0);
  };

  useEffect(() => {
    setRemainingParticipants([...participants]);
  }, [participants]);

  return (
    <div className="p-4 bg-gradient-to-br from-yellow-400 via-red-500 to-pink-500 min-h-screen flex items-center justify-center font-sans">
      <div className="bg-white rounded-lg shadow-xl p-6 max-w-2xl w-full">
        <h1 className="text-3xl font-bold text-center text-pink-600 mb-6">🎉 다중 회전 운명의 룰렛 🎊</h1>
        
        <div className="grid grid-cols-2 gap-4 mb-6">
          <div>
            <h2 className="text-xl font-semibold mb-2 text-pink-500"><User className="inline mr-2" />참가자</h2>
            <input
              type="text"
              value={newParticipant}
              onChange={(e) => setNewParticipant(e.target.value)}
              className="w-full p-2 border border-pink-300 rounded mb-2 focus:outline-none focus:ring-2 focus:ring-pink-400"
              placeholder="참가자 이름"
            />
            <button onClick={addParticipant} className="w-full bg-pink-500 text-white p-2 rounded hover:bg-pink-600 transition duration-300">
              <Plus size={20} className="inline mr-2" /> 참가자 추가
            </button>
          </div>
          <div>
            <h2 className="text-xl font-semibold mb-2 text-purple-500"><Award className="inline mr-2" />벌칙/순번</h2>
            <input
              type="text"
              value={newPenalty}
              onChange={(e) => setNewPenalty(e.target.value)}
              className="w-full p-2 border border-purple-300 rounded mb-2 focus:outline-none focus:ring-2 focus:ring-purple-400"
              placeholder="벌칙 또는 순번"
            />
            <button onClick={addPenalty} className="w-full bg-purple-500 text-white p-2 rounded hover:bg-purple-600 transition duration-300">
              <Plus size={20} className="inline mr-2" /> 벌칙/순번 추가
            </button>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4 mb-6">
          <div className="max-h-40 overflow-y-auto bg-pink-50 p-2 rounded">
            {participants.map((participant, index) => (
              <div key={index} className="flex justify-between items-center bg-white p-2 rounded mb-2 shadow">
                <span className="text-pink-600">{participant}</span>
                <button onClick={() => removeParticipant(index)} className="text-red-500 hover:text-red-700">
                  <X size={20} />
                </button>
              </div>
            ))}
          </div>
          <div className="max-h-40 overflow-y-auto bg-purple-50 p-2 rounded">
            {penalties.map((penalty, index) => (
              <div key={index} className="flex justify-between items-center bg-white p-2 rounded mb-2 shadow">
                <span className="text-purple-600">{penalty}</span>
                <button onClick={() => removePenalty(index)} className="text-red-500 hover:text-red-700">
                  <X size={20} />
                </button>
              </div>
            ))}
          </div>
        </div>

        <div className="relative mb-6">
          <svg className="w-full h-96" viewBox="0 0 100 100" ref={wheelRef}>
            <defs>
              <filter id="shadow">
                <feDropShadow dx="0" dy="0" stdDeviation="2" floodOpacity="0.5"/>
              </filter>
            </defs>
            <circle cx="50" cy="50" r="48" fill="white" filter="url(#shadow)" />
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
                      fontSize="4"
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
                             bg-yellow-400 text-gray-800 p-4 rounded-full hover:bg-yellow-500 
                             transition duration-300 font-bold text-xl shadow-lg disabled:opacity-50 disabled:cursor-not-allowed">
            {isSpinning ? '돌아가는 중...' : remainingParticipants.length === 0 ? '게임 종료' : '돌리기!'}
          </button>
        </div>

        <div className="mt-4 p-4 bg-gradient-to-r from-pink-200 to-purple-200 rounded-lg">
          <h2 className="font-bold text-2xl text-gray-800 mb-2 text-center">🏆 게임 결과 🏆</h2>
          {gameResults.map((result, index) => (
            <div key={index} className="mb-2 text-center">
              <span className="font-semibold text-pink-600">{result.participant}</span>
              : <span className="font-semibold text-purple-600">{result.penalty}</span>
            </div>
          ))}
          {remainingParticipants.length > 0 && (
            <p className="text-center mt-2">
              남은 참가자: <span className="font-bold text-green-600">{remainingParticipants.length}</span>명
            </p>
          )}
        </div>

        <div className="mt-4 flex justify-center">
          <button onClick={resetGame} className="bg-blue-500 text-white p-2 rounded hover:bg-blue-600 transition duration-300">
            <RefreshCw size={20} className="inline mr-2" /> 게임 초기화
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

        <div className="mt-4 text-center text-gray-500">
          <Volume2 size={20} className="inline mr-2" /> 효과음 재생 중
        </div>
      </div>
    </div>
  );
};

export default MultiSpinWheelOfFortune;