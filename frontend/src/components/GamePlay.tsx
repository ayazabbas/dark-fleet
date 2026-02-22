import { useState, useMemo } from 'react';
import Board from './Board';
import type { SonarResult } from './Board';
import type { Ship } from '../lib/game';
import { getShipCells, checkHit, sonarCount, getSonarCells, TOTAL_SHIP_CELLS } from '../lib/game';

interface GamePlayProps {
  currentPlayer: 1 | 2;
  p1Ships: Ship[];
  p2Ships: Ship[];
  onGameOver: (winner: 1 | 2) => void;
  onShotFired: (shooter: 1 | 2, x: number, y: number, hit: boolean) => void;
  onSonarUsed: (user: 1 | 2, centerX: number, centerY: number, count: number) => void;
}

interface ShotRecord {
  x: number;
  y: number;
  hit: boolean;
}

export default function GamePlay({
  currentPlayer: initialPlayer,
  p1Ships,
  p2Ships,
  onGameOver,
  onShotFired,
  onSonarUsed,
}: GamePlayProps) {
  const [turn, setTurn] = useState<1 | 2>(initialPlayer);
  const [p1Shots, setP1Shots] = useState<ShotRecord[]>([]);
  const [p2Shots, setP2Shots] = useState<ShotRecord[]>([]);
  const [message, setMessage] = useState('');
  const [transitioning, setTransitioning] = useState(false);
  const [showTransitionScreen, setShowTransitionScreen] = useState(false);
  const [sonarMode, setSonarMode] = useState(false);
  const [sonarHover, setSonarHover] = useState<{ x: number; y: number } | null>(null);
  const [p1TurnsTaken, setP1TurnsTaken] = useState(0);
  const [p2TurnsTaken, setP2TurnsTaken] = useState(0);
  const [p1SonarUsed, setP1SonarUsed] = useState(false);
  const [p2SonarUsed, setP2SonarUsed] = useState(false);
  const [p1SonarResults, setP1SonarResults] = useState<SonarResult[]>([]);
  const [p2SonarResults, setP2SonarResults] = useState<SonarResult[]>([]);

  const p1ShipCells = useMemo(() => {
    const set = new Set<string>();
    for (const ship of p1Ships) {
      for (const [x, y] of getShipCells(ship)) set.add(`${x},${y}`);
    }
    return set;
  }, [p1Ships]);

  const p2ShipCells = useMemo(() => {
    const set = new Set<string>();
    for (const ship of p2Ships) {
      for (const [x, y] of getShipCells(ship)) set.add(`${x},${y}`);
    }
    return set;
  }, [p2Ships]);

  const makeHitMissSet = (shots: ShotRecord[]) => {
    const hits = new Set<string>();
    const misses = new Set<string>();
    for (const s of shots) {
      if (s.hit) hits.add(`${s.x},${s.y}`);
      else misses.add(`${s.x},${s.y}`);
    }
    return { hits, misses };
  };

  const p1Attack = makeHitMissSet(p1Shots);
  const p2Attack = makeHitMissSet(p2Shots);

  const p1HitCount = p1Shots.filter(s => s.hit).length;
  const p2HitCount = p2Shots.filter(s => s.hit).length;

  const turnsTaken = turn === 1 ? p1TurnsTaken : p2TurnsTaken;
  const sonarUsed = turn === 1 ? p1SonarUsed : p2SonarUsed;
  const sonarAvailable = !sonarUsed && turnsTaken > 0 && turnsTaken % 3 === 0;

  const handleShot = (x: number, y: number) => {
    if (transitioning) return;

    if (sonarMode) {
      handleSonar(x, y);
      return;
    }

    const targetShips = turn === 1 ? p2Ships : p1Ships;
    const currentShots = turn === 1 ? p1Shots : p2Shots;

    if (currentShots.some(s => s.x === x && s.y === y)) return;

    const hit = checkHit(targetShips, x, y);
    const shot: ShotRecord = { x, y, hit };

    // Increment turns
    if (turn === 1) {
      setP1TurnsTaken(p1TurnsTaken + 1);
      const newShots = [...p1Shots, shot];
      setP1Shots(newShots);
      const totalHits = newShots.filter(s => s.hit).length;
      if (totalHits >= TOTAL_SHIP_CELLS) {
        onShotFired(turn, x, y, hit);
        onGameOver(1);
        return;
      }
    } else {
      setP2TurnsTaken(p2TurnsTaken + 1);
      const newShots = [...p2Shots, shot];
      setP2Shots(newShots);
      const totalHits = newShots.filter(s => s.hit).length;
      if (totalHits >= TOTAL_SHIP_CELLS) {
        onShotFired(turn, x, y, hit);
        onGameOver(2);
        return;
      }
    }

    onShotFired(turn, x, y, hit);
    setMessage(hit ? 'DIRECT HIT!' : 'Miss...');
    setTransitioning(true);

    setTimeout(() => {
      setMessage('');
      setShowTransitionScreen(true);
    }, 1200);
  };

  const handleSonar = (centerX: number, centerY: number) => {
    const targetShips = turn === 1 ? p2Ships : p1Ships;
    const count = sonarCount(targetShips, centerX, centerY);
    const cells = new Set(getSonarCells(centerX, centerY));

    const result: SonarResult = { cells, count, centerX, centerY };

    if (turn === 1) {
      setP1SonarResults([...p1SonarResults, result]);
      setP1SonarUsed(true);
      setP1TurnsTaken(p1TurnsTaken + 1);
    } else {
      setP2SonarResults([...p2SonarResults, result]);
      setP2SonarUsed(true);
      setP2TurnsTaken(p2TurnsTaken + 1);
    }

    onSonarUsed(turn, centerX, centerY, count);
    setSonarMode(false);
    setSonarHover(null);

    const colorWord = count === 0 ? 'CLEAR' : count <= 2 ? 'WARM' : 'HOT';
    setMessage(`SONAR: ${count} ship cells detected — ${colorWord}!`);
    setTransitioning(true);

    setTimeout(() => {
      setMessage('');
      setShowTransitionScreen(true);
    }, 1800);
  };

  const handleContinue = () => {
    setTurn(turn === 1 ? 2 : 1);
    setShowTransitionScreen(false);
    setTransitioning(false);
    setSonarMode(false);
    setSonarHover(null);
  };

  // Turn transition screen
  if (showTransitionScreen) {
    const nextPlayer = turn === 1 ? 2 : 1;
    return (
      <div className="flex flex-col items-center justify-center gap-6 py-12">
        <div className="text-6xl">⚓</div>
        <h2 className="text-3xl font-black text-cyan-300">Player {nextPlayer}'s Turn</h2>
        <p className="text-slate-400">Make sure Player {turn} has looked away!</p>
        <button
          className="px-8 py-3 bg-cyan-600 hover:bg-cyan-500 rounded-lg font-bold text-lg transition-colors mt-4"
          onClick={handleContinue}
        >
          Ready — Show My Board
        </button>
      </div>
    );
  }

  const myShipCells = turn === 1 ? p1ShipCells : p2ShipCells;
  const myReceivedHits = turn === 1 ? p2Attack.hits : p1Attack.hits;
  const myReceivedMisses = turn === 1 ? p2Attack.misses : p1Attack.misses;
  const myAttackHits = turn === 1 ? p1Attack.hits : p2Attack.hits;
  const myAttackMisses = turn === 1 ? p1Attack.misses : p2Attack.misses;
  const mySonarResults = turn === 1 ? p1SonarResults : p2SonarResults;

  // Build sonar hover highlight
  const sonarHoverCells = sonarMode && sonarHover
    ? new Set(getSonarCells(sonarHover.x, sonarHover.y))
    : undefined;

  return (
    <div className="flex flex-col items-center gap-5">
      <div className="text-center">
        <h2 className="text-2xl font-black text-cyan-300">
          Player {turn}'s Turn
        </h2>
        <p className="text-slate-500 text-sm mt-1">
          {sonarMode ? 'Select sonar center on Enemy Waters' : 'Select a target on Enemy Waters'}
        </p>
      </div>

      {/* Score bar */}
      <div className="flex gap-6 items-center">
        <div className={`text-center px-4 py-2 rounded-lg border ${turn === 1 ? 'bg-cyan-900/30 border-cyan-700' : 'bg-slate-800/60 border-slate-700'}`}>
          <div className="text-xs text-slate-400 uppercase tracking-wide">Player 1</div>
          <div className="text-lg font-black">
            <span className={p1HitCount > 0 ? 'text-red-400' : 'text-slate-500'}>{p1HitCount}</span>
            <span className="text-slate-600">/{TOTAL_SHIP_CELLS}</span>
          </div>
          <div className="w-24 h-1 bg-slate-700 rounded-full mt-1">
            <div className="h-full bg-red-500 rounded-full transition-all" style={{ width: `${(p1HitCount / TOTAL_SHIP_CELLS) * 100}%` }} />
          </div>
        </div>
        <span className="text-slate-600 font-bold text-sm">VS</span>
        <div className={`text-center px-4 py-2 rounded-lg border ${turn === 2 ? 'bg-cyan-900/30 border-cyan-700' : 'bg-slate-800/60 border-slate-700'}`}>
          <div className="text-xs text-slate-400 uppercase tracking-wide">Player 2</div>
          <div className="text-lg font-black">
            <span className={p2HitCount > 0 ? 'text-red-400' : 'text-slate-500'}>{p2HitCount}</span>
            <span className="text-slate-600">/{TOTAL_SHIP_CELLS}</span>
          </div>
          <div className="w-24 h-1 bg-slate-700 rounded-full mt-1">
            <div className="h-full bg-red-500 rounded-full transition-all" style={{ width: `${(p2HitCount / TOTAL_SHIP_CELLS) * 100}%` }} />
          </div>
        </div>
      </div>

      {/* Sonar button */}
      <div className="flex gap-3 items-center">
        {sonarAvailable && !transitioning && (
          <button
            className={`px-4 py-2 rounded-lg font-bold text-sm transition-all ${
              sonarMode
                ? 'bg-violet-600 text-white shadow-lg shadow-violet-900/50'
                : 'bg-slate-800 text-violet-400 border border-violet-700 hover:bg-violet-900/30'
            }`}
            onClick={() => {
              setSonarMode(!sonarMode);
              setSonarHover(null);
            }}
          >
            {sonarMode ? 'Cancel Sonar' : 'Use Sonar Ping'}
          </button>
        )}
        {sonarAvailable && !transitioning && !sonarMode && (
          <span className="text-xs text-violet-400/60">3x3 area scan available</span>
        )}
        {!sonarAvailable && !sonarUsed && !transitioning && (
          <span className="text-xs text-slate-600">
            Sonar available in {turnsTaken === 0 ? 3 : 3 - (turnsTaken % 3)} turns
          </span>
        )}
        {sonarUsed && !transitioning && (
          <span className="text-xs text-slate-600">Sonar used</span>
        )}
      </div>

      {/* Hit/Miss/Sonar message */}
      {message && (
        <div className={`text-3xl font-black ${
          message.includes('HIT') ? 'text-red-400 animate-bounce'
          : message.includes('SONAR') ? 'text-violet-400'
          : 'text-slate-500'
        }`}>
          {message}
        </div>
      )}

      <div className="flex gap-8 flex-wrap justify-center">
        <Board
          cells={[]}
          hits={myReceivedHits}
          misses={myReceivedMisses}
          showShips={true}
          shipCells={myShipCells}
          disabled={true}
          label="Your Fleet"
        />
        <Board
          cells={[]}
          hits={myAttackHits}
          misses={myAttackMisses}
          showShips={false}
          onCellClick={handleShot}
          onCellHover={(x, y) => sonarMode && setSonarHover({ x, y })}
          onMouseLeave={() => setSonarHover(null)}
          disabled={transitioning}
          label="Enemy Waters"
          sonarHighlight={sonarHoverCells}
          sonarResults={mySonarResults}
        />
      </div>
    </div>
  );
}
