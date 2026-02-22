# ZK Battleship

A zero-knowledge Battleship game built on Stellar for the **Stellar Hacks: ZK Gaming** hackathon. Players commit hidden board states using Pedersen hash commitments and prove shot results with ZK proofs — all without revealing ship positions.

## How It Works

1. **Place Ships** — Each player places 5 ships on a private 10x10 grid
2. **Commit Board** — A ZK proof validates the placement and produces a Pedersen hash commitment
3. **Battle** — Players take turns firing shots; the defender proves hit/miss without revealing their board
4. **Win** — First player to sink all 17 ship cells wins

The game uses **Noir zero-knowledge circuits** for privacy and **Soroban smart contracts** on Stellar for trustless game state management.

## Architecture

```
┌─────────────┐     ┌──────────────┐     ┌──────────────────┐
│   Frontend   │────▶│  Noir WASM   │────▶│  ZK Proof        │
│  React/TS    │     │  (in-browser)│     │  (board & shot)  │
└──────┬──────┘     └──────────────┘     └──────────────────┘
       │
       ▼
┌──────────────┐     ┌──────────────────┐
│   Soroban    │────▶│   Game Hub       │
│   Contract   │     │   (hackathon)    │
└──────────────┘     └──────────────────┘
```

### ZK Circuits (Noir)

Built with **Noir 0.34.0**, based on [BattleZips-Noir](https://github.com/BattleZips/BattleZips-Noir) patterns.

**Board Circuit** (`circuits/board/`)
- Validates ship placement: all 5 ships within 10x10 grid, no overlaps
- Ships: Carrier (5), Battleship (4), Cruiser (3), Submarine (3), Destroyer (2)
- Computes and outputs Pedersen hash commitment of ship positions
- Private input: `ships[15]` (x, y, orientation for each ship)
- Public output: board hash (Field)

**Shot Circuit** (`circuits/shot/`)
- Proves whether a shot at (x, y) is a hit or miss
- Verifies the prover's ships match their committed board hash
- Private input: `ships[15]`
- Public inputs: `board_hash`, `hit` (0 or 1), `shot_x`, `shot_y`

### Smart Contract (Soroban/Rust)

The Soroban contract (`contracts/battleship/`) manages the full game lifecycle:

- `new_game(player1, player2)` — Create a game session
- `commit_board(game_id, player, board_hash)` — Submit board hash commitment
- `take_shot(game_id, player, x, y)` — Fire a shot (must be your turn)
- `report_result(game_id, player, hit)` — Report if the shot was a hit/miss
- `claim_victory(game_id, player)` — Claim win after sinking all ships (17 hits)

Integrates with the **Stellar Game Hub** contract (`CB4VZAT2U3UC6XFK3N23SKRF2NDCMP3QHJYMCHHFMZO7MRQO6DQ2EMYG`) via `start_game()` and `end_game()` calls.

### Frontend (React + TypeScript)

- Ship placement with click-to-place and rotation
- In-browser ZK proof generation via `@noir-lang/noir_js` + `@noir-lang/backend_barretenberg`
- Turn-based battle UI with two boards (your fleet + enemy waters)
- Real-time ZK proof log showing all cryptographic operations
- Dark theme with Tailwind CSS

## Deployed on Stellar Testnet

The game contract is live on Stellar testnet:

- **Contract Address**: `CBOJUXTKNDDK6A6IT675ORR5LLAWYIMAGSPIFYESSWYXGXOVHRLEPN5D`
- **Explorer**: [View on Stellar Lab](https://lab.stellar.org/r/testnet/contract/CBOJUXTKNDDK6A6IT675ORR5LLAWYIMAGSPIFYESSWYXGXOVHRLEPN5D)

All core contract functions have been tested on testnet: `new_game`, `commit_board`, and `take_shot` are working end-to-end.

## Quick Start

### Prerequisites

- [Noir 0.34.0](https://noir-lang.org/docs/getting_started/installation/) (`nargo`)
- [Rust](https://rustup.rs/) with `wasm32-unknown-unknown` target
- [Node.js](https://nodejs.org/) 18+
- [Stellar CLI](https://developers.stellar.org/docs/build/smart-contracts/getting-started/setup) (optional, for deployment)

### 1. Test ZK Circuits

```bash
cd circuits/board && nargo test
cd ../shot && nargo test
```

### 2. Build Smart Contract

```bash
cd contracts/battleship
cargo build --target wasm32-unknown-unknown --release
cargo test
```

### 3. Run Frontend

```bash
cd frontend
npm install
npm run dev
```

Open http://localhost:5173 to play.

## Project Structure

```
zk-battleship/
├── circuits/
│   ├── board/           # Board validation ZK circuit
│   │   └── src/main.nr  # Ship placement + Pedersen hash
│   └── shot/            # Shot verification ZK circuit
│       └── src/main.nr  # Hit/miss proof
├── contracts/
│   └── battleship/      # Soroban smart contract
│       └── src/lib.rs   # Game state management
├── frontend/            # React web application
│   ├── src/
│   │   ├── App.tsx              # Main game state machine
│   │   ├── components/
│   │   │   ├── Board.tsx        # 10x10 grid component
│   │   │   ├── ShipPlacement.tsx # Ship placement UI
│   │   │   └── GamePlay.tsx     # Battle phase UI
│   │   └── lib/
│   │       ├── game.ts          # Game logic & types
│   │       └── noir.ts          # ZK proof generation
│   └── public/circuits/         # Compiled circuit artifacts
└── README.md
```

## Test Results

```
Board Circuit: 6 tests passed
  - Valid horizontal/vertical/mixed placements
  - Out-of-bounds detection
  - Ship collision detection

Shot Circuit: 7 tests passed
  - Hit detection (origin, middle of ship, vertical ships)
  - Miss detection
  - False hit/miss claim rejection
  - Wrong hash rejection

Smart Contract: 6 tests passed
  - Game creation
  - Board commitment
  - Shot and result reporting
  - Full game to victory
  - Turn enforcement
  - Premature victory rejection
```

## Technology Stack

| Component | Technology |
|-----------|-----------|
| ZK Circuits | Noir 0.34.0 (Pedersen hash, BN254) |
| Smart Contract | Soroban SDK 25.1.1 (Rust) |
| Frontend | React 19, TypeScript, Vite, Tailwind CSS |
| Proof Generation | noir_js + backend_barretenberg (in-browser WASM) |
| Blockchain | Stellar (Soroban) |

## Design Decisions

- **Pedersen hash** for board commitments — native to Noir circuits, efficient and ZK-friendly
- **Board hash as circuit output** — the board circuit computes and returns the hash, eliminating the need for external hash computation in the frontend
- **Off-chain proof verification** — proofs are generated and verified in the browser for the hackathon MVP; on-chain UltraHonk verification is the natural next step
- **Hotseat multiplayer** — both players share the same screen for the demo; the smart contract supports full two-player games with separate wallets

## Future Improvements

- On-chain proof verification via [UltraHonk Soroban Verifier](https://github.com/indextree/ultrahonk_soroban_contract)
- WebSocket matchmaking for remote multiplayer
- Stellar wallet integration (Freighter) for on-chain game state
- Ship sinking detection and animation
- Game replay from on-chain events

## License

MIT

## Hackathon

Built for [Stellar Hacks: ZK Gaming](https://dorahacks.io/) — February 2026
