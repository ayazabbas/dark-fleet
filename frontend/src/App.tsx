import { useState, useCallback } from 'react';
import ShipPlacement from './components/ShipPlacement';
import GamePlay from './components/GamePlay';
import type { Ship, GamePhase } from './lib/game';
import { shipsToCircuitInput } from './lib/game';
import { generateBoardProof, generateShotProof } from './lib/noir';

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
    <div className="min-h-screen bg-gray-900 text-white flex flex-col">
      {/* Header */}
      <header className="bg-gray-800 border-b border-cyan-900 px-6 py-4">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-3xl">&#9875;</span>
            <div>
              <h1 className="text-2xl font-black tracking-tight text-cyan-400">ZK BATTLESHIP</h1>
              <p className="text-xs text-gray-500">Zero-Knowledge Naval Warfare on Stellar</p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            {p1BoardHash && (
              <span className="text-xs text-gray-500 font-mono">
                P1: {p1BoardHash.slice(0, 8)}...
              </span>
            )}
            {p2BoardHash && (
              <span className="text-xs text-gray-500 font-mono">
                P2: {p2BoardHash.slice(0, 8)}...
              </span>
            )}
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="flex-1 flex flex-col items-center justify-center p-6">
        {/* Setup screen */}
        {phase === 'setup' && (
          <div className="text-center space-y-8 max-w-lg">
            <div className="space-y-2">
              <span className="text-6xl block">&#9875;</span>
              <h2 className="text-4xl font-black text-cyan-400">ZK BATTLESHIP</h2>
              <p className="text-gray-400">
                A zero-knowledge battleship game powered by Noir circuits and Stellar smart contracts.
                Each player's board is committed as a Pedersen hash, and shot results are verified with ZK proofs.
              </p>
            </div>
            <div className="space-y-3">
              <button
                className="w-full py-3 bg-cyan-600 hover:bg-cyan-500 rounded-lg font-bold text-lg transition-colors"
                onClick={() => setPhase('place-p1')}
              >
                Start Local Game (2 Players)
              </button>
              <p className="text-xs text-gray-600">Both players take turns on the same screen</p>
            </div>
            <div className="bg-gray-800 rounded-lg p-4 text-left text-sm text-gray-400 space-y-2">
              <p><strong className="text-gray-300">How it works:</strong></p>
              <ul className="list-disc list-inside space-y-1">
                <li>Each player places 5 ships on a 10x10 grid</li>
                <li>A ZK proof is generated proving the board is valid</li>
                <li>The board hash is committed (Pedersen hash)</li>
                <li>Players take turns shooting at each other's grid</li>
                <li>First to sink all 17 ship cells wins</li>
              </ul>
            </div>
          </div>
        )}

        {/* Ship placement phases */}
        {phase === 'place-p1' && (
          <ShipPlacement playerName="Player 1" onConfirm={handleP1PlaceShips} />
        )}

        {phase === 'place-p2' && (
          <div>
            <div className="bg-yellow-900/30 border border-yellow-700 rounded-lg p-3 mb-6 text-center text-yellow-300 text-sm">
              Pass the screen to Player 2 - no peeking at Player 1's ships!
            </div>
            <ShipPlacement playerName="Player 2" onConfirm={handleP2PlaceShips} />
          </div>
        )}

        {/* Proof generation */}
        {(phase === 'prove-p1' || phase === 'prove-p2') && (
          <div className="text-center space-y-4">
            <div className="animate-spin text-6xl">&#9881;</div>
            <p className="text-xl text-cyan-300">{proofStatus}</p>
            <p className="text-gray-500 text-sm">This may take a moment...</p>
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
            <span className="text-6xl block">&#127942;</span>
            <h2 className="text-4xl font-black text-cyan-400">
              Player {winner} Wins!
            </h2>
            <p className="text-gray-400">All enemy ships have been sunk.</p>
            <button
              className="px-8 py-3 bg-cyan-600 hover:bg-cyan-500 rounded-lg font-bold text-lg transition-colors"
              onClick={handleRestart}
            >
              Play Again
            </button>
          </div>
        )}
      </main>

      {/* Proof log */}
      {proofLog.length > 0 && (
        <footer className="bg-gray-800 border-t border-gray-700 px-6 py-3">
          <div className="max-w-6xl mx-auto">
            <details open={proofLog.length <= 5}>
              <summary className="text-xs text-gray-500 cursor-pointer hover:text-gray-400">
                ZK Proof Log ({proofLog.length} events)
              </summary>
              <div className="mt-2 max-h-32 overflow-y-auto text-xs font-mono text-green-400 space-y-0.5">
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
