# ZK Battleship — Stellar Hacks: ZK Gaming

**Hackathon:** Stellar Hacks: ZK Gaming (DoraHacks)
**Deadline:** Feb 23, 2026 18:00 UTC
**Prize Pool:** $10,000
**Repo:** ~/dev/zk-battleship

## Architecture Overview

Two-player battleship where ship placements are hidden via ZK proofs. Players commit board hashes, take turns shooting, and prove hit/miss without revealing board state. On-chain Soroban contracts verify proofs and enforce game rules.

### Stack
- **ZK Circuits:** Noir (UltraHonk proving system)
- **On-chain:** Soroban smart contracts (Rust) on Stellar Testnet
- **Proof Verification:** UltraHonk Soroban Verifier (indextree/ultrahonk_soroban_contract)
- **Frontend:** React/TypeScript web app
- **Game Hub:** Must call `start_game()` and `end_game()` on `CB4VZAT2U3UC6XFK3N23SKRF2NDCMP3QHJYMCHHFMZO7MRQO6DQ2EMYG`

### ZK Circuits (Noir)
Based on BattleZips-Noir pattern:

1. **Board Circuit** — Proves valid ship placement
   - Private input: ship positions (5 ships: carrier=5, battleship=4, cruiser=3, submarine=3, destroyer=2)
   - Public input: Poseidon hash of board
   - Constraints: ships within 10x10 grid, no overlaps, no out-of-bounds
   
2. **Shot Circuit** — Proves hit/miss for a shot
   - Private input: board state
   - Public input: board hash, shot coordinates (x,y), hit/miss result
   - Constraints: result matches actual board state, board hash matches commitment

### Smart Contracts (Soroban/Rust)
1. **Verifier Contract** — Wraps UltraHonk verifier, stores VK, verifies proofs
2. **Battleship Game Contract** — Game logic:
   - `new_game(player1, player2)` → calls game hub `start_game()`
   - `commit_board(player, board_hash, proof)` → verifies board proof, stores hash
   - `take_shot(player, x, y)` → records shot
   - `report_result(player, hit, proof)` → verifies shot proof, updates state
   - `end_game()` → determines winner, calls game hub `end_game()`

### Frontend (React)
- Board placement UI (drag & drop ships on 10x10 grid)
- Game view (your board + opponent's board with shots)
- Proof generation in browser (Noir WASM)
- Stellar wallet connection (Freighter)
- Real-time game state from Soroban

---

## Phases

### Phase 1: Noir Circuits (2-3 hours)
- [ ] Install Noir toolchain (nargo + bb)
- [ ] Write board circuit (valid placement + Poseidon hash)
- [ ] Write shot circuit (hit/miss proof against committed board)
- [ ] Test circuits locally with nargo
- [ ] Generate verification keys

### Phase 2: Soroban Contracts (2-3 hours)
- [ ] Set up Soroban project with Stellar CLI
- [ ] Integrate UltraHonk verifier contract (fork/adapt indextree's)
- [ ] Write battleship game contract with full game flow
- [ ] Integrate game hub contract calls (start_game/end_game)
- [ ] Deploy to Stellar testnet
- [ ] Test contract interactions

### Phase 3: Frontend (3-4 hours)
- [ ] Scaffold React app (Vite + TypeScript)
- [ ] Ship placement UI (10x10 grid, drag ships)
- [ ] Integrate Noir WASM for in-browser proof generation
- [ ] Stellar wallet connection (Freighter)
- [ ] Game flow: create game → place ships → take turns → win/lose
- [ ] Polish UI

### Phase 4: Integration & Submission (1-2 hours)
- [ ] End-to-end testing on testnet
- [ ] Record 2-3 min demo video
- [ ] Write comprehensive README
- [ ] Submit on DoraHacks

---

## Key References
- BattleZips-Noir circuits: https://github.com/BattleZips/BattleZips-Noir
- UltraHonk Soroban Verifier: https://github.com/indextree/ultrahonk_soroban_contract
- Stellar Game Studio: https://github.com/jamesbachini/Stellar-Game-Studio
- Stellar ZK Docs: https://developers.stellar.org/docs/build/apps/zk
- Soroban P25 Examples: https://github.com/jayz22/soroban-examples/tree/p25-preview/p25-preview
- Noir docs: https://noir-lang.org/docs/

## Simplifications (if time-constrained)
- Reduce to 3 ships instead of 5
- Simplified board (5x5 instead of 10x10)
- Skip drag-and-drop, use click-to-place
- Mock proof verification in contract if circuit compilation issues arise
- Single browser with two tabs (no matchmaking server)
