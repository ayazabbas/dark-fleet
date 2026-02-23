import { Link } from 'react-router-dom';

const CONTRACT_ID = 'CAMPSSS224MFUVQY6X6LA2QIQEM7AFDKHXG4Q5IVWAJQHLQOX3WQL3EX';

export default function Docs() {
  return (
    <div className="min-h-screen bg-slate-950 text-white flex flex-col">
      {/* Header */}
      <header className="bg-slate-900 border-b border-cyan-900/30 px-6 py-3">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <Link to="/" className="flex items-center gap-3 hover:opacity-80 transition-opacity">
            <span className="text-2xl">⚓</span>
            <div>
              <h1 className="text-xl font-black tracking-tight text-cyan-400">DARK FLEET</h1>
              <p className="text-[10px] text-slate-600 tracking-wider uppercase">Zero-Knowledge Naval Warfare on Stellar</p>
            </div>
          </Link>
          <Link to="/" className="text-sm text-cyan-500 hover:text-cyan-400 transition-colors">
            ← Back to Game
          </Link>
        </div>
      </header>

      {/* Content */}
      <main className="flex-1 max-w-4xl mx-auto px-6 py-10 space-y-12">

        {/* Intro */}
        <section className="space-y-4">
          <h2 className="text-3xl font-black text-cyan-400">How Dark Fleet Works</h2>
          <p className="text-slate-400 leading-relaxed">
            Dark Fleet is a fully on-chain battleship game where <strong className="text-slate-300">zero-knowledge proofs</strong> guarantee
            fair play without revealing ship positions. Each player's board is hidden behind a Pedersen hash commitment,
            and every shot result is proven with a ZK circuit — making cheating mathematically impossible.
          </p>
          <p className="text-slate-400 leading-relaxed">
            The game runs on <strong className="text-slate-300">Stellar's Soroban smart contracts</strong> for trustless game state,
            with <strong className="text-slate-300">Noir ZK circuits</strong> compiled to WASM and executed directly in your browser.
          </p>
        </section>

        {/* Architecture */}
        <section className="space-y-4">
          <h2 className="text-2xl font-black text-cyan-400">Architecture</h2>
          <div className="bg-slate-900 rounded-lg p-6 border border-slate-800 font-mono text-sm text-slate-400 whitespace-pre leading-relaxed">
{`  Browser A (Player 1)              Browser B (Player 2)
  ┌──────────────────┐              ┌──────────────────┐
  │  React Frontend  │              │  React Frontend  │
  │  + Noir WASM     │◄─── verify ──│  + Noir WASM     │
  │  + Freighter     │              │  + Freighter     │
  └────────┬─────────┘              └────────┬─────────┘
           │                                 │
           │    Stellar Testnet (Soroban)     │
           │  ┌──────────────────────────┐   │
           └──┤   Battleship Contract    ├───┘
              │  new_game / join_game    │
              │  commit_board            │
              │  take_shot               │
              │  report_result + proof   │
              │  use_sonar               │
              │  report_sonar + proof    │
              │  claim_victory           │
              └──────────┬───────────────┘
                         │
              ┌──────────┴───────────────┐
              │     Game Hub Contract    │
              │  (Hackathon registry)    │
              └──────────────────────────┘`}
          </div>
        </section>

        {/* Trust Model */}
        <section className="space-y-4">
          <h2 className="text-2xl font-black text-cyan-400">Trust Model & Anti-Cheat</h2>
          <p className="text-slate-400 leading-relaxed">
            Dark Fleet stores ZK proofs on-chain with every shot and sonar report. When your opponent claims a hit or miss,
            their browser generates a ZK proof and submits it alongside the report to the Soroban contract. Your browser
            then fetches the proof from the contract state and verifies it client-side in real time.
          </p>

          <div className="bg-slate-900 rounded-lg p-6 border border-slate-800 font-mono text-sm text-slate-400 whitespace-pre leading-relaxed">
{`  Proof Verification Flow:

  P1 fires at P2         P2 generates ZK proof
       │                        │
       ▼                        ▼
  take_shot()  ──────►  report_result(hit, proof)
  on-chain                 on-chain
                               │
                               ▼
                    P1 fetches proof from contract
                    P1 verifies proof in-browser
                               │
                    ┌──────────┴──────────┐
                    │                     │
               ✅ VALID              ❌ INVALID
          "Proof verified"     "CHEATING DETECTED"`}
          </div>

          <div className="grid gap-3 mt-4">
            <div className="bg-slate-900 rounded-lg p-4 border border-emerald-900/50 space-y-1">
              <h3 className="text-sm font-bold text-emerald-400">What's verified</h3>
              <ul className="text-xs text-slate-400 space-y-1 list-disc list-inside">
                <li>Every shot result (hit/miss) is backed by a ZK proof stored on-chain</li>
                <li>Every sonar count is backed by a ZK proof stored on-chain</li>
                <li>Opponent's browser verifies proofs client-side in real time</li>
                <li>Proofs are publicly auditable — anyone can fetch them from the contract state</li>
              </ul>
            </div>
            <div className="bg-slate-900 rounded-lg p-4 border border-amber-900/50 space-y-1">
              <h3 className="text-sm font-bold text-amber-400">Future work</h3>
              <ul className="text-xs text-slate-400 space-y-1 list-disc list-inside">
                <li>On-chain proof verification — contract auto-rejects invalid proofs (requires Soroban ZK verifier)</li>
                <li>Board commitment proof verified on-chain at game start</li>
              </ul>
            </div>
          </div>
        </section>

        {/* ZK Circuits */}
        <section className="space-y-4">
          <h2 className="text-2xl font-black text-cyan-400">ZK Circuits (Noir)</h2>
          <p className="text-slate-500 text-sm">Built with Noir 0.34.0 — compiled to WASM, executed in-browser via Barretenberg</p>

          <div className="grid gap-4">
            <div className="bg-slate-900 rounded-lg p-5 border border-slate-800 space-y-2">
              <h3 className="text-lg font-bold text-slate-200">Board Circuit</h3>
              <p className="text-slate-400 text-sm">Validates ship placement and produces a Pedersen hash commitment.</p>
              <div className="text-xs font-mono text-slate-500 space-y-1">
                <div><span className="text-violet-400">Private:</span> ships[15] (x, y, orientation for 5 ships)</div>
                <div><span className="text-cyan-400">Output:</span> board_hash (Pedersen hash of ship positions)</div>
              </div>
              <p className="text-slate-500 text-xs">Checks: all ships within 10x10 grid, no overlaps, correct sizes (5,4,3,3,2)</p>
            </div>

            <div className="bg-slate-900 rounded-lg p-5 border border-slate-800 space-y-2">
              <h3 className="text-lg font-bold text-slate-200">Shot Circuit</h3>
              <p className="text-slate-400 text-sm">Proves whether a shot at (x,y) is a hit or miss without revealing the board.</p>
              <div className="text-xs font-mono text-slate-500 space-y-1">
                <div><span className="text-violet-400">Private:</span> ships[15]</div>
                <div><span className="text-cyan-400">Public:</span> board_hash, hit (0/1), shot_x, shot_y</div>
              </div>
              <p className="text-slate-500 text-xs">Verifies the prover's ships match their committed board hash before checking the shot</p>
            </div>

            <div className="bg-slate-900 rounded-lg p-5 border border-slate-800 space-y-2">
              <h3 className="text-lg font-bold text-slate-200">Sonar Circuit</h3>
              <p className="text-slate-400 text-sm">Proves the count of ship cells in a 3x3 area — partial information disclosure via ZK.</p>
              <div className="text-xs font-mono text-slate-500 space-y-1">
                <div><span className="text-violet-400">Private:</span> ships[15]</div>
                <div><span className="text-cyan-400">Public:</span> board_hash, center_x, center_y, count</div>
              </div>
              <p className="text-slate-500 text-xs">Demonstrates ZK beyond boolean proofs — reveals how many ships are in an area without showing where</p>
            </div>
          </div>
        </section>

        {/* Smart Contract */}
        <section className="space-y-4">
          <h2 className="text-2xl font-black text-cyan-400">Smart Contract Functions</h2>
          <p className="text-slate-500 text-sm">Soroban (Rust) — manages the full game lifecycle on Stellar testnet</p>

          <div className="bg-slate-900 rounded-lg border border-slate-800 divide-y divide-slate-800">
            {[
              { fn: 'new_game(player1)', desc: 'Create a new game session. Returns game ID for sharing.' },
              { fn: 'join_game(game_id, player2)', desc: 'Join an existing game with the game code.' },
              { fn: 'commit_board(game_id, player, hash)', desc: 'Submit Pedersen hash commitment of ship positions.' },
              { fn: 'take_shot(game_id, player, x, y)', desc: 'Fire a shot at the opponent\'s board (must be your turn).' },
              { fn: 'report_result(game_id, player, hit, proof)', desc: 'Report hit/miss with ZK proof stored on-chain for verification.' },
              { fn: 'use_sonar(game_id, player, cx, cy)', desc: 'Use sonar ping instead of firing (available after 3 turns, once per game).' },
              { fn: 'report_sonar(game_id, player, count, proof)', desc: 'Report sonar count with ZK proof stored on-chain for verification.' },
              { fn: 'claim_victory(game_id, player)', desc: 'Claim win after scoring 17 hits (all ship cells sunk).' },
              { fn: 'get_game(game_id)', desc: 'Read current game state (view function, no tx needed).' },
            ].map(({ fn, desc }) => (
              <div key={fn} className="px-5 py-3 flex items-start gap-4">
                <code className="text-cyan-300 text-sm font-mono whitespace-nowrap">{fn}</code>
                <span className="text-slate-400 text-sm">{desc}</span>
              </div>
            ))}
          </div>
        </section>

        {/* How to Play */}
        <section className="space-y-4">
          <h2 className="text-2xl font-black text-cyan-400">How to Play</h2>

          <div className="space-y-6">
            <div className="space-y-3">
              <h3 className="text-lg font-bold text-slate-200">Creating a Game (Player 1)</h3>
              <ol className="list-decimal list-inside text-slate-400 space-y-1.5 text-sm pl-2">
                <li>Install the <a href="https://www.freighter.app/" target="_blank" rel="noopener noreferrer" className="text-cyan-500 hover:text-cyan-400">Freighter wallet</a> browser extension</li>
                <li>Switch to Stellar Testnet in Freighter settings</li>
                <li>Click <strong className="text-slate-300">Connect Wallet</strong>, then <strong className="text-slate-300">Create Game</strong></li>
                <li>Place your 5 ships on the grid (click to place, R to rotate)</li>
                <li>Wait for ZK proof generation and on-chain transactions</li>
                <li>Share the <strong className="text-slate-300">game code</strong> with your opponent</li>
                <li>Wait for them to join — battle starts automatically</li>
              </ol>
            </div>

            <div className="space-y-3">
              <h3 className="text-lg font-bold text-slate-200">Joining a Game (Player 2)</h3>
              <ol className="list-decimal list-inside text-slate-400 space-y-1.5 text-sm pl-2">
                <li>Connect Freighter wallet (Testnet)</li>
                <li>Click <strong className="text-slate-300">Join Game</strong> and enter the game code</li>
                <li>Place your ships and confirm</li>
                <li>Battle begins once both boards are committed on-chain</li>
              </ol>
            </div>

            <div className="space-y-3">
              <h3 className="text-lg font-bold text-slate-200">During Battle</h3>
              <ul className="list-disc list-inside text-slate-400 space-y-1.5 text-sm pl-2">
                <li>On your turn, click a cell on "Enemy Waters" to fire</li>
                <li>Your opponent's browser auto-detects the shot, generates a ZK proof, and reports hit/miss</li>
                <li>After 3 turns, a one-time <strong className="text-slate-300">Sonar Ping</strong> becomes available — scan a 3×3 area to learn how many ship cells are there (once per game)</li>
                <li>First to sink all 17 ship cells wins and claims victory on-chain</li>
              </ul>
            </div>
          </div>
        </section>

        {/* Links */}
        <section className="space-y-4">
          <h2 className="text-2xl font-black text-cyan-400">Links</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <a
              href="https://github.com/ayazabbas/dark-fleet"
              target="_blank"
              rel="noopener noreferrer"
              className="bg-slate-900 rounded-lg p-4 border border-slate-800 hover:border-cyan-700/50 transition-colors block"
            >
              <div className="text-sm font-bold text-slate-200">GitHub Repository</div>
              <div className="text-xs text-slate-500 mt-1">Source code, circuits, contract, and frontend</div>
            </a>
            <a
              href={`https://stellar.expert/explorer/testnet/contract/${CONTRACT_ID}`}
              target="_blank"
              rel="noopener noreferrer"
              className="bg-slate-900 rounded-lg p-4 border border-slate-800 hover:border-cyan-700/50 transition-colors block"
            >
              <div className="text-sm font-bold text-slate-200">Contract on StellarExpert</div>
              <div className="text-xs text-slate-500 mt-1 font-mono break-all">{CONTRACT_ID}</div>
            </a>
            <a
              href="https://dorahacks.io/hackathon/stellar-hacks-zk-gaming/detail"
              target="_blank"
              rel="noopener noreferrer"
              className="bg-slate-900 rounded-lg p-4 border border-slate-800 hover:border-cyan-700/50 transition-colors block"
            >
              <div className="text-sm font-bold text-slate-200">Stellar Hacks: ZK Gaming</div>
              <div className="text-xs text-slate-500 mt-1">Hackathon page on DoraHacks</div>
            </a>
            <a
              href="https://noir-lang.org/"
              target="_blank"
              rel="noopener noreferrer"
              className="bg-slate-900 rounded-lg p-4 border border-slate-800 hover:border-cyan-700/50 transition-colors block"
            >
              <div className="text-sm font-bold text-slate-200">Noir Language</div>
              <div className="text-xs text-slate-500 mt-1">ZK circuit language used for board, shot, and sonar proofs</div>
            </a>
          </div>
        </section>

        {/* Tech Stack */}
        <section className="space-y-4">
          <h2 className="text-2xl font-black text-cyan-400">Technology Stack</h2>
          <div className="bg-slate-900 rounded-lg border border-slate-800 divide-y divide-slate-800">
            {[
              { component: 'ZK Circuits', tech: 'Noir 0.34.0 (Pedersen hash, BN254)' },
              { component: 'Smart Contract', tech: 'Soroban SDK 25.1.1 (Rust)' },
              { component: 'Frontend', tech: 'React 19, TypeScript, Vite, Tailwind CSS' },
              { component: 'Proof Engine', tech: 'noir_js + backend_barretenberg (in-browser WASM)' },
              { component: 'Blockchain', tech: 'Stellar Soroban (Testnet)' },
              { component: 'Wallet', tech: 'Freighter (@stellar/freighter-api)' },
            ].map(({ component, tech }) => (
              <div key={component} className="px-5 py-3 flex items-center justify-between">
                <span className="text-slate-300 text-sm font-medium">{component}</span>
                <span className="text-slate-500 text-sm">{tech}</span>
              </div>
            ))}
          </div>
        </section>

      </main>

      {/* Footer */}
      <footer className="bg-slate-900 border-t border-slate-800 px-6 py-4 text-center">
        <p className="text-xs text-slate-600">
          Built for <a href="https://dorahacks.io/hackathon/stellar-hacks-zk-gaming/detail" target="_blank" rel="noopener noreferrer" className="text-cyan-600 hover:text-cyan-500">Stellar Hacks: ZK Gaming</a> — February 2026
        </p>
      </footer>
    </div>
  );
}
