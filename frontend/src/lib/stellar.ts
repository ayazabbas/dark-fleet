import {
  isConnected,
  requestAccess,
  signTransaction,
} from '@stellar/freighter-api';
import * as StellarSdk from '@stellar/stellar-sdk';

// --- Config ---
export const TESTNET_RPC = 'https://soroban-testnet.stellar.org';
export const TESTNET_PASSPHRASE = StellarSdk.Networks.TESTNET;
export const CONTRACT_ID = 'CAMPSSS224MFUVQY6X6LA2QIQEM7AFDKHXG4Q5IVWAJQHLQOX3WQL3EX';
export const EXPLORER_TX_URL = 'https://stellar.expert/explorer/testnet/tx';

const server = new StellarSdk.rpc.Server(TESTNET_RPC);

// --- Wallet ---
export async function connectWallet(): Promise<string> {
  const connected = await isConnected();
  if (!connected.isConnected) {
    throw new Error('Freighter wallet not found. Please install the Freighter browser extension.');
  }
  const access = await requestAccess();
  return access.address;
}

// --- Transaction helpers ---
interface TxResult {
  hash: string;
  returnValue?: StellarSdk.xdr.ScVal;
}

async function buildAndSendTx(
  callerAddress: string,
  method: string,
  params: StellarSdk.xdr.ScVal[]
): Promise<TxResult> {
  const account = await server.getAccount(callerAddress);
  const contract = new StellarSdk.Contract(CONTRACT_ID);

  const tx = new StellarSdk.TransactionBuilder(account, {
    fee: '10000000',
    networkPassphrase: TESTNET_PASSPHRASE,
  })
    .addOperation(contract.call(method, ...params))
    .setTimeout(60)
    .build();

  const simulated = await server.simulateTransaction(tx);
  if (StellarSdk.rpc.Api.isSimulationError(simulated)) {
    console.error(`[buildAndSendTx] Simulation failed for ${method}:`, (simulated as StellarSdk.rpc.Api.SimulateTransactionErrorResponse).error);
    throw new Error(`Simulation failed: ${(simulated as StellarSdk.rpc.Api.SimulateTransactionErrorResponse).error}`);
  }

  const prepared = StellarSdk.rpc.assembleTransaction(tx, simulated as StellarSdk.rpc.Api.SimulateTransactionSuccessResponse).build();

  const { signedTxXdr } = await signTransaction(prepared.toXDR(), {
    networkPassphrase: TESTNET_PASSPHRASE,
  });

  const signed = StellarSdk.TransactionBuilder.fromXDR(signedTxXdr, TESTNET_PASSPHRASE);
  const sendResult = await server.sendTransaction(signed);

  if (sendResult.status === 'ERROR') {
    throw new Error(`Send failed: ${sendResult.errorResult?.toXDR('base64') ?? 'unknown error'}`);
  }

  // Poll for confirmation
  let getResult = await server.getTransaction(sendResult.hash);
  while (getResult.status === 'NOT_FOUND') {
    await new Promise(r => setTimeout(r, 1500));
    getResult = await server.getTransaction(sendResult.hash);
  }

  if (getResult.status === 'FAILED') {
    throw new Error(`Transaction failed on-chain`);
  }

  // Extract return value if available
  let returnValue: StellarSdk.xdr.ScVal | undefined;
  if (getResult.status === 'SUCCESS' && getResult.resultMetaXdr) {
    try {
      const meta = getResult.resultMetaXdr;
      returnValue = meta.v3().sorobanMeta()?.returnValue();
    } catch {
      // No return value available
    }
  }

  return { hash: sendResult.hash, returnValue };
}

// Wait until RPC state reflects a condition (prevents stale-state simulation failures)
export async function awaitState(
  gameId: number,
  condition: (game: OnChainGame) => boolean,
  timeoutMs = 15000
): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const game = await getGame(gameId);
      if (condition(game)) return;
    } catch {
      // game might not exist yet
    }
    await new Promise(r => setTimeout(r, 1500));
  }
  console.warn(`[awaitState] Timed out after ${timeoutMs}ms — proceeding anyway`);
}

