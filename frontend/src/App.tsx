import { useState, useCallback } from 'react';
import ShipPlacement from './components/ShipPlacement';
import GamePlay from './components/GamePlay';
import type { Ship, GamePhase } from './lib/game';
import { shipsToCircuitInput } from './lib/game';
import { generateBoardProof, generateShotProof } from './lib/noir';

const CONTRACT_ADDRESS = 'CBOJUXTKNDDK6A6IT675ORR5LLAWYIMAGSPIFYESSWYXGXOVHRLEPN5D';
const EXPLORER_URL = `https://lab.stellar.org/r/testnet/contract/${CONTRACT_ADDRESS}`;

function App() {
  const [phase, setPhase] = useState<GamePhase>('setup');
  const [p1Ships, setP1Ships] = useState<Ship[]>([]);
  const [p2Ships, setP2Ships] = useState<Ship[]>([]);
  const [p1BoardHash, setP1BoardHash] = useState<string | null>(null);
  const [p2BoardHash, setP2BoardHash] = useState<string | null>(null);
  const [proofStatus, setProofStatus] = useState('');
  const [winner, setWinner] = useState<1 | 2 | null>(null);
  const [proofLog, setProofLog] = useState<string[]>([]);

  const addLog = useCallback((msg: string) => {
    setProofLog(prev => [...prev, `[${new Date().toLocaleTimeString()}] ${msg}`]);
  }, []);

  const handleP1PlaceShips = async (ships: Ship[]) => {
    setP1Ships(ships);
    setPhase('prove-p1');
    setProofStatus('Generating ZK proof for Player 1 board...');
    addLog('Player 1 board committed. Generating board proof...');

    try {
      const circuitInput = shipsToCircuitInput(ships);
      const { boardHash } = await generateBoardProof(circuitInput);
      setP1BoardHash(boardHash);
      addLog(`Board proof generated! Hash: ${boardHash.slice(0, 16)}...`);
      setProofStatus('');
      setPhase('place-p2');
    } catch (e: any) {
      addLog(`Proof generation failed: ${e.message}`);
      setProofStatus(`Error: ${e.message}. Proceeding without proof.`);
      setP1BoardHash('demo-hash-p1');
      setTimeout(() => {
        setProofStatus('');
        setPhase('place-p2');
      }, 2000);
    }
  };

  const handleP2PlaceShips = async (ships: Ship[]) => {
    setP2Ships(ships);
    setPhase('prove-p2');
    setProofStatus('Generating ZK proof for Player 2 board...');
    addLog('Player 2 board committed. Generating board proof...');

    try {
      const circuitInput = shipsToCircuitInput(ships);
      const { boardHash } = await generateBoardProof(circuitInput);
      setP2BoardHash(boardHash);
      addLog(`Board proof generated! Hash: ${boardHash.slice(0, 16)}...`);
      setProofStatus('');
      setPhase('battle');
    } catch (e: any) {
      addLog(`Proof generation failed: ${e.message}`);
      setProofStatus(`Error: ${e.message}. Proceeding without proof.`);
      setP2BoardHash('demo-hash-p2');
      setTimeout(() => {
        setProofStatus('');
        setPhase('battle');
      }, 2000);
    }
  };

  const handleShotFired = async (shooter: 1 | 2, x: number, y: number, hit: boolean) => {
    const defenderShips = shooter === 1 ? p2Ships : p1Ships;
    const defenderHash = shooter === 1 ? p2BoardHash : p1BoardHash;

    addLog(`P${shooter} fires at (${x},${y}) → ${hit ? 'HIT' : 'MISS'}`);

    if (defenderHash && !defenderHash.startsWith('demo-')) {
      try {
        const circuitInput = shipsToCircuitInput(defenderShips);
        await generateShotProof(circuitInput, defenderHash, x, y, hit);
        addLog(`Shot proof verified for (${x},${y})`);
      } catch {
        addLog(`Shot proof skipped for (${x},${y})`);
      }
    }
  };

  const handleGameOver = (w: 1 | 2) => {
    setWinner(w);
    setPhase('game-over');
    addLog(`Game over! Player ${w} wins!`);
  };

  const handleRestart = () => {
    setPhase('setup');
    setP1Ships([]);
    setP2Ships([]);
    setP1BoardHash(null);
    setP2BoardHash(null);
    setProofStatus('');
    setWinner(null);
    setProofLog([]);
  };

  return (
    <div className="min-h-screen bg-slate-950 text-white flex flex-col">
      {/* Header */}
      <header className="bg-slate-900 border-b border-cyan-900/30 px-6 py-3">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-2xl">⚓</span>
            <div>
              <h1 className="text-xl font-black tracking-tight text-cyan-400">ZK BATTLESHIP</h1>
              <p className="text-[10px] text-slate-600 tracking-wider uppercase">Zero-Knowledge Naval Warfare on Stellar</p>
            </div>
          </div>
          <div className="flex items-center gap-4 text-xs">
            {p1BoardHash && (
              <div className="text-slate-500 font-mono bg-slate-800/50 px-2 py-1 rounded">
                P1: {p1BoardHash.slice(0, 10)}...
              </div>
            )}
            {p2BoardHash && (
              <div className="text-slate-500 font-mono bg-slate-800/50 px-2 py-1 rounded">
                P2: {p2BoardHash.slice(0, 10)}...
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="flex-1 flex flex-col items-center justify-center p-6">
        {/* Setup screen */}
        {phase === 'setup' && (
          <div className="text-center space-y-8 max-w-lg">
            <div className="space-y-3">
              <div className="text-7xl">⚓</div>
              <h2 className="text-5xl font-black text-cyan-400 tracking-tight">ZK BATTLESHIP</h2>
              <p className="text-slate-400 leading-relaxed">
                A zero-knowledge battleship game powered by <strong className="text-slate-300">Noir ZK circuits</strong> and <strong className="text-slate-300">Stellar smart contracts</strong>.
                Board positions are hidden with Pedersen hash commitments. Shot results verified with ZK proofs.
              </p>
            </div>

            <button
              className="w-full py-4 bg-cyan-600 hover:bg-cyan-500 rounded-lg font-black text-lg transition-all hover:shadow-lg hover:shadow-cyan-900/50 active:scale-[0.98]"
              onClick={() => setPhase('place-p1')}
            >
              Start Game
            </button>
            <p className="text-xs text-slate-600">Local hotseat mode — both players take turns on the same screen</p>

            <div className="bg-slate-900 rounded-lg p-5 text-left text-sm space-y-3 border border-slate-800">
              <p className="font-bold text-slate-300 uppercase text-xs tracking-wider">How it works</p>
              <div className="grid grid-cols-1 gap-2 text-slate-400">
                <div className="flex gap-3 items-start">
                  <span className="text-cyan-500 font-mono text-xs mt-0.5">01</span>
                  <span>Each player places 5 ships on a 10×10 grid</span>
                </div>
                <div className="flex gap-3 items-start">
                  <span className="text-cyan-500 font-mono text-xs mt-0.5">02</span>
                  <span>A ZK proof validates placement and commits a Pedersen hash</span>
                </div>
                <div className="flex gap-3 items-start">
                  <span className="text-cyan-500 font-mono text-xs mt-0.5">03</span>
                  <span>Players take turns firing shots at each other's grid</span>
                </div>
                <div className="flex gap-3 items-start">
                  <span className="text-cyan-500 font-mono text-xs mt-0.5">04</span>
                  <span>First to sink all 17 ship cells wins</span>
                </div>
              </div>
            </div>

            {/* Contract info */}
            <div className="bg-slate-900/50 rounded-lg px-4 py-3 border border-slate-800/50">
              <p className="text-[10px] text-slate-600 uppercase tracking-wider mb-1">Deployed on Stellar Testnet</p>
              <p className="text-xs font-mono text-slate-500 break-all">{CONTRACT_ADDRESS}</p>
              <a
                href={EXPLORER_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-cyan-600 hover:text-cyan-400 transition-colors mt-1 inline-block"
              >
                View on Stellar Lab →
              </a>
            </div>
          </div>
        )}

        {/* Ship placement phases */}
        {phase === 'place-p1' && (
          <ShipPlacement playerName="Player 1" onConfirm={handleP1PlaceShips} />
        )}

        {phase === 'place-p2' && (
          <div>
            <div className="bg-amber-900/20 border border-amber-700/50 rounded-lg p-3 mb-6 text-center">
              <p className="text-amber-300 text-sm font-medium">Pass the screen to Player 2</p>
              <p className="text-amber-300/60 text-xs mt-0.5">No peeking at Player 1's ships!</p>
            </div>
            <ShipPlacement playerName="Player 2" onConfirm={handleP2PlaceShips} />
          </div>
        )}

        {/* Proof generation */}
        {(phase === 'prove-p1' || phase === 'prove-p2') && (
          <div className="text-center space-y-6">
            <div className="relative w-20 h-20 mx-auto">
              <div className="absolute inset-0 rounded-full border-2 border-cyan-800/30" />
              <div className="absolute inset-0 rounded-full border-t-2 border-cyan-400 animate-spin" />
              <div className="absolute inset-2 rounded-full border border-cyan-900/20" />
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="text-2xl">🔐</span>
              </div>
            </div>
            <div>
              <p className="text-lg text-cyan-300 font-medium">{proofStatus}</p>
              <p className="text-slate-600 text-sm mt-2">Generating ZK proof in browser via Barretenberg WASM...</p>
            </div>
          </div>
        )}

        {/* Battle phase */}
        {phase === 'battle' && (
          <GamePlay
            currentPlayer={1}
            p1Ships={p1Ships}
            p2Ships={p2Ships}
            onGameOver={handleGameOver}
            onShotFired={handleShotFired}
          />
        )}

        {/* Game over */}
        {phase === 'game-over' && winner && (
          <div className="text-center space-y-6">
            <div className="text-7xl">🏆</div>
            <h2 className="text-4xl font-black text-cyan-400">
              Player {winner} Wins!
            </h2>
            <p className="text-slate-400">All enemy ships have been sunk.</p>
            <div className="flex gap-4 justify-center">
              <button
                className="px-8 py-3 bg-cyan-600 hover:bg-cyan-500 rounded-lg font-bold text-lg transition-colors"
                onClick={handleRestart}
              >
                Play Again
              </button>
            </div>
          </div>
        )}
      </main>

      {/* Proof log */}
      {proofLog.length > 0 && (
        <footer className="bg-slate-900 border-t border-slate-800 px-6 py-3">
          <div className="max-w-6xl mx-auto">
            <details open={proofLog.length <= 5}>
              <summary className="text-xs text-slate-600 cursor-pointer hover:text-slate-400 uppercase tracking-wider font-medium">
                ZK Proof Log ({proofLog.length} events)
              </summary>
              <div className="mt-2 max-h-32 overflow-y-auto text-xs font-mono text-green-500/80 space-y-0.5">
                {proofLog.map((log, i) => (
                  <div key={i}>{log}</div>
                ))}
              </div>
            </details>
          </div>
        </footer>
      )}
    </div>
  );
}

export default App;
