/**
 * Convert integer game IDs to short alphanumeric codes and back.
 * Offset ensures codes are always 4+ uppercase chars (e.g. "K7BX").
 */

const OFFSET = 36 ** 3; // 46656 — ensures 4-char minimum
const CHARS = '0123456789ABCDEFGHJKMNPQRSTUVWXYZ'; // removed I, L, O to avoid confusion
const BASE = CHARS.length; // 32

export function gameIdToCode(gameId: number): string {
  let n = gameId + OFFSET;
  let code = '';
  while (n > 0) {
    code = CHARS[n % BASE] + code;
    n = Math.floor(n / BASE);
  }
  return code || '0';
}

export function codeToGameId(code: string): number | null {
  const upper = code.trim().toUpperCase();
  let n = 0;
  for (const ch of upper) {
    const idx = CHARS.indexOf(ch);
    if (idx === -1) return null;
    n = n * BASE + idx;
  }
  const gameId = n - OFFSET;
  return gameId > 0 ? gameId : null;
}
