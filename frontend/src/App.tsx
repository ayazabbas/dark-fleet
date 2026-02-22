import { useState, useCallback, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import ShipPlacement from './components/ShipPlacement';
import OnlineBattle from './components/OnlineBattle';
import type { Ship } from './lib/game';
import { shipsToCircuitInput } from './lib/game';
import { generateBoardProof } from './lib/noir';
import {
  connectWallet,
  newGame,
  joinGame,
  commitBoard,
  getGame,
  pollGameState,
  CONTRACT_ID,
  EXPLORER_TX_URL,
} from './lib/stellar';
import { gameIdToCode, codeToGameId } from './lib/gameCode';

type Phase =
  | 'landing'
  | 'join-input'
  | 'place-ships'
  | 'proving'
  | 'submitting'
  | 'waiting'
  | 'battle'
  | 'game-over';

export interface LogEntry {
  time: string;
  message: string;
  txHash?: string;
}

const EXPLORER_CONTRACT = `https://stellar.expert/explorer/testnet/contract/${CONTRACT_ID}`;

function App() {
  const [phase, setPhase] = useState<Phase>('landing');
  const [wallet, setWallet] = useState<string | null>(null);
  const [gameId, setGameId] = useState<number | null>(null);
  const [playerNum, setPlayerNum] = useState<1 | 2>(1);
  const [myShips, setMyShips] = useState<Ship[]>([]);
  const [myBoardHash, setMyBoardHash] = useState<string | null>(null);
  const [proofLog, setProofLog] = useState<LogEntry[]>([]);
  const [statusMsg, setStatusMsg] = useState('');
  const [error, setError] = useState('');
  const [winner, setWinner] = useState<1 | 2 | null>(null);
  const [joinCode, setJoinCode] = useState('');
  const [walletConnecting, setWalletConnecting] = useState(false);

  const pollStopRef = useRef<(() => void) | null>(null);

  const addLog = useCallback((msg: string, txHash?: string) => {
    setProofLog(prev => [...prev, {
      time: new Date().toLocaleTimeString(),
      message: msg,
      txHash,
    }]);
  }, []);

  // Clean up polling on unmount
  useEffect(() => {
    return () => { pollStopRef.current?.(); };
  }, []);

  // --- Wallet ---
  const handleConnect = async () => {
    setWalletConnecting(true);
    setError('');
    try {
      const addr = await connectWallet();
      setWallet(addr);
      addLog(`Wallet connected: ${addr.slice(0, 8)}...${addr.slice(-4)}`);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Failed to connect wallet';
      setError(msg);
    } finally {
      setWalletConnecting(false);
    }
  };

  // --- Create Game ---
  const handleCreateGame = () => {
    setPlayerNum(1);
    setPhase('place-ships');
    setError('');
  };

  // --- Join Game ---
  const handleJoinStart = () => {
    setPhase('join-input');
    setError('');
  };

  const handleJoinSubmit = async () => {
    const numericId = codeToGameId(joinCode);
    if (numericId === null) {
      setError('Please enter a valid game code');
      return;
    }
    setError('');
    setStatusMsg('Joining game...');
    setPhase('submitting');

    try {
      // Verify game exists first
      const game = await getGame(numericId);
      if (game.status !== 0) {
        throw new Error('Game is no longer in setup phase');
      }

      const txHash = await joinGame(numericId, wallet!);
      addLog(`Joined game ${gameIdToCode(numericId)}`, txHash);
      setGameId(numericId);
      setPlayerNum(2);
      setPhase('place-ships');
      setStatusMsg('');
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Failed to join game';
      setError(msg);
      setPhase('join-input');
      setStatusMsg('');
    }
  };

  // --- Ship Placement ---
  const handleShipsConfirmed = async (ships: Ship[]) => {
    setMyShips(ships);
    setPhase('proving');
    setStatusMsg('Generating ZK proof for your board...');
    addLog('Board committed. Generating board proof...');

    try {
      const circuitInput = shipsToCircuitInput(ships);
      const { boardHash } = await generateBoardProof(circuitInput);
      setMyBoardHash(boardHash);
      addLog(`Board proof generated! Hash: ${boardHash.slice(0, 16)}...`);

      // Now submit on-chain
      setPhase('submitting');

      if (playerNum === 1) {
        // Create game + commit board
        setStatusMsg('Creating game on Stellar...');
        const { gameId: newId, txHash: newTx } = await newGame(wallet!);
        setGameId(newId);
        addLog(`Game ${gameIdToCode(newId)} created on-chain`, newTx);

        setStatusMsg('Committing board hash on-chain...');
        const commitTx = await commitBoard(newId, wallet!, boardHash);
        addLog(`Board hash committed on-chain`, commitTx);

        // Start waiting for opponent
        setPhase('waiting');
        setStatusMsg('');
        startWaitingPoll(newId);
      } else {
        // P2: just commit board (already joined)
        setStatusMsg('Committing board hash on-chain...');
        const commitTx = await commitBoard(gameId!, wallet!, boardHash);
        addLog(`Board hash committed on-chain`, commitTx);

        // Check if game started
        const game = await getGame(gameId!);
        if (game.status === 1) {
          setPhase('battle');
          addLog('Both boards committed — battle begins!');
        } else {
          setPhase('waiting');
          setStatusMsg('');
          startWaitingPoll(gameId!);
        }
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Unknown error';
      addLog(`Error: ${msg}`);
      setError(msg);
      // Fall back with demo hash
      setMyBoardHash('demo-hash');
      setStatusMsg('');
      setPhase('place-ships');
    }
  };

  // --- Waiting for opponent ---
  const startWaitingPoll = (gid: number) => {
    pollStopRef.current?.();
    pollStopRef.current = pollGameState(gid, (game) => {
      if (game.status === 1) {
        pollStopRef.current?.();
        pollStopRef.current = null;
        addLog('Both boards committed — battle begins!');
        setPhase('battle');
      }
    }, 2500);
  };

  // --- Game Over ---
  const handleGameOver = (w: 1 | 2) => {
    pollStopRef.current?.();
    setWinner(w);
    setPhase('game-over');
    addLog(w === playerNum ? 'Victory! You sank all enemy ships!' : 'Defeat. Your fleet was sunk.');
  };

  const handleRestart = () => {
    pollStopRef.current?.();
    setPhase('landing');
    setMyShips([]);
    setMyBoardHash(null);
    setGameId(null);
    setPlayerNum(1);
    setStatusMsg('');
    setError('');
    setWinner(null);
    setJoinCode('');
    setProofLog([]);
  };

  return (
    <div className="min-h-screen bg-slate-950 text-white flex flex-col">
      {/* Header */}
      <header className="bg-slate-900 border-b border-cyan-900/30 px-6 py-3">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3 cursor-pointer" onClick={() => phase === 'landing' ? null : handleRestart()}>
            <span className="text-2xl">⚓</span>
            <div>
              <h1 className="text-xl font-black tracking-tight text-cyan-400">DARK FLEET</h1>
              <p className="text-[10px] text-slate-600 tracking-wider uppercase">Zero-Knowledge Naval Warfare on Stellar</p>
            </div>
          </div>
          <div className="flex items-center gap-3 text-xs">
            <Link to="/docs" className="text-slate-500 hover:text-cyan-400 transition-colors text-sm">
              Docs
            </Link>
            {wallet ? (
              <div className="text-slate-500 font-mono bg-slate-800/50 px-2 py-1 rounded flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-emerald-500" />
                {wallet.slice(0, 6)}...{wallet.slice(-4)}
              </div>
            ) : (
              <button
                className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 rounded text-sm text-slate-300 transition-colors border border-slate-700"
                onClick={handleConnect}
                disabled={walletConnecting}
              >
                {walletConnecting ? 'Connecting...' : 'Connect Wallet'}
              </button>
            )}
            {gameId && (
              <div className="text-slate-500 font-mono bg-slate-800/50 px-2 py-1 rounded">
                {gameIdToCode(gameId)}
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="flex-1 flex flex-col items-center justify-center p-6">

        {/* Error display */}
        {error && (
          <div className="bg-red-900/20 border border-red-700/50 rounded-lg p-3 mb-6 text-center max-w-lg">
            <p className="text-red-300 text-sm">{error}</p>
            <button className="text-red-400 text-xs mt-1 underline" onClick={() => setError('')}>Dismiss</button>
          </div>
        )}

        {/* Landing screen */}
        {phase === 'landing' && (
          <div className="text-center space-y-8 max-w-lg">
            <div className="space-y-3">
              <div className="text-7xl">⚓</div>
              <h2 className="text-5xl font-black text-cyan-400 tracking-tight">DARK FLEET</h2>
              <p className="text-slate-400 leading-relaxed">
                Zero-knowledge naval warfare powered by <strong className="text-slate-300">Noir ZK circuits</strong> and <strong className="text-slate-300">Stellar smart contracts</strong>.
                Board positions are hidden with Pedersen hash commitments. Every shot result verified with ZK proofs — no cheating possible.
              </p>
            </div>

            {!wallet ? (
              <div className="space-y-3">
                <button
                  className="w-full py-4 bg-cyan-600 hover:bg-cyan-500 rounded-lg font-black text-lg transition-all hover:shadow-lg hover:shadow-cyan-900/50 active:scale-[0.98]"
                  onClick={handleConnect}
                  disabled={walletConnecting}
                >
                  {walletConnecting ? 'Connecting Wallet...' : 'Connect Freighter Wallet'}
                </button>
                <p className="text-xs text-slate-600">Connect your Stellar wallet to create or join a game</p>
              </div>
            ) : (
              <div className="space-y-3">
                <button
                  className="w-full py-4 bg-cyan-600 hover:bg-cyan-500 rounded-lg font-black text-lg transition-all hover:shadow-lg hover:shadow-cyan-900/50 active:scale-[0.98]"
                  onClick={handleCreateGame}
                >
                  Create Game
                </button>
                <button
                  className="w-full py-3 bg-slate-800 hover:bg-slate-700 rounded-lg font-bold text-base transition-all border border-slate-700"
                  onClick={handleJoinStart}
                >
                  Join Game
                </button>
                <p className="text-xs text-slate-600">Create a new game and share the code, or join with a game code</p>
              </div>
            )}

            <div className="bg-slate-900 rounded-lg p-5 text-left text-sm space-y-3 border border-slate-800">
              <p className="font-bold text-slate-300 uppercase text-xs tracking-wider">How it works</p>
              <div className="grid grid-cols-1 gap-2 text-slate-400">
                <div className="flex gap-3 items-start">
                  <span className="text-cyan-500 font-mono text-xs mt-0.5">01</span>
                  <span>Connect wallet and create a game (or join with a code)</span>
                </div>
                <div className="flex gap-3 items-start">
                  <span className="text-cyan-500 font-mono text-xs mt-0.5">02</span>
                  <span>Place 5 ships — a ZK proof commits a Pedersen hash on-chain</span>
                </div>
                <div className="flex gap-3 items-start">
                  <span className="text-cyan-500 font-mono text-xs mt-0.5">03</span>
                  <span>Take turns firing shots — each move is an on-chain transaction</span>
                </div>
                <div className="flex gap-3 items-start">
                  <span className="text-cyan-500 font-mono text-xs mt-0.5">04</span>
                  <span>First to sink all 17 ship cells wins</span>
                </div>
              </div>
            </div>

            <div className="bg-slate-900/50 rounded-lg px-4 py-3 border border-slate-800/50">
              <p className="text-[10px] text-slate-600 uppercase tracking-wider mb-1">Deployed on Stellar Testnet</p>
              <p className="text-xs font-mono text-slate-500 break-all">{CONTRACT_ID}</p>
              <a
                href={EXPLORER_CONTRACT}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-cyan-600 hover:text-cyan-400 transition-colors mt-1 inline-block"
              >
                View on StellarExpert →
              </a>
            </div>
          </div>
        )}

        {/* Join game input */}
        {phase === 'join-input' && (
          <div className="text-center space-y-6 max-w-sm">
            <h2 className="text-3xl font-black text-cyan-300">Join Game</h2>
            <p className="text-slate-400">Enter the game code shared by your opponent</p>
            <div className="space-y-3">
              <input
                type="text"
                placeholder="Game code (e.g. K7BX)"
                value={joinCode}
                onChange={(e) => setJoinCode(e.target.value)}
                className="w-full px-4 py-3 bg-slate-800 border border-slate-700 rounded-lg text-center text-lg font-mono text-white placeholder-slate-600 focus:outline-none focus:border-cyan-600 focus:ring-1 focus:ring-cyan-600"
                autoFocus
              />
              <button
                className="w-full py-3 bg-cyan-600 hover:bg-cyan-500 rounded-lg font-bold text-lg transition-colors disabled:opacity-50"
                onClick={handleJoinSubmit}
                disabled={!joinCode.trim()}
              >
                Join
              </button>
              <button
                className="text-slate-500 text-sm hover:text-slate-400 transition-colors"
                onClick={() => { setPhase('landing'); setError(''); }}
              >
                ← Back
              </button>
            </div>
          </div>
        )}

        {/* Ship placement */}
        {phase === 'place-ships' && (
          <div>
            {playerNum === 1 && (
              <div className="bg-cyan-900/20 border border-cyan-700/50 rounded-lg p-3 mb-6 text-center">
                <p className="text-cyan-300 text-sm font-medium">You are creating a new game</p>
                <p className="text-cyan-300/60 text-xs mt-0.5">Place your ships, then share the game code with your opponent</p>
              </div>
            )}
            {playerNum === 2 && (
              <div className="bg-cyan-900/20 border border-cyan-700/50 rounded-lg p-3 mb-6 text-center">
                <p className="text-cyan-300 text-sm font-medium">Joining game {gameIdToCode(gameId!)}</p>
                <p className="text-cyan-300/60 text-xs mt-0.5">Place your ships to begin the battle</p>
              </div>
            )}
            <ShipPlacement
              playerName={`Player ${playerNum}`}
              onConfirm={handleShipsConfirmed}
            />
          </div>
        )}

        {/* Proof generation + submitting */}
        {(phase === 'proving' || phase === 'submitting') && (
          <div className="text-center space-y-6">
            <div className="relative w-20 h-20 mx-auto">
              <div className="absolute inset-0 rounded-full border-2 border-cyan-800/30" />
              <div className="absolute inset-0 rounded-full border-t-2 border-cyan-400 animate-spin" />
              <div className="absolute inset-2 rounded-full border border-cyan-900/20" />
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="text-2xl">{phase === 'proving' ? '🔐' : '⛓'}</span>
              </div>
            </div>
            <div>
              <p className="text-lg text-cyan-300 font-medium">{statusMsg}</p>
              <p className="text-slate-600 text-sm mt-2">
                {phase === 'proving'
                  ? 'Generating ZK proof in browser via Barretenberg WASM...'
                  : 'Signing and submitting transaction to Stellar testnet...'}
              </p>
            </div>
          </div>
        )}

        {/* Waiting for opponent */}
        {phase === 'waiting' && (
          <div className="text-center space-y-6 max-w-md">
            <div className="relative w-20 h-20 mx-auto">
              <div className="absolute inset-0 rounded-full border-2 border-cyan-800/30" />
              <div className="absolute inset-0 rounded-full border-t-2 border-cyan-400 animate-spin" style={{ animationDuration: '3s' }} />
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="text-2xl">📡</span>
              </div>
            </div>
            <h2 className="text-2xl font-black text-cyan-300">Waiting for Opponent</h2>
            {playerNum === 1 && gameId && (
              <div className="space-y-3">
                <p className="text-slate-400">Share this game code with your opponent:</p>
                <div className="bg-slate-800 rounded-lg px-6 py-4 border border-cyan-700/50 inline-block">
                  <span className="text-4xl font-black text-cyan-400 font-mono tracking-widest">{gameIdToCode(gameId)}</span>
                </div>
                <p className="text-slate-500 text-sm">
                  Your opponent needs to click "Join Game" and enter this code.
                  <br />The battle will start automatically once they join and place ships.
                </p>
              </div>
            )}
            {playerNum === 2 && (
              <p className="text-slate-400">Waiting for opponent to commit their board...</p>
            )}
          </div>
        )}

        {/* Battle phase */}
        {phase === 'battle' && gameId && wallet && myBoardHash && (
          <OnlineBattle
            gameId={gameId}
            playerNum={playerNum}
            walletAddress={wallet}
            myShips={myShips}
            myBoardHash={myBoardHash}
            addLog={addLog}
            onGameOver={handleGameOver}
          />
        )}

        {/* Game over */}
        {phase === 'game-over' && winner !== null && (
          <div className="text-center space-y-6">
            <div className="text-7xl">{winner === playerNum ? '🏆' : '💀'}</div>
            <h2 className="text-4xl font-black text-cyan-400">
              {winner === playerNum ? 'Victory!' : 'Defeat'}
            </h2>
            <p className="text-slate-400">
              {winner === playerNum
                ? 'All enemy ships have been sunk. Well played!'
                : 'Your fleet has been destroyed. Better luck next time!'}
            </p>
            {gameId && (
              <p className="text-xs text-slate-600">Game {gameIdToCode(gameId!)} · You were Player {playerNum}</p>
            )}
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
            <details open={proofLog.length <= 8}>
              <summary className="text-xs text-slate-600 cursor-pointer hover:text-slate-400 uppercase tracking-wider font-medium">
                Proof & Transaction Log ({proofLog.length} events)
              </summary>
              <div className="mt-2 max-h-40 overflow-y-auto text-xs font-mono space-y-0.5">
                {proofLog.map((entry, i) => (
                  <div key={i} className={entry.txHash ? 'text-green-500/80' : 'text-green-500/60'}>
                    <span className="text-slate-600">[{entry.time}]</span>{' '}
                    {entry.message}
                    {entry.txHash && (
                      <>
                        {' '}
                        <span className="text-slate-500">tx:</span>
                        <span className="text-cyan-600">{entry.txHash.slice(0, 8)}...{entry.txHash.slice(-4)}</span>
                        {' '}
                        <a
                          href={`${EXPLORER_TX_URL}/${entry.txHash}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-cyan-400 hover:text-cyan-300 underline decoration-cyan-700"
                        >
                          View on StellarExpert ↗
                        </a>
                      </>
                    )}
                  </div>
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