// --- Read-only call helper ---
async function readContract<T>(
  method: string,
  params: StellarSdk.xdr.ScVal[],
  decoder: (val: StellarSdk.xdr.ScVal) => T
): Promise<T> {
  // Use deployer address as dummy source for read-only simulations (must exist on-chain)
  const DEPLOYER = 'GBEBI4J7MXOLM6RRNSHED4BLGJEIJ4CJTBVEHSOWL6APY5KUYXECQHEV';
  const account = new StellarSdk.Account(DEPLOYER, '0');
  const contract = new StellarSdk.Contract(CONTRACT_ID);

  const tx = new StellarSdk.TransactionBuilder(account, {
    fee: '100',
    networkPassphrase: TESTNET_PASSPHRASE,
  })
    .addOperation(contract.call(method, ...params))
    .setTimeout(30)
    .build();

  const sim = await server.simulateTransaction(tx);
  if (StellarSdk.rpc.Api.isSimulationError(sim)) {
    throw new Error(`Read failed: ${(sim as StellarSdk.rpc.Api.SimulateTransactionErrorResponse).error}`);
  }
  const success = sim as StellarSdk.rpc.Api.SimulateTransactionSuccessResponse;
  if (!success.result) {
    throw new Error('No result from simulation');
  }
  return decoder(success.result.retval);
}

// --- Game state type ---
export interface OnChainGame {
  player1: string;
  player2: string;
  boardHash1: string;
  boardHash2: string;
  boardsCommitted: number;
  turn: number;
  p1Hits: number;
  p2Hits: number;
  status: number; // 0=created, 1=in_progress, 2=completed
  sessionId: number;
  awaitingReport: boolean;
  lastShotX: number;
  lastShotY: number;
  p1TurnsTaken: number;
  p2TurnsTaken: number;
  p1SonarUsed: boolean;
  p2SonarUsed: boolean;
  awaitingSonar: boolean;
  sonarCenterX: number;
  sonarCenterY: number;
  lastSonarCount: number;
  lastShotProof: Uint8Array;
  lastSonarProof: Uint8Array;
}

// Convert bytes (Buffer, Uint8Array, or string) to hex string
function bytesToHex(val: unknown): string {
  if (typeof val === 'string') return val;
  if (val instanceof Uint8Array || (val && typeof (val as any).length === 'number')) {
    return Array.from(val as Uint8Array).map(b => b.toString(16).padStart(2, '0')).join('');
  }
  return String(val ?? '');
}

function decodeGame(val: StellarSdk.xdr.ScVal): OnChainGame {
  const native = StellarSdk.scValToNative(val) as Record<string, unknown>;
  return {
    player1: native.player1 as string,
    player2: native.player2 as string,
    boardHash1: bytesToHex(native.board_hash1),
    boardHash2: bytesToHex(native.board_hash2),
    boardsCommitted: Number(native.boards_committed),
    turn: Number(native.turn),
    p1Hits: Number(native.p1_hits),
    p2Hits: Number(native.p2_hits),
    status: Number(native.status),
    sessionId: Number(native.session_id),
    awaitingReport: Boolean(native.awaiting_report),
    lastShotX: Number(native.last_shot_x),
    lastShotY: Number(native.last_shot_y),
    p1TurnsTaken: Number(native.p1_turns_taken),
    p2TurnsTaken: Number(native.p2_turns_taken),
    p1SonarUsed: Boolean(native.p1_sonar_used),
    p2SonarUsed: Boolean(native.p2_sonar_used),
    awaitingSonar: Boolean(native.awaiting_sonar),
    sonarCenterX: Number(native.sonar_center_x),
    sonarCenterY: Number(native.sonar_center_y),
    lastSonarCount: Number(native.last_sonar_count),
    lastShotProof: native.last_shot_proof instanceof Uint8Array
      ? native.last_shot_proof
      : new Uint8Array(native.last_shot_proof as ArrayLike<number> ?? []),
    lastSonarProof: native.last_sonar_proof instanceof Uint8Array
      ? native.last_sonar_proof
      : new Uint8Array(native.last_sonar_proof as ArrayLike<number> ?? []),
  };
}

// --- Contract calls ---

export async function newGame(player1: string): Promise<{ gameId: number; txHash: string }> {
  const params = [new StellarSdk.Address(player1).toScVal()];
  const result = await buildAndSendTx(player1, 'new_game', params);

  // Extract game ID from contract return value
  let gameId: number;
  if (result.returnValue) {
    gameId = Number(StellarSdk.scValToNative(result.returnValue));
  } else {
    // Fallback: read game_count
    gameId = await readContract(
      'game_count',
      [],
      (val) => Number(StellarSdk.scValToNative(val))
    );
  }

  return { gameId, txHash: result.hash };
}

