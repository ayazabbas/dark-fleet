import { useState, useEffect, useRef, useMemo } from 'react';
import Board from './Board';
import type { SonarResult } from './Board';
import type { Ship } from '../lib/game';
import { checkHit, getShipCells, shipsToCircuitInput, sonarCount, getSonarCells, TOTAL_SHIP_CELLS } from '../lib/game';
import { generateShotProof, generateSonarProof, verifyShotProof, verifySonarProof } from '../lib/noir';
import {
  takeShot as takeShotOnChain,
  reportResult as reportResultOnChain,
  useSonar as useSonarOnChain,
  reportSonar as reportSonarOnChain,
  claimVictory,
  pollGameState,
  type OnChainGame,
} from '../lib/stellar';
import { gameIdToCode } from '../lib/gameCode';

const COL_LABELS = 'ABCDEFGHIJ';
/** Convert numeric x,y to board notation like "A1", "C5" */
const coord = (x: number, y: number) => `${COL_LABELS[x] ?? x}${y + 1}`;

interface OnlineBattleProps {
  gameId: number;
  playerNum: 1 | 2;
  walletAddress: string;
  myShips: Ship[];
  myBoardHash: string;
  addLog: (msg: string, txHash?: string) => void;
  onGameOver: (winner: 1 | 2) => void;
}

interface ShotRecord {
  x: number;
  y: number;
  hit: boolean | null; // null = pending
}

