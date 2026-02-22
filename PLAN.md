# Dark Fleet — Demo Build Plan

**Goal:** Get the game fully playable on-chain with 2-player support (separate browser windows), rebrand to Dark Fleet, add docs page, and link transactions in proof logs.

**Deadline:** Feb 23, 2026 18:00 UTC

---

## Current State

- **ZK proofs:** Working in-browser (Noir circuits → Barretenberg WASM). Board commitment, shot verification, sonar proofs all functional.
- **Soroban contract:** Deployed on testnet (`CBOJUXTKNDDK6A6IT675ORR5LLAWYIMAGSPIFYESSWYXGXOVHRLEPN5D`). Has full game lifecycle: `new_game`, `commit_board`, `take_shot`, `report_result`, `use_sonar`, `report_sonar`, `claim_victory`.
- **Frontend:** React/TS/Vite/Tailwind. Hotseat mode — both players on same screen. No wallet integration. No on-chain transactions. Contract address is displayed but never called.
- **Dependencies already installed:** `@stellar/freighter-api`, `@stellar/stellar-sdk` (in package.json but unused).

## Architecture Change: Hotseat → 2-Player On-Chain

### Current Flow (hotseat, no blockchain)
```
Browser: P1 places → P2 places → Battle (both on same screen)
State: React useState only
Proofs: Generated but not submitted anywhere
```

### Target Flow (2-player, on-chain)
```
Browser A (Player 1):                    Browser B (Player 2):
  Connect Freighter wallet                 Connect Freighter wallet
  Place ships → ZK proof → board hash      
  Call new_game(p1, p2) on-chain           
  Call commit_board(hash) on-chain         
  Share game code (game_id)        →       Enter game code
                                           Place ships → ZK proof → board hash
                                           Call commit_board(hash) on-chain
  Game starts (both boards committed)      Game starts
  Take shot → take_shot() on-chain        
                                           See shot → check hit → ZK proof
                                           report_result() on-chain
  See result, opponent's turn              Take shot → take_shot() on-chain
  ... continue until 17 hits ...
  claim_victory() on-chain                 See defeat
```

### Sync Mechanism
- **Polling:** Each browser polls `get_game(game_id)` every 2-3 seconds to detect state changes (opponent's moves, board commits, etc.)
- Simple and reliable for a demo. No WebSocket server needed.
- Poll frequency can be tuned — fast enough for demo, not hammering testnet.

### Contract Modification Needed
- **Current:** `new_game(player1, player2)` requires both addresses upfront.
- **Change:** `new_game(player1)` creates game with only P1. Add `join_game(game_id, player2)` so P2 can join with just the game code.
- This enables the "share code" flow without P1 needing to know P2's address in advance.

---

## Task Breakdown

### Task 1: Contract Update — Join Game Flow
**Files:** `contracts/battleship/src/lib.rs`

- Modify `new_game` to accept only `player1` (set `player2` to a sentinel/empty value)
- Add `join_game(game_id, player2)` function — sets player2 on an existing game
- Update `commit_board` to work with the new flow (P2 can only commit after joining)
- Update tests
- Rebuild and redeploy to testnet

### Task 2: Frontend — Stellar Wallet Integration
**New file:** `frontend/src/lib/stellar.ts`

- Freighter wallet connect/disconnect
- Transaction building and signing helpers
- Contract invocation wrappers for all game functions
- Game state polling utility (`get_game` every 2-3s)
- Network config (testnet RPC, contract address)

### Task 3: Frontend — 2-Player Game Flow with Codes
**Files:** `frontend/src/App.tsx`, new components

- **Landing screen:** "Create Game" or "Join Game" buttons (+ wallet connect)
- **Create Game flow:** P1 connects wallet → places ships → generates board proof → calls `new_game()` + `commit_board()` on-chain → shows game code (game_id)
- **Join Game flow:** P2 connects wallet → enters game code → places ships → generates board proof → calls `join_game()` + `commit_board()` on-chain
- **Battle phase:** Poll contract state. When it's your turn, fire shot (calls `take_shot()`). When opponent fires, detect via poll, compute hit/miss from local ships, generate ZK proof, call `report_result()`.
- **Sonar:** Same pattern — `use_sonar()` on-chain, opponent detects and calls `report_sonar()` with proof.
- **Victory:** Detect 17 hits, call `claim_victory()`.
- **Waiting states:** "Waiting for opponent to join...", "Waiting for opponent to place ships...", "Waiting for opponent's shot...", etc.

### Task 4: Rebrand ZK Battleship → Dark Fleet
**Files:** All frontend files, README.md, any docs

- Replace all "ZK Battleship" / "ZK BATTLESHIP" with "Dark Fleet" / "DARK FLEET"
- Update tagline: "Zero-Knowledge Naval Warfare on Stellar"
- Update emoji/icon if appropriate (⚓ → 🌊 or keep ⚓)
- Update README.md header and references

### Task 5: Docs Page
**New files:** `frontend/src/pages/Docs.tsx` (or similar)

- Add `/docs` route (react-router-dom)
- Content:
  - How Dark Fleet works (ZK + Stellar overview)
  - Architecture diagram
  - Circuit descriptions (board, shot, sonar)
  - Smart contract functions
  - How to play (create game, join, battle)
  - Links: GitHub repo, contract on explorer, hackathon page

### Task 6: Explorer Links in Proof Log
**Files:** `frontend/src/App.tsx` (proof log section), stellar.ts

- Every on-chain transaction returns a tx hash
- Add tx hash + Stellar explorer link to proof log entries
- Format: `[12:34:56] commit_board tx: ABCD...1234 → View on StellarExpert ↗`
- Explorer URL: `https://stellar.expert/explorer/testnet/tx/{hash}`

---

## Execution Order

1. **Contract update** (Task 1) — needed before frontend can integrate
2. **Stellar integration lib** (Task 2) — foundation for all on-chain calls
3. **2-player game flow** (Task 3) — the big one, core gameplay change
4. **Explorer links** (Task 6) — quick win, enhances proof log
5. **Rebrand** (Task 4) — find-and-replace + copy updates
6. **Docs page** (Task 5) — final polish

Tasks 4-6 are independent and can be parallelized after Task 3.

---

## Risk & Mitigations

| Risk | Mitigation |
|------|-----------|
| Freighter wallet issues on testnet | Have fallback: generate keypair in-browser for demo |
| Contract redeploy fails | Keep current contract as backup, deploy new one alongside |
| Polling too slow for demo | Reduce poll interval to 1s during demo |
| ZK proof generation slow | Already working (~5-10s), no change needed |
| Testnet RPC rate limits | Use official Stellar testnet RPC, shouldn't be an issue for 2 players |

---

## Out of Scope (Post-Hackathon)
- WebSocket real-time sync (polling is fine for demo)
- On-chain ZK proof verification (proofs verified in-browser; on-chain verification would need a Soroban verifier contract)
- Mobile support
- Mainnet deployment