export async function joinGame(gameId: number, player2: string): Promise<string> {
  const params = [
    StellarSdk.nativeToScVal(gameId, { type: 'u32' }),
    new StellarSdk.Address(player2).toScVal(),
  ];
  return (await buildAndSendTx(player2, 'join_game', params)).hash;
}

export async function commitBoard(
  gameId: number,
  player: string,
  boardHash: string
): Promise<string> {
  // boardHash is a hex string from Noir field element — convert to 32 bytes
  const hex = boardHash.replace('0x', '').padStart(64, '0');
  const hashBytes = new Uint8Array(32);
  for (let i = 0; i < 32; i++) {
    hashBytes[i] = parseInt(hex.substring(i * 2, i * 2 + 2), 16);
  }
  console.log('[commitBoard] gameId:', gameId, 'player:', player, 'hash:', hex);
  const params = [
    StellarSdk.nativeToScVal(gameId, { type: 'u32' }),
    new StellarSdk.Address(player).toScVal(),
    StellarSdk.nativeToScVal(hashBytes, { type: 'bytes' }),
  ];
  return (await buildAndSendTx(player, 'commit_board', params)).hash;
}

export async function takeShot(
  gameId: number,
  player: string,
  x: number,
  y: number
): Promise<string> {
  const params = [
    StellarSdk.nativeToScVal(gameId, { type: 'u32' }),
    new StellarSdk.Address(player).toScVal(),
    StellarSdk.nativeToScVal(x, { type: 'u32' }),
    StellarSdk.nativeToScVal(y, { type: 'u32' }),
  ];
  return (await buildAndSendTx(player, 'take_shot', params)).hash;
}

export async function reportResult(
  gameId: number,
  player: string,
  hit: boolean,
  proof: Uint8Array = new Uint8Array(0)
): Promise<string> {
  const params = [
    StellarSdk.nativeToScVal(gameId, { type: 'u32' }),
    new StellarSdk.Address(player).toScVal(),
    StellarSdk.nativeToScVal(hit, { type: 'bool' }),
    StellarSdk.nativeToScVal(proof, { type: 'bytes' }),
  ];
  return (await buildAndSendTx(player, 'report_result', params)).hash;
}

export async function useSonar(
  gameId: number,
  player: string,
  centerX: number,
  centerY: number
): Promise<string> {
  const params = [
    StellarSdk.nativeToScVal(gameId, { type: 'u32' }),
    new StellarSdk.Address(player).toScVal(),
    StellarSdk.nativeToScVal(centerX, { type: 'u32' }),
    StellarSdk.nativeToScVal(centerY, { type: 'u32' }),
  ];
  return (await buildAndSendTx(player, 'use_sonar', params)).hash;
}

export async function reportSonar(
  gameId: number,
  player: string,
  count: number,
  proof: Uint8Array = new Uint8Array(0)
): Promise<string> {
  const params = [
    StellarSdk.nativeToScVal(gameId, { type: 'u32' }),
    new StellarSdk.Address(player).toScVal(),
    StellarSdk.nativeToScVal(count, { type: 'u32' }),
    StellarSdk.nativeToScVal(proof, { type: 'bytes' }),
  ];
  return (await buildAndSendTx(player, 'report_sonar', params)).hash;
}

export async function claimVictory(gameId: number, player: string): Promise<string> {
  const params = [
    StellarSdk.nativeToScVal(gameId, { type: 'u32' }),
    new StellarSdk.Address(player).toScVal(),
  ];
  return (await buildAndSendTx(player, 'claim_victory', params)).hash;
}

export async function getGame(gameId: number): Promise<OnChainGame> {
  return readContract(
    'get_game',
    [StellarSdk.nativeToScVal(gameId, { type: 'u32' })],
    decodeGame
  );
}

// --- Polling utility ---
export function pollGameState(
  gameId: number,
  callback: (game: OnChainGame) => void,
  intervalMs = 2500
): () => void {
  let active = true;
  const poll = async () => {
    while (active) {
      try {
        const game = await getGame(gameId);
        if (active) callback(game);
      } catch {
        // Silently retry on transient RPC errors
      }
      await new Promise(r => setTimeout(r, intervalMs));
    }
  };
  poll();
  return () => { active = false; };
}
