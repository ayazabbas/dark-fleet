export const GRID_SIZE = 10;
export const SHIP_LENGTHS = [5, 4, 3, 3, 2] as const;
export const SHIP_NAMES = ['Carrier', 'Battleship', 'Cruiser', 'Submarine', 'Destroyer'] as const;
export const TOTAL_SHIP_CELLS = 17; // 5+4+3+3+2

export type Orientation = 0 | 1; // 0 = horizontal, 1 = vertical

export interface Ship {
  x: number;
  y: number;
  orientation: Orientation;
  length: number;
  name: string;
}

export interface Cell {
  hasShip: boolean;
  isHit: boolean;
  isMiss: boolean;
}

export type GamePhase =
  | 'setup'
  | 'place-p1'
  | 'prove-p1'
  | 'place-p2'
  | 'prove-p2'
  | 'battle'
  | 'game-over';

export interface PlayerState {
  ships: Ship[];
  boardHash: string | null;
  grid: Cell[][];
  shotsReceived: [number, number][];
}

// Convert ships to the flat array format used by the circuit: [x1,y1,z1, x2,y2,z2, ...]
export function shipsToCircuitInput(ships: Ship[]): string[] {
  const result: string[] = [];
  for (const ship of ships) {
    result.push(ship.x.toString(), ship.y.toString(), ship.orientation.toString());
  }
  return result;
}

// Get all cells occupied by a ship
export function getShipCells(ship: Ship): [number, number][] {
  const cells: [number, number][] = [];
  for (let i = 0; i < ship.length; i++) {
    if (ship.orientation === 0) {
      cells.push([ship.x + i, ship.y]);
    } else {
      cells.push([ship.x, ship.y + i]);
    }
  }
  return cells;
}

// Check if a ship placement is valid (within grid bounds)
export function isValidPlacement(ship: Ship): boolean {
  if (ship.orientation === 0) {
    return ship.x + ship.length <= GRID_SIZE && ship.y < GRID_SIZE && ship.x >= 0 && ship.y >= 0;
  } else {
    return ship.y + ship.length <= GRID_SIZE && ship.x < GRID_SIZE && ship.x >= 0 && ship.y >= 0;
  }
}

// Check if a ship overlaps with any existing ships
export function hasCollision(ship: Ship, existingShips: Ship[]): boolean {
  const newCells = getShipCells(ship);
  for (const existing of existingShips) {
    const existingCells = getShipCells(existing);
    for (const [nx, ny] of newCells) {
      for (const [ex, ey] of existingCells) {
        if (nx === ex && ny === ey) return true;
      }
    }
  }
  return false;
}

// Create an empty 10x10 grid
export function createEmptyGrid(): Cell[][] {
  return Array.from({ length: GRID_SIZE }, () =>
    Array.from({ length: GRID_SIZE }, () => ({
      hasShip: false,
      isHit: false,
      isMiss: false,
    }))
  );
}

// Check if a shot hits any ship
export function checkHit(ships: Ship[], x: number, y: number): boolean {
  for (const ship of ships) {
    for (const [cx, cy] of getShipCells(ship)) {
      if (cx === x && cy === y) return true;
    }
  }
  return false;
}

// Count ship cells in 3x3 area around (centerX, centerY), clamped to grid bounds
export function sonarCount(ships: Ship[], centerX: number, centerY: number): number {
  const minX = Math.max(0, centerX - 1);
  const maxX = Math.min(GRID_SIZE - 1, centerX + 1);
  const minY = Math.max(0, centerY - 1);
  const maxY = Math.min(GRID_SIZE - 1, centerY + 1);

  const shipCellSet = new Set<string>();
  for (const ship of ships) {
    for (const [cx, cy] of getShipCells(ship)) {
      shipCellSet.add(`${cx},${cy}`);
    }
  }

  let count = 0;
  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      if (shipCellSet.has(`${x},${y}`)) count++;
    }
  }
  return count;
}

// Get all cells in the 3x3 sonar area around a center point
export function getSonarCells(centerX: number, centerY: number): string[] {
  const minX = Math.max(0, centerX - 1);
  const maxX = Math.min(GRID_SIZE - 1, centerX + 1);
  const minY = Math.max(0, centerY - 1);
  const maxY = Math.min(GRID_SIZE - 1, centerY + 1);

  const cells: string[] = [];
  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      cells.push(`${x},${y}`);
    }
  }
  return cells;
}
