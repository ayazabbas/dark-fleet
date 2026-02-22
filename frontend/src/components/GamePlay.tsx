import { useState, useMemo } from 'react';
import Board from './Board';
import type { Ship } from '../lib/game';
import { getShipCells, checkHit, TOTAL_SHIP_CELLS } from '../lib/game';

interface GamePlayProps {
  currentPlayer: 1 | 2;
  p1Ships: Ship[];
  p2Ships: Ship[];
  onGameOver: (winner: 1 | 2) => void;
  onShotFired: (shooter: 1 | 2, x: number, y: number, hit: boolean) => void;
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
}: GamePlayProps) {
  const [turn, setTurn] = useState<1 | 2>(initialPlayer);
  const [p1Shots, setP1Shots] = useState<ShotRecord[]>([]);
  const [p2Shots, setP2Shots] = useState<ShotRecord[]>([]);
  const [message, setMessage] = useState('');
  const [transitioning, setTransitioning] = useState(false);
  const [showTransitionScreen, setShowTransitionScreen] = useState(false);

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

  const handleShot = (x: number, y: number) => {
    if (transitioning) return;

    const targetShips = turn === 1 ? p2Ships : p1Ships;
    const currentShots = turn === 1 ? p1Shots : p2Shots;

    if (currentShots.some(s => s.x === x && s.y === y)) return;

    const hit = checkHit(targetShips, x, y);
    const shot: ShotRecord = { x, y, hit };

    if (turn === 1) {
      const newShots = [...p1Shots, shot];
      setP1Shots(newShots);
      const totalHits = newShots.filter(s => s.hit).length;
      if (totalHits >= TOTAL_SHIP_CELLS) {
        onShotFired(turn, x, y, hit);
        onGameOver(1);
        return;
      }
    } else {
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

  const handleContinue = () => {
    setTurn(turn === 1 ? 2 : 1);
    setShowTransitionScreen(false);
    setTransitioning(false);
  };

  // Turn transition screen (prevents seeing opponent's board)
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

  return (
    <div className="flex flex-col items-center gap-5">
      <div className="text-center">
        <h2 className="text-2xl font-black text-cyan-300">
          Player {turn}'s Turn
        </h2>
        <p className="text-slate-500 text-sm mt-1">Select a target on Enemy Waters</p>
      </div>

      {/* Score bar */}
      <div className="flex gap-6 items-center">
        <div className={`text-center px-4 py-2 rounded-lg border ${turn === 1 ? 'bg-cyan-900/30 border-cyan-700' : 'bg-slate-800/60 border-slate-700'}`}>
          <div className="text-xs text-slate-400 uppercase tracking-wide">Player 1</div>
          <div className="text-lg font-black">
            <span className={p1HitCount > 0 ? 'text-red-400' : 'text-slate-500'}>{p1HitCount}</span>
            <span className="text-slate-600">/{TOTAL_SHIP_CELLS}</span>
          </div>
          {/* Hit progress bar */}
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

      {/* Hit/Miss message */}
      {message && (
        <div className={`text-3xl font-black ${message.includes('HIT') ? 'text-red-400 animate-bounce' : 'text-slate-500'}`}>
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
          disabled={transitioning}
          label="Enemy Waters"
        />
      </div>
    </div>
  );
}