export default function OnlineBattle({
  gameId, playerNum, walletAddress, myShips, myBoardHash, addLog, onGameOver,
}: OnlineBattleProps) {
  const [game, setGame] = useState<OnChainGame | null>(null);
  const [myShots, setMyShots] = useState<ShotRecord[]>([]);
  const [opponentShots, setOpponentShots] = useState<ShotRecord[]>([]);
  // statusMsg is now derived from turnPhase — see below
  const [busy, setBusy] = useState(false);
  const [sonarMode, setSonarMode] = useState(false);
  const [sonarHover, setSonarHover] = useState<{ x: number; y: number } | null>(null);
  const [mySonarResults, setMySonarResults] = useState<SonarResult[]>([]);
  const [message, setMessage] = useState('');

  const reportingRef = useRef(false);
  const lastReportedRef = useRef('');
  const pendingShotRef = useRef<{ x: number; y: number; prevHits: number } | null>(null);
  const pendingSonarRef = useRef<{ centerX: number; centerY: number } | null>(null);
  const gameOverRef = useRef(false);
  // Phase tracks what the player is currently doing — drives ALL display logic
  const [turnPhase, setTurnPhase] = useState<
    'loading' | 'my-turn' | 'firing' | 'awaiting-report' | 'opponent-turn' | 'reporting'
  >('loading');

  // Ship cells for my board display
  const myShipCells = useMemo(() => {
    const s = new Set<string>();
    for (const ship of myShips) for (const [x, y] of getShipCells(ship)) s.add(`${x},${y}`);
    return s;
  }, [myShips]);

  // Derived sets for boards
  const myAttackHits = useMemo(() => new Set(myShots.filter(s => s.hit === true).map(s => `${s.x},${s.y}`)), [myShots]);
  const myAttackMisses = useMemo(() => new Set(myShots.filter(s => s.hit === false).map(s => `${s.x},${s.y}`)), [myShots]);
  const opponentHits = useMemo(() => new Set(opponentShots.filter(s => s.hit).map(s => `${s.x},${s.y}`)), [opponentShots]);
  const opponentMisses = useMemo(() => new Set(opponentShots.filter(s => !s.hit).map(s => `${s.x},${s.y}`)), [opponentShots]);

  // Poll game state — deduplicate to avoid unnecessary re-renders
  const lastGameJsonRef = useRef('');
  useEffect(() => {
    const stop = pollGameState(gameId, (g) => {
      const json = JSON.stringify(g);
      if (json !== lastGameJsonRef.current) {
        lastGameJsonRef.current = json;
        setGame(g);
      }
    }, 2000);
    return stop;
  }, [gameId]);

  // Auto-report opponent actions + resolve pending shots/sonar
  useEffect(() => {
    if (!game || game.status !== 1) return;

    const rawIsMyTurn = game.turn === playerNum;

    // Check for game over
    if (game.p1Hits >= TOTAL_SHIP_CELLS || game.p2Hits >= TOTAL_SHIP_CELLS) {
      if (!gameOverRef.current) {
        gameOverRef.current = true;
        const winner: 1 | 2 = game.p1Hits >= TOTAL_SHIP_CELLS ? 1 : 2;
        if (winner === playerNum) {
          claimVictory(gameId, walletAddress)
            .then(txHash => addLog('Victory claimed!', txHash))
            .catch(() => {});
        }
        onGameOver(winner);
      }
      return;
    }

    // Resolve pending shot result
    if (pendingShotRef.current && !game.awaitingReport && game.turn !== playerNum) {
      const myHits = playerNum === 1 ? game.p1Hits : game.p2Hits;
      const wasHit = myHits > pendingShotRef.current.prevHits;
      const { x, y } = pendingShotRef.current;
      setMyShots(prev => prev.map(s =>
        s.x === x && s.y === y && s.hit === null ? { ...s, hit: wasHit } : s
      ));
      setMessage(wasHit ? 'DIRECT HIT!' : 'Miss...');
      setTimeout(() => setMessage(''), 1500);
      addLog(`Shot at ${coord(x,y)} -> ${wasHit ? 'HIT' : 'MISS'}`);

      // Verify opponent's shot proof (fire-and-forget)
      if (game.lastShotProof && game.lastShotProof.length > 0) {
        const rawHash = playerNum === 1 ? game.boardHash2 : game.boardHash1;
        const opponentBoardHash = rawHash.startsWith('0x') ? rawHash : `0x${rawHash}`;
        console.log('[verify] opponentBoardHash:', opponentBoardHash, 'proof length:', game.lastShotProof.length);
        verifyShotProof(game.lastShotProof, opponentBoardHash, wasHit, x, y)
          .then(valid => addLog(valid ? '✅ Opponent proof verified' : '❌ INVALID PROOF — opponent may be cheating!'))
          .catch(() => addLog('⚠️ Proof verification failed'));
      } else {
        addLog('⚠️ Unverified — no proof submitted');
      }

      pendingShotRef.current = null;
      setTurnPhase('opponent-turn');
      return; // Don't process further in this effect run
    }

    // Resolve pending sonar result
    if (pendingSonarRef.current && !game.awaitingSonar && game.turn !== playerNum) {
      const { centerX, centerY } = pendingSonarRef.current;
      const count = game.lastSonarCount;
      const cells = new Set(getSonarCells(centerX, centerY));
      setMySonarResults(prev => [...prev, { cells, count, centerX, centerY }]);
      const colorWord = count === 0 ? 'CLEAR' : count <= 2 ? 'WARM' : 'HOT';
      setMessage(`SONAR: ${count} ship cells — ${colorWord}!`);
      setTimeout(() => setMessage(''), 2000);
      addLog(`Sonar at ${coord(centerX,centerY)}: ${count} cells`);

      // Verify opponent's sonar proof (fire-and-forget)
      if (game.lastSonarProof && game.lastSonarProof.length > 0) {
        const rawHash = playerNum === 1 ? game.boardHash2 : game.boardHash1;
        const opponentBoardHash = rawHash.startsWith('0x') ? rawHash : `0x${rawHash}`;
        verifySonarProof(game.lastSonarProof, opponentBoardHash, centerX, centerY, count)
          .then(valid => addLog(valid ? '✅ Opponent sonar proof verified' : '❌ INVALID PROOF — opponent may be cheating!'))
          .catch(() => addLog('⚠️ Sonar proof verification failed'));
      } else {
        addLog('⚠️ Unverified — no sonar proof submitted');
      }

      pendingSonarRef.current = null;
      setTurnPhase('opponent-turn');
      return;
    }

    // Don't update phase while we're in the middle of firing or awaiting report
    if (pendingShotRef.current || pendingSonarRef.current) return;

    // Auto-report opponent's shot at me
    if (!rawIsMyTurn && game.awaitingReport && !reportingRef.current) {
      const key = `shot-${game.lastShotX},${game.lastShotY}-${game.p1TurnsTaken}-${game.p2TurnsTaken}`;
      if (key !== lastReportedRef.current) {
        setTurnPhase('reporting');
        autoReportShot(game, key);
      }
      return;
    }

    // Auto-report opponent's sonar
    if (!rawIsMyTurn && game.awaitingSonar && !reportingRef.current) {
      const key = `sonar-${game.sonarCenterX},${game.sonarCenterY}-${game.p1TurnsTaken}-${game.p2TurnsTaken}`;
      if (key !== lastReportedRef.current) {
        setTurnPhase('reporting');
        autoReportSonar(game, key);
      }
      return;
    }

    // No pending actions — set phase from raw game state
    // Only update if we're not in an active flow (firing/awaiting-report/reporting)
    if (!reportingRef.current && !busy) {
      setTurnPhase(prev => {
        // Don't override active phases — wait for them to resolve naturally
        if (prev === 'firing' || prev === 'awaiting-report' || prev === 'reporting') return prev;
        if (rawIsMyTurn && !game.awaitingReport && !game.awaitingSonar) return 'my-turn';
        if (rawIsMyTurn && (game.awaitingReport || game.awaitingSonar)) return 'awaiting-report';
        return 'opponent-turn';
      });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game]);

  const autoReportShot = async (g: OnChainGame, key: string) => {
    reportingRef.current = true;
    lastReportedRef.current = key;

    const hit = checkHit(myShips, g.lastShotX, g.lastShotY);
    setOpponentShots(prev => [...prev, { x: g.lastShotX, y: g.lastShotY, hit }]);
    addLog(`Opponent fires at ${coord(g.lastShotX,g.lastShotY)} -> ${hit ? 'HIT' : 'MISS'}`);

    let proofBytes: Uint8Array = new Uint8Array(0);
    try {
      const ci = shipsToCircuitInput(myShips);
      const result = await generateShotProof(ci, myBoardHash, g.lastShotX, g.lastShotY, hit);
      proofBytes = result.proof;
      addLog(`Shot proof generated for ${coord(g.lastShotX,g.lastShotY)}`);
    } catch {
      addLog(`Shot proof generation skipped`);
    }

    try {
      const txHash = await reportResultOnChain(gameId, walletAddress, hit, proofBytes);
      addLog(`Reported ${hit ? 'HIT' : 'MISS'} on-chain`, txHash);
      setTurnPhase('my-turn');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'unknown error';
      addLog(`Report error: ${msg}`);
      // Fallback: retry without proof (proof bytes may exceed resource limits)
      if (proofBytes.length > 0) {
        addLog('Retrying report without proof...');
        try {
          const txHash = await reportResultOnChain(gameId, walletAddress, hit, new Uint8Array(0));
          addLog(`Reported ${hit ? 'HIT' : 'MISS'} on-chain (no proof)`, txHash);
          setTurnPhase('my-turn');
          return;
        } catch {
          addLog('Retry without proof also failed');
        }
      }
      lastReportedRef.current = '';
    } finally {
      reportingRef.current = false;
    }
  };

  const autoReportSonar = async (g: OnChainGame, key: string) => {
    reportingRef.current = true;
    lastReportedRef.current = key;

    const count = sonarCount(myShips, g.sonarCenterX, g.sonarCenterY);
    addLog(`Opponent sonar at ${coord(g.sonarCenterX,g.sonarCenterY)} -> ${count} cells`);

    let proofBytes: Uint8Array = new Uint8Array(0);
    try {
      const ci = shipsToCircuitInput(myShips);
      const result = await generateSonarProof(ci, myBoardHash, g.sonarCenterX, g.sonarCenterY, count);
      proofBytes = result.proof;
      addLog(`Sonar proof generated for ${coord(g.sonarCenterX,g.sonarCenterY)}`);
    } catch {
      addLog(`Sonar proof generation skipped`);
    }

    try {
      const txHash = await reportSonarOnChain(gameId, walletAddress, count, proofBytes);
      addLog(`Reported sonar count=${count} on-chain`, txHash);
      setTurnPhase('my-turn');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'unknown error';
      addLog(`Sonar report error: ${msg}`);
      if (proofBytes.length > 0) {
        addLog('Retrying sonar report without proof...');
        try {
          const txHash = await reportSonarOnChain(gameId, walletAddress, count, new Uint8Array(0));
          addLog(`Reported sonar count=${count} on-chain (no proof)`, txHash);
          setTurnPhase('my-turn');
          return;
        } catch {
          addLog('Retry without proof also failed');
        }
      }
      lastReportedRef.current = '';
    } finally {
      reportingRef.current = false;
    }
  };

  const handleFire = async (x: number, y: number) => {
    if (busy || !game) return;
    if (sonarMode) { handleSonarFire(x, y); return; }
    if (myShots.some(s => s.x === x && s.y === y)) return;

    setBusy(true);
    setTurnPhase('firing');

    const myHits = playerNum === 1 ? game.p1Hits : game.p2Hits;
    pendingShotRef.current = { x, y, prevHits: myHits };
    setMyShots(prev => [...prev, { x, y, hit: null }]);

    try {
      const txHash = await takeShotOnChain(gameId, walletAddress, x, y);
      addLog(`Fired at ${coord(x,y)}`, txHash);
      setTurnPhase('awaiting-report');
    } catch (err: unknown) {
      setMyShots(prev => prev.filter(s => !(s.x === x && s.y === y && s.hit === null)));
      pendingShotRef.current = null;
      setTurnPhase('my-turn');
      const msg = err instanceof Error ? err.message : 'unknown error';
      addLog(`Fire failed: ${msg}`);
    } finally {
      setBusy(false);
    }
  };

  const handleSonarFire = async (centerX: number, centerY: number) => {
    if (busy || !game) return;

    setBusy(true);
    setTurnPhase('firing');
    setSonarMode(false);
    setSonarHover(null);
    pendingSonarRef.current = { centerX, centerY };

    try {
      const txHash = await useSonarOnChain(gameId, walletAddress, centerX, centerY);
      addLog(`Used sonar at ${coord(centerX,centerY)}`, txHash);
      setTurnPhase('awaiting-report');
    } catch (err: unknown) {
      pendingSonarRef.current = null;
      setTurnPhase('my-turn');
      const msg = err instanceof Error ? err.message : 'unknown error';
      addLog(`Sonar failed: ${msg}`);
    } finally {
      setBusy(false);
    }
  };

  // Derive display and interaction state from turnPhase (single source of truth)
  const isMyTurn = turnPhase === 'my-turn' || turnPhase === 'firing' || turnPhase === 'awaiting-report';
  const canFire = turnPhase === 'my-turn' && !busy;

  // Status message derived from phase
  const statusMsg = (() => {
    switch (turnPhase) {
      case 'loading': return 'Connecting to game...';
      case 'my-turn': return sonarMode ? 'Select sonar center on Enemy Waters' : 'Your turn — select a target on Enemy Waters';
      case 'firing': return 'Firing...';
      case 'awaiting-report': return 'Waiting for opponent to report...';
      case 'opponent-turn': return "Opponent's turn — waiting for their move...";
      case 'reporting': return 'Reporting opponent\'s action...';
      default: return '';
    }
  })();

  // Sonar availability
  const myTurnsTaken = game ? (playerNum === 1 ? game.p1TurnsTaken : game.p2TurnsTaken) : 0;
  const mySonarUsed = game ? (playerNum === 1 ? game.p1SonarUsed : game.p2SonarUsed) : false;
  // Sonar unlocks after 3 turns and stays available until used (not just on exact multiples)
  const sonarAvailable = canFire && !mySonarUsed && myTurnsTaken >= 3;

  // Sonar hover preview
  const sonarHoverCells = sonarMode && sonarHover
    ? new Set(getSonarCells(sonarHover.x, sonarHover.y))
    : undefined;

  if (!game) {
    return (
      <div className="text-center py-12">
        <div className="relative w-16 h-16 mx-auto mb-4">
          <div className="absolute inset-0 rounded-full border-2 border-cyan-800/30" />
          <div className="absolute inset-0 rounded-full border-t-2 border-cyan-400 animate-spin" />
        </div>
        <p className="text-cyan-400">Loading game state...</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-5">
      <div className="text-center">
        <h2 className="text-2xl font-black text-cyan-300">
          {isMyTurn ? 'Your Turn' : "Opponent's Turn"}
        </h2>
        <p className="text-slate-500 text-sm mt-1">{statusMsg}</p>
      </div>

      {/* Score bar */}
      <div className="flex gap-6 items-center">
        <div className={`text-center px-4 py-2 rounded-lg border ${playerNum === 1 ? 'bg-cyan-900/30 border-cyan-700' : 'bg-slate-800/60 border-slate-700'}`}>
          <div className="text-xs text-slate-400 uppercase tracking-wide">
            {playerNum === 1 ? 'You (P1)' : 'Opponent (P1)'}
          </div>
          <div className="text-lg font-black">
            <span className={game.p1Hits > 0 ? 'text-red-400' : 'text-slate-500'}>{game.p1Hits}</span>
            <span className="text-slate-600">/{TOTAL_SHIP_CELLS}</span>
          </div>
          <div className="w-24 h-1 bg-slate-700 rounded-full mt-1">
            <div className="h-full bg-red-500 rounded-full transition-all" style={{ width: `${(game.p1Hits / TOTAL_SHIP_CELLS) * 100}%` }} />
          </div>
        </div>
        <span className="text-slate-600 font-bold text-sm">VS</span>
        <div className={`text-center px-4 py-2 rounded-lg border ${playerNum === 2 ? 'bg-cyan-900/30 border-cyan-700' : 'bg-slate-800/60 border-slate-700'}`}>
          <div className="text-xs text-slate-400 uppercase tracking-wide">
            {playerNum === 2 ? 'You (P2)' : 'Opponent (P2)'}
          </div>
          <div className="text-lg font-black">
            <span className={game.p2Hits > 0 ? 'text-red-400' : 'text-slate-500'}>{game.p2Hits}</span>
            <span className="text-slate-600">/{TOTAL_SHIP_CELLS}</span>
          </div>
          <div className="w-24 h-1 bg-slate-700 rounded-full mt-1">
            <div className="h-full bg-red-500 rounded-full transition-all" style={{ width: `${(game.p2Hits / TOTAL_SHIP_CELLS) * 100}%` }} />
          </div>
        </div>
      </div>

      {/* Sonar button */}
      <div className="flex gap-3 items-center">
        {sonarAvailable && (
          <button
            className={`px-4 py-2 rounded-lg font-bold text-sm transition-all ${
              sonarMode
                ? 'bg-violet-600 text-white shadow-lg shadow-violet-900/50'
                : 'bg-slate-800 text-violet-400 border border-violet-700 hover:bg-violet-900/30'
            }`}
            onClick={() => { setSonarMode(!sonarMode); setSonarHover(null); }}
          >
            {sonarMode ? 'Cancel Sonar' : 'Use Sonar Ping'}
          </button>
        )}
        {sonarAvailable && !sonarMode && (
          <span className="text-xs text-violet-400/60">3x3 area scan available</span>
        )}
        {!sonarAvailable && !mySonarUsed && canFire && myTurnsTaken < 3 && (
          <span className="text-xs text-slate-600">
            Sonar in {3 - myTurnsTaken} turn{3 - myTurnsTaken !== 1 ? 's' : ''}
          </span>
        )}
        {mySonarUsed && (
          <span className="text-xs text-slate-600">Sonar used</span>
        )}
      </div>

      {/* Hit/Miss message */}
      {message && (
        <div className={`text-3xl font-black ${
          message.includes('HIT') ? 'text-red-400 animate-bounce'
          : message.includes('SONAR') ? 'text-violet-400'
          : 'text-slate-500'
        }`}>
          {message}
        </div>
      )}

      {/* Boards */}
      <div className="flex gap-8 flex-wrap justify-center">
        <Board
          cells={[]}
          hits={opponentHits}
          misses={opponentMisses}
          showShips={true}
          shipCells={myShipCells}
          disabled={true}
          label="Your Fleet"
        />
        <Board
          cells={[]}
          hits={myAttackHits}
          misses={myAttackMisses}
          showShips={false}
          onCellClick={canFire ? handleFire : undefined}
          onCellHover={(x, y) => sonarMode && setSonarHover({ x, y })}
          onMouseLeave={() => setSonarHover(null)}
          disabled={!canFire}
          label="Enemy Waters"
          sonarHighlight={sonarHoverCells}
          sonarResults={mySonarResults}
        />
      </div>

      {/* Game info */}
      <div className="text-xs text-slate-600 text-center">
        Game {gameIdToCode(gameId)} · You are Player {playerNum} · {walletAddress.slice(0, 8)}...{walletAddress.slice(-4)}
      </div>
    </div>
  );
}
