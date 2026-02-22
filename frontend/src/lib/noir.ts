import { Noir } from '@noir-lang/noir_js';
import { BarretenbergBackend } from '@noir-lang/backend_barretenberg';

let boardCircuit: any = null;
let shotCircuit: any = null;

async function loadCircuit(name: string) {
  const res = await fetch(`/circuits/${name}.json`);
  return await res.json();
}

export async function initCircuits() {
  if (!boardCircuit) boardCircuit = await loadCircuit('board');
  if (!shotCircuit) shotCircuit = await loadCircuit('shot');
}

export interface BoardProofResult {
  proof: Uint8Array;
  boardHash: string;
}

export interface ShotProofResult {
  proof: Uint8Array;
}

// Generate a board proof. Returns the proof and the computed board hash.
export async function generateBoardProof(ships: string[]): Promise<BoardProofResult> {
  await initCircuits();

  const backend = new BarretenbergBackend(boardCircuit);
  const noir = new Noir(boardCircuit, backend);

  const { witness, returnValue } = await noir.execute({ ships });

  // returnValue is the Pedersen hash of the ships array
  const boardHash = returnValue as string;

  const proof = await backend.generateProof(witness);

  await backend.destroy();

  return { proof: proof.proof, boardHash };
}

// Verify a board proof
export async function verifyBoardProof(proof: Uint8Array, boardHash: string): Promise<boolean> {
  await initCircuits();

  const backend = new BarretenbergBackend(boardCircuit);

  try {
    const verified = await backend.verifyProof({
      proof,
      publicInputs: [boardHash],
    });
    return verified;
  } finally {
    await backend.destroy();
  }
}

// Generate a shot proof
export async function generateShotProof(
  ships: string[],
  boardHash: string,
  shotX: number,
  shotY: number,
  isHit: boolean
): Promise<ShotProofResult> {
  await initCircuits();

  const backend = new BarretenbergBackend(shotCircuit);
  const noir = new Noir(shotCircuit, backend);

  const { witness } = await noir.execute({
    hash: boardHash,
    hit: isHit ? '1' : '0',
    ships,
    shot_x: shotX.toString(),
    shot_y: shotY.toString(),
  });

  const proof = await backend.generateProof(witness);

  await backend.destroy();

  return { proof: proof.proof };
}

// Verify a shot proof
export async function verifyShotProof(
  proof: Uint8Array,
  boardHash: string,
  hit: boolean,
  shotX: number,
  shotY: number
): Promise<boolean> {
  await initCircuits();

  const backend = new BarretenbergBackend(shotCircuit);

  try {
    const verified = await backend.verifyProof({
      proof,
      publicInputs: [boardHash, hit ? '1' : '0', shotX.toString(), shotY.toString()],
    });
    return verified;
  } finally {
    await backend.destroy();
  }
}
