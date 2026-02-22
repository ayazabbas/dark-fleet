import { useState, useMemo, useEffect, useCallback } from 'react';
import Board from './Board';
import type { Ship, Orientation } from '../lib/game';
import {
  SHIP_LENGTHS,
  SHIP_NAMES,
  getShipCells,
  isValidPlacement,
  hasCollision,
} from '../lib/game';

interface ShipPlacementProps {
  playerName: string;
  onConfirm: (ships: Ship[]) => void;
}

export default function ShipPlacement({ playerName, onConfirm }: ShipPlacementProps) {
  const [placedShips, setPlacedShips] = useState<Ship[]>([]);
  const [currentShipIndex, setCurrentShipIndex] = useState(0);
  const [orientation, setOrientation] = useState<Orientation>(0);
  const [hoverPos, setHoverPos] = useState<[number, number] | null>(null);

  const allPlaced = currentShipIndex >= SHIP_LENGTHS.length;
  const currentLength = allPlaced ? 0 : SHIP_LENGTHS[currentShipIndex];
  const currentName = allPlaced ? '' : SHIP_NAMES[currentShipIndex];

  const toggleOrientation = useCallback(() => {
    setOrientation(prev => prev === 0 ? 1 : 0);
  }, []);

  // Keyboard shortcut: R to rotate
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'r' || e.key === 'R') {
        toggleOrientation();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [toggleOrientation]);

  // Compute ship cells set for display
  const shipCells = useMemo(() => {
    const set = new Set<string>();
    for (const ship of placedShips) {
      for (const [x, y] of getShipCells(ship)) {
        set.add(`${x},${y}`);
      }
    }
    return set;
  }, [placedShips]);

  // Compute hover preview cells
  const { highlightCells, isInvalidPlacement } = useMemo(() => {
    if (!hoverPos || allPlaced) return { highlightCells: new Set<string>(), isInvalidPlacement: false };
    const [hx, hy] = hoverPos;
    const previewShip: Ship = { x: hx, y: hy, orientation, length: currentLength, name: currentName };
    const valid = isValidPlacement(previewShip) && !hasCollision(previewShip, placedShips);
    const cells = new Set<string>();
    if (isValidPlacement(previewShip)) {
      for (const [cx, cy] of getShipCells(previewShip)) {
        cells.add(`${cx},${cy}`);
      }
    }
    return { highlightCells: cells, isInvalidPlacement: !valid };
  }, [hoverPos, orientation, currentLength, currentName, placedShips, allPlaced]);

  const handleCellClick = (x: number, y: number) => {
    if (allPlaced) return;
    const ship: Ship = { x, y, orientation, length: currentLength, name: currentName };
    if (!isValidPlacement(ship) || hasCollision(ship, placedShips)) return;
    setPlacedShips([...placedShips, ship]);
    setCurrentShipIndex(currentShipIndex + 1);
    setHoverPos(null);
  };

  const handleCellHover = (x: number, y: number) => {
    if (!allPlaced) {
      setHoverPos([x, y]);
    }
  };

  const handleUndo = () => {
    if (placedShips.length === 0) return;
    setPlacedShips(placedShips.slice(0, -1));
    setCurrentShipIndex(currentShipIndex - 1);
  };

  return (
    <div className="flex flex-col items-center gap-5">
      <h2 className="text-2xl font-black tracking-tight text-cyan-300">{playerName} — Place Your Fleet</h2>

      {!allPlaced ? (
        <div className="bg-slate-800/60 rounded-lg px-5 py-3 border border-slate-700 text-center">
          <div className="text-gray-300 text-sm">
            Now placing: <strong className="text-white text-base">{currentName}</strong>
            <span className="text-cyan-400 ml-1">({currentLength} cells)</span>
          </div>
          <div className="flex items-center justify-center gap-3 mt-2">
            <button
              className="px-3 py-1.5 bg-cyan-700 hover:bg-cyan-600 rounded text-sm font-medium transition-colors flex items-center gap-1.5"
              onClick={toggleOrientation}
            >
              <span className="text-base">{orientation === 0 ? '↔' : '↕'}</span>
              {orientation === 0 ? 'Horizontal' : 'Vertical'}
            </button>
            <span className="text-slate-500 text-xs">Press <kbd className="bg-slate-700 px-1.5 py-0.5 rounded text-cyan-300 font-mono">R</kbd> to rotate</span>
          </div>
        </div>
      ) : (
        <div className="bg-emerald-900/30 border border-emerald-700 rounded-lg px-5 py-3 text-center">
          <p className="text-emerald-300 font-medium">All ships placed! Confirm your fleet below.</p>
        </div>
      )}

      <Board
        cells={[]}
        hits={new Set()}
        misses={new Set()}
        showShips={true}
        shipCells={shipCells}
        onCellClick={handleCellClick}
        onCellHover={handleCellHover}
        onMouseLeave={() => setHoverPos(null)}
        disabled={allPlaced}
        label="Your Board"
        highlightCells={highlightCells}
        invalidHighlight={isInvalidPlacement}
      />

      {/* Ship list */}
      <div className="flex gap-2 flex-wrap justify-center">
        {SHIP_NAMES.map((name, i) => {
          const length = SHIP_LENGTHS[i];
          const placed = i < placedShips.length;
          const current = i === currentShipIndex && !allPlaced;
          return (
            <div
              key={name}
              className={`px-3 py-1.5 rounded text-sm font-medium flex items-center gap-1.5 transition-all ${
                placed
                  ? 'bg-emerald-800/60 text-emerald-300 border border-emerald-700/50'
                  : current
                  ? 'bg-cyan-800/60 text-cyan-200 border border-cyan-600/50 ring-1 ring-cyan-500/40'
                  : 'bg-slate-800/60 text-slate-500 border border-slate-700/50'
              }`}
            >
              {placed && <span>✓</span>}
              {name}
              <span className="text-xs opacity-60">
                {'■'.repeat(length)}
              </span>
            </div>
          );
        })}
      </div>

      <div className="flex gap-3">
        <button
          className="px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded font-medium disabled:opacity-30 disabled:cursor-not-allowed transition-colors text-sm"
          onClick={handleUndo}
          disabled={placedShips.length === 0}
        >
          Undo Last
        </button>
        <button
          className="px-6 py-2 bg-cyan-600 hover:bg-cyan-500 rounded font-bold disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          onClick={() => onConfirm(placedShips)}
          disabled={!allPlaced}
        >
          Confirm Fleet
        </button>
      </div>
    </div>
  );
}
