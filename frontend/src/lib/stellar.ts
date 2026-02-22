import {
  isConnected,
  requestAccess,
  signTransaction,
} from '@stellar/freighter-api';
import * as StellarSdk from '@stellar/stellar-sdk';

// --- Config ---
export const TESTNET_RPC = 'https://soroban-testnet.stellar.org';
export const TESTNET_PASSPHRASE = StellarSdk.Networks.TESTNET;
export const CONTRACT_ID = 'CBOJUXTKNDDK6A6IT675ORR5LLAWYIMAGSPIFYESSWYXGXOVHRLEPN5D';
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
async function buildAndSendTx(
  callerAddress: string,
  method: string,
  params: StellarSdk.xdr.ScVal[]
): Promise<string> {
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

  return sendResult.hash;
}

// --- Read-only call helper ---
async function readContract<T>(
  method: string,
  params: StellarSdk.xdr.ScVal[],
  decoder: (val: StellarSdk.xdr.ScVal) => T
): Promise<T> {
  // Use a throwaway source account for simulation
  const dummyKeypair = StellarSdk.Keypair.random();
  const dummyPubkey = dummyKeypair.publicKey();
  const account = new StellarSdk.Account(dummyPubkey, '0');
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
}

function decodeGame(val: StellarSdk.xdr.ScVal): OnChainGame {
  const native = StellarSdk.scValToNative(val) as Record<string, unknown>;
  return {
    player1: native.player1 as string,
    player2: native.player2 as string,
    boardHash1: native.board_hash1 as string,
    boardHash2: native.board_hash2 as string,
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
  };
}

// --- Contract calls ---

export async function newGame(player1: string): Promise<{ gameId: number; txHash: string }> {
  const params = [new StellarSdk.Address(player1).toScVal()];
  const txHash = await buildAndSendTx(player1, 'new_game', params);

  // Read the game count to get the new game ID
  const gameId = await readContract(
    'game_count',
    [],
    (val) => Number(StellarSdk.scValToNative(val))
  );

  return { gameId, txHash };
}

export async function joinGame(gameId: number, player2: string): Promise<string> {
  const params = [
    StellarSdk.nativeToScVal(gameId, { type: 'u32' }),
    new StellarSdk.Address(player2).toScVal(),
  ];
  return buildAndSendTx(player2, 'join_game', params);
}

export async function commitBoard(
  gameId: number,
  player: string,
  boardHash: string
): Promise<string> {
  // boardHash is a hex string — convert to 32 bytes
  const hashBytes = Buffer.from(boardHash.replace('0x', ''), 'hex');
  const params = [
    StellarSdk.nativeToScVal(gameId, { type: 'u32' }),
    new StellarSdk.Address(player).toScVal(),
    StellarSdk.nativeToScVal(hashBytes, { type: 'bytes' }),
  ];
  return buildAndSendTx(player, 'commit_board', params);
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
  return buildAndSendTx(player, 'take_shot', params);
}

export async function reportResult(
  gameId: number,
  player: string,
  hit: boolean
): Promise<string> {
  const params = [
    StellarSdk.nativeToScVal(gameId, { type: 'u32' }),
    new StellarSdk.Address(player).toScVal(),
    StellarSdk.nativeToScVal(hit, { type: 'bool' }),
  ];
  return buildAndSendTx(player, 'report_result', params);
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
  return buildAndSendTx(player, 'use_sonar', params);
}

export async function reportSonar(
  gameId: number,
  player: string,
  count: number
): Promise<string> {
  const params = [
    StellarSdk.nativeToScVal(gameId, { type: 'u32' }),
    new StellarSdk.Address(player).toScVal(),
    StellarSdk.nativeToScVal(count, { type: 'u32' }),
  ];
  return buildAndSendTx(player, 'report_sonar', params);
}

export async function claimVictory(gameId: number, player: string): Promise<string> {
  const params = [
    StellarSdk.nativeToScVal(gameId, { type: 'u32' }),
    new StellarSdk.Address(player).toScVal(),
  ];
  return buildAndSendTx(player, 'claim_victory', params);
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
