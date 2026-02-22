import { GRID_SIZE } from '../lib/game';

interface BoardProps {
  cells: boolean[][];
  hits: Set<string>;
  misses: Set<string>;
  showShips?: boolean;
  shipCells?: Set<string>;
  onCellClick?: (x: number, y: number) => void;
  onCellHover?: (x: number, y: number) => void;
  onMouseLeave?: () => void;
  disabled?: boolean;
  label: string;
  highlightCells?: Set<string>;
  invalidHighlight?: boolean;
}

const COL_LABELS = 'ABCDEFGHIJ';

export default function Board({
  hits,
  misses,
  showShips,
  shipCells,
  onCellClick,
  onCellHover,
  onMouseLeave,
  disabled,
  label,
  highlightCells,
  invalidHighlight,
}: BoardProps) {
  return (
    <div className="flex flex-col items-center">
      <h3 className="text-sm font-bold mb-2 tracking-widest uppercase text-cyan-400">{label}</h3>
      <div
        className="inline-grid gap-px bg-slate-950 p-1 rounded-lg border border-cyan-900/40"
        onMouseLeave={onMouseLeave}
      >
        {/* Header row */}
        <div className="grid grid-cols-11 gap-px">
          <div className="w-8 h-8" />
          {Array.from({ length: GRID_SIZE }, (_, i) => (
            <div key={i} className="w-8 h-8 flex items-center justify-center text-[10px] text-cyan-700 font-mono font-bold">
              {COL_LABELS[i]}
            </div>
          ))}
        </div>
        {/* Grid rows */}
        {Array.from({ length: GRID_SIZE }, (_, y) => (
          <div key={y} className="grid grid-cols-11 gap-px">
            <div className="w-8 h-8 flex items-center justify-center text-[10px] text-cyan-700 font-mono font-bold">
              {y + 1}
            </div>
            {Array.from({ length: GRID_SIZE }, (_, x) => {
              const key = `${x},${y}`;
              const isHit = hits.has(key);
              const isMiss = misses.has(key);
              const isShip = showShips && shipCells?.has(key);
              const isHighlight = highlightCells?.has(key);

              let cellClass = 'ocean-cell';
              if (isHit) cellClass = 'hit-cell animate-explosion';
              else if (isMiss) cellClass = 'miss-cell animate-splash';
              else if (isHighlight) cellClass = invalidHighlight ? 'invalid-preview' : 'valid-preview';
              else if (isShip) cellClass = 'ship-cell';

              const cursor = disabled || isHit || isMiss ? 'cursor-default' : 'cursor-crosshair';

              return (
                <button
                  key={x}
                  className={`w-8 h-8 ${cellClass} ${cursor} rounded-sm flex items-center justify-center border border-slate-800/50`}
                  onClick={() => !disabled && onCellClick?.(x, y)}
                  onMouseEnter={() => onCellHover?.(x, y)}
                  disabled={disabled}
                >
                  {isHit && <span className="text-orange-300 text-sm font-black drop-shadow-[0_0_4px_rgba(251,146,60,0.8)]">X</span>}
                  {isMiss && <span className="text-slate-400 text-lg leading-none">·</span>}
                </button>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
