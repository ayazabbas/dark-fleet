import { useState, useMemo } from 'react';
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

  const handleUndo = () => {
    if (placedShips.length === 0) return;
    setPlacedShips(placedShips.slice(0, -1));
    setCurrentShipIndex(currentShipIndex - 1);
  };

  return (
    <div className="flex flex-col items-center gap-6">
      <h2 className="text-2xl font-bold text-cyan-300">{playerName} - Place Your Ships</h2>

      {!allPlaced && (
        <div className="flex items-center gap-4 text-gray-300">
          <span>
            Placing: <strong className="text-white">{currentName}</strong> (length {currentLength})
          </span>
          <button
            className="px-3 py-1 bg-cyan-700 hover:bg-cyan-600 rounded text-sm font-medium transition-colors"
            onClick={() => setOrientation(orientation === 0 ? 1 : 0)}
          >
            {orientation === 0 ? 'Horizontal' : 'Vertical'} (click to rotate)
          </button>
        </div>
      )}

      <div
        onMouseLeave={() => setHoverPos(null)}
      >
        <Board
          cells={[]}
          hits={new Set()}
          misses={new Set()}
          showShips={true}
          shipCells={shipCells}
          onCellClick={handleCellClick}
          disabled={allPlaced}
          label="Your Board"
          highlightCells={highlightCells}
          invalidHighlight={isInvalidPlacement}
        />
        {/* Invisible overlay to track mouse position on the grid */}
        <div
          className="absolute inset-0"
          style={{ pointerEvents: 'none' }}
        />
      </div>

      {/* Ship list */}
      <div className="flex gap-2 flex-wrap justify-center">
        {SHIP_NAMES.map((name, i) => (
          <div
            key={name}
            className={`px-3 py-1 rounded text-sm ${
              i < placedShips.length
                ? 'bg-green-700 text-white'
                : i === currentShipIndex
                ? 'bg-cyan-700 text-white animate-pulse'
                : 'bg-gray-700 text-gray-400'
            }`}
          >
            {name} ({SHIP_LENGTHS[i]})
          </div>
        ))}
      </div>

      <div className="flex gap-3">
        <button
          className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded font-medium disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          onClick={handleUndo}
          disabled={placedShips.length === 0}
        >
          Undo
        </button>
        <button
          className="px-6 py-2 bg-cyan-600 hover:bg-cyan-500 rounded font-bold disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          onClick={() => onConfirm(placedShips)}
          disabled={!allPlaced}
        >
          Confirm Placement
        </button>
      </div>

      <p className="text-gray-500 text-sm">Click a cell to place a ship. Click the rotate button or press R to change orientation.</p>
    </div>
  );
}
