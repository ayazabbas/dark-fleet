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

  // Compute hits/misses for display
  const makeHitMissSet = (shots: ShotRecord[]) => {
    const hits = new Set<string>();
    const misses = new Set<string>();
    for (const s of shots) {
      if (s.hit) hits.add(`${s.x},${s.y}`);
      else misses.add(`${s.x},${s.y}`);
    }
    return { hits, misses };
  };

  const p1Attack = makeHitMissSet(p1Shots); // P1's shots against P2
  const p2Attack = makeHitMissSet(p2Shots); // P2's shots against P1

  const p1HitCount = p1Shots.filter(s => s.hit).length;
  const p2HitCount = p2Shots.filter(s => s.hit).length;

  const handleShot = (x: number, y: number) => {
    if (transitioning) return;

    const targetShips = turn === 1 ? p2Ships : p1Ships;
    const currentShots = turn === 1 ? p1Shots : p2Shots;

    // Check if already shot here
    if (currentShots.some(s => s.x === x && s.y === y)) return;

    const hit = checkHit(targetShips, x, y);
    const shot: ShotRecord = { x, y, hit };

    if (turn === 1) {
      const newShots = [...p1Shots, shot];
      setP1Shots(newShots);
      const totalHits = newShots.filter(s => s.hit).length;
      if (totalHits >= TOTAL_SHIP_CELLS) {
        onGameOver(1);
        return;
      }
    } else {
      const newShots = [...p2Shots, shot];
      setP2Shots(newShots);
      const totalHits = newShots.filter(s => s.hit).length;
      if (totalHits >= TOTAL_SHIP_CELLS) {
        onGameOver(2);
        return;
      }
    }

    onShotFired(turn, x, y, hit);
    setMessage(hit ? 'HIT!' : 'Miss...');

    // Transition to next player
    setTransitioning(true);
    setTimeout(() => {
      setTurn(turn === 1 ? 2 : 1);
      setMessage('');
      setTransitioning(false);
    }, 1500);
  };

  const myShipCells = turn === 1 ? p1ShipCells : p2ShipCells;
  const myReceivedHits = turn === 1 ? p2Attack.hits : p1Attack.hits;
  const myReceivedMisses = turn === 1 ? p2Attack.misses : p1Attack.misses;
  const myAttackHits = turn === 1 ? p1Attack.hits : p2Attack.hits;
  const myAttackMisses = turn === 1 ? p1Attack.misses : p2Attack.misses;

  return (
    <div className="flex flex-col items-center gap-6">
      <div className="text-center">
        <h2 className="text-2xl font-bold text-cyan-300">
          Player {turn}'s Turn
        </h2>
        <div className="flex gap-8 mt-2 text-sm">
          <span className="text-gray-400">
            P1 Hits: <strong className={p1HitCount > 0 ? 'text-red-400' : 'text-gray-400'}>{p1HitCount}/{TOTAL_SHIP_CELLS}</strong>
          </span>
          <span className="text-gray-400">
            P2 Hits: <strong className={p2HitCount > 0 ? 'text-red-400' : 'text-gray-400'}>{p2HitCount}/{TOTAL_SHIP_CELLS}</strong>
          </span>
        </div>
      </div>

      {message && (
        <div className={`text-3xl font-black animate-bounce ${message === 'HIT!' ? 'text-red-500' : 'text-gray-400'}`}>
          {message}
        </div>
      )}

      <div className="flex gap-8 flex-wrap justify-center">
        {/* Your board (defense) */}
        <Board
          cells={[]}
          hits={myReceivedHits}
          misses={myReceivedMisses}
          showShips={true}
          shipCells={myShipCells}
          disabled={true}
          label="Your Fleet"
        />

        {/* Opponent's board (attack) */}
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

      <p className="text-gray-500 text-sm">Click on Enemy Waters to fire a shot</p>
    </div>
  );
}
