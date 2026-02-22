# ZK Battleship — Sonar Ping Feature

## Concept
Every 3 turns, a player can use a **Sonar Ping** instead of firing a shot. They select a center cell (x, y) and the opponent must prove (via ZK) how many ship cells exist in the 3x3 area around that point. This reveals partial information without exposing exact positions — a perfect ZK use case.

## Why It's Unique
- Most ZK battleship implementations only use ZK for hit/miss verification (binary)
- Sonar proves a **count** of ship cells in a region — partial information disclosure
- Adds real strategy: use sonar to narrow down, then fire precisely
- Demonstrates ZK's power beyond simple boolean proofs

## Implementation

### 1. Noir Circuit — Sonar (`circuits/sonar/`)
**Private inputs:** `ships[15]` (same format as board/shot circuits)
**Public inputs:** `board_hash` (Field), `center_x` (u8), `center_y` (u8), `count` (u8)

**Constraints:**
- Verify ships hash to board_hash (same as other circuits)
- Build 10x10 board grid from ships array
- Count ship cells in 3x3 area centered on (center_x, center_y)
  - Clamp to grid bounds (0-9) — edges/corners have fewer cells
- Assert count matches the claimed public count

**Tests:**
- Sonar on empty area → count 0
- Sonar on area with known ships → correct count
- Wrong count claim → rejection
- Edge/corner sonar (clamped area) → correct count

### 2. Smart Contract Updates (`contracts/battleship/`)
- Add `sonar_available(game_id, player) -> bool` — true every 3rd turn for that player
- Add `use_sonar(game_id, player, center_x, center_y)` — uses sonar instead of shot (consumes turn)
- Add `report_sonar(game_id, player, count)` — opponent reports count (like report_result)
- Track sonar results in game state
- Sonar does NOT count as a shot — no hit/miss, just intel

### 3. Frontend Updates
- Add "Sonar" button (enabled every 3 turns)
- Sonar mode: click center cell, shows 3x3 highlight
- Display sonar result as a number overlay on the 3x3 area
- Color-code: 0 = blue (clear), 1-2 = yellow (warm), 3+ = red (hot)
- ZK proof log shows sonar proof generation

### 4. README Update
- Document sonar mechanic in "How It Works"
- Highlight as unique ZK feature in architecture section

## Build Order
1. Write + test sonar Noir circuit (~45 min)
2. Update smart contract + tests (~30 min)
3. Update frontend UI (~45 min)
4. Integration test + commit (~15 min)
5. Update README (~10 min)

**Estimated total: ~2.5 hours**
