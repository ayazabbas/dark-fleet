import { GRID_SIZE } from '../lib/game';

interface BoardProps {
  cells: boolean[][]; // true = has something to show
  hits: Set<string>;  // "x,y" format
  misses: Set<string>;
  showShips?: boolean;
  shipCells?: Set<string>;
  onCellClick?: (x: number, y: number) => void;
  disabled?: boolean;
  label: string;
  highlightCells?: Set<string>; // for placement preview
  invalidHighlight?: boolean;
}

const COL_LABELS = 'ABCDEFGHIJ';

export default function Board({
  hits,
  misses,
  showShips,
  shipCells,
  onCellClick,
  disabled,
  label,
  highlightCells,
  invalidHighlight,
}: BoardProps) {
  return (
    <div className="flex flex-col items-center">
      <h3 className="text-lg font-bold mb-2 text-cyan-400">{label}</h3>
      <div className="inline-grid gap-0.5 bg-gray-800 p-1 rounded-lg">
        {/* Header row */}
        <div className="grid grid-cols-11 gap-0.5">
          <div className="w-8 h-8" />
          {Array.from({ length: GRID_SIZE }, (_, i) => (
            <div key={i} className="w-8 h-8 flex items-center justify-center text-xs text-gray-400 font-mono">
              {COL_LABELS[i]}
            </div>
          ))}
        </div>
        {/* Grid rows */}
        {Array.from({ length: GRID_SIZE }, (_, y) => (
          <div key={y} className="grid grid-cols-11 gap-0.5">
            <div className="w-8 h-8 flex items-center justify-center text-xs text-gray-400 font-mono">
              {y + 1}
            </div>
            {Array.from({ length: GRID_SIZE }, (_, x) => {
              const key = `${x},${y}`;
              const isHit = hits.has(key);
              const isMiss = misses.has(key);
              const isShip = showShips && shipCells?.has(key);
              const isHighlight = highlightCells?.has(key);

              let bg = 'bg-blue-900/50 hover:bg-blue-800/70'; // water
              if (isHit) bg = 'bg-red-600'; // hit
              else if (isMiss) bg = 'bg-gray-500'; // miss
              else if (isHighlight) bg = invalidHighlight ? 'bg-red-400/60' : 'bg-green-400/60';
              else if (isShip) bg = 'bg-gray-400'; // ship

              const cursor = disabled || isHit || isMiss ? 'cursor-default' : 'cursor-crosshair';

              return (
                <button
                  key={x}
                  className={`w-8 h-8 ${bg} ${cursor} rounded-sm transition-colors duration-100 border border-blue-900/30`}
                  onClick={() => !disabled && onCellClick?.(x, y)}
                  disabled={disabled}
                >
                  {isHit && <span className="text-white text-sm font-bold">X</span>}
                  {isMiss && <span className="text-gray-300 text-xs">~</span>}
                </button>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
