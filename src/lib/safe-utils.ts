import {
  Address,
  Hex,
  PublicClient,
  decodeFunctionData,
  getAddress,
  hashMessage,
  isAddressEqual,
  recoverAddress,
  zeroAddress,
} from 'viem';
import { safeAbi } from './abis/safe.abi';

export type SafeOperation = 0 | 1;

export type SafeTx = {
  to: Address;
  value: bigint;
  data: Hex;
  operation: SafeOperation;
  safeTxGas: bigint;
  baseGas: bigint;
  gasPrice: bigint;
  gasToken: Address;
  refundReceiver: Address;
  signatures: Hex;
  routerSigPosition: bigint;
};

export type SafeExecutionRequest = {
  safe: Address;
  safeTx: SafeTx;
};

type ParsedSafeSignature = {
  signature: Hex;
  owner: Address;
  v: number;
};

export function toBigIntValue(value?: string | number | bigint): bigint {
  if (value === undefined || value === null || value === '') return 0n;
  return BigInt(value);
}

export function decodeSafeExecTransaction(
  safeAddress: Address,
  data?: Hex
): SafeExecutionRequest | null {
  if (!data || data === '0x') return null;

  try {
    const decoded = decodeFunctionData({
      abi: safeAbi,
      data,
    });

    if (decoded.functionName !== 'execTransaction') return null;

    const [
      to,
      value,
      safeData,
      operation,
      safeTxGas,
      baseGas,
      gasPrice,
      gasToken,
      refundReceiver,
      signatures,
    ] = decoded.args;

    if (operation !== 0 && operation !== 1) {
      throw new Error(`Unsupported Safe operation: ${operation}`);
    }

    return {
      safe: getAddress(safeAddress),
      safeTx: {
        to: getAddress(to),
        value,
        data: safeData,
        operation,
        safeTxGas,
        baseGas,
        gasPrice,
        gasToken: getAddress(gasToken),
        refundReceiver: getAddress(refundReceiver),
        signatures,
        routerSigPosition: 0n,
      },
    };
  } catch (error) {
    console.debug('Not a Safe execTransaction request:', error);
    return null;
  }
}

export async function validateSafeRouterSetup(params: {
  publicClient: PublicClient;
  safe: Address;
  safeRouter: Address;
  executor: Address;
}) {
  const { publicClient, safe, safeRouter, executor } = params;

  const [executorIsOwner, routerIsOwner] = await Promise.all([
    publicClient.readContract({
      abi: safeAbi,
      address: safe,
      functionName: 'isOwner',
      args: [executor],
    }),
    publicClient.readContract({
      abi: safeAbi,
      address: safe,
      functionName: 'isOwner',
      args: [safeRouter],
    }),
  ]);

  if (!executorIsOwner) {
    throw new Error('Connected wallet is not an owner of this Safe');
  }

  if (!routerIsOwner) {
    throw new Error('SafeRouter is not an owner of this Safe');
  }
}

export async function prepareSafeRouterSafeTx(params: {
  publicClient: PublicClient;
  safe: Address;
  safeRouter: Address;
  safeTx: SafeTx;
}): Promise<SafeTx> {
  const { publicClient, safe, safeRouter, safeTx } = params;
  const safeTxHash = await getSafeTxHash(publicClient, safe, safeTx);
  const parsed = await parseSafeSignatures(safeTx.signatures, safeTxHash);
  const validSignatures: ParsedSafeSignature[] = [];

  for (const item of parsed) {
    if (isAddressEqual(item.owner, safeRouter)) {
      continue;
    }

    if (item.v === 1) {
      const approved = await publicClient.readContract({
        abi: safeAbi,
        address: safe,
        functionName: 'approvedHashes',
        args: [item.owner, safeTxHash],
      });

      if (approved === 0n) {
        continue;
      }
    }

    validSignatures.push(item);
  }

  const threshold = await publicClient.readContract({
    abi: safeAbi,
    address: safe,
    functionName: 'getThreshold',
  });

  if (BigInt(validSignatures.length + 1) < threshold) {
    throw new Error(
      `Not enough Safe signatures for router execution: ${validSignatures.length + 1}/${threshold}`
    );
  }

  const routerSigPosition = validSignatures.filter(
    ({ owner }) => BigInt(owner) < BigInt(safeRouter)
  ).length;

  return {
    ...safeTx,
    signatures: joinSafeSignatures(
      validSignatures.map(({ signature }) => signature)
    ),
    routerSigPosition: BigInt(routerSigPosition),
  };
}

async function getSafeTxHash(
  publicClient: PublicClient,
  safe: Address,
  safeTx: SafeTx
): Promise<Hex> {
  const nonce = await publicClient.readContract({
    abi: safeAbi,
    address: safe,
    functionName: 'nonce',
  });

  return await publicClient.readContract({
    abi: safeAbi,
    address: safe,
    functionName: 'getTransactionHash',
    args: [
      safeTx.to,
      safeTx.value,
      safeTx.data,
      safeTx.operation,
      safeTx.safeTxGas,
      safeTx.baseGas,
      safeTx.gasPrice,
      safeTx.gasToken || zeroAddress,
      safeTx.refundReceiver || zeroAddress,
      nonce,
    ],
  });
}

async function parseSafeSignatures(
  signatures: Hex,
  safeTxHash: Hex
): Promise<ParsedSafeSignature[]> {
  if (signatures === '0x') return [];

  const hex = signatures.slice(2);
  const signatureHexLength = 65 * 2;

  if (hex.length % signatureHexLength !== 0) {
    throw new Error(
      'Safe contract signatures are not supported by this SafeRouter version'
    );
  }

  const chunks: Hex[] = [];
  for (let offset = 0; offset < hex.length; offset += signatureHexLength) {
    chunks.push(`0x${hex.slice(offset, offset + signatureHexLength)}`);
  }

  return Promise.all(
    chunks.map(async (signature) => ({
      signature,
      ...(await getSignatureOwner(signature, safeTxHash)),
    }))
  );
}

async function getSignatureOwner(
  signature: Hex,
  safeTxHash: Hex
): Promise<{ owner: Address; v: number }> {
  const raw = signature.slice(2);
  const r = `0x${raw.slice(0, 64)}` as Hex;
  const s = `0x${raw.slice(64, 128)}` as Hex;
  const v = Number.parseInt(raw.slice(128, 130), 16);

  if (v === 0) {
    throw new Error(
      'Safe contract signatures are not supported by this SafeRouter version'
    );
  }

  if (v === 1) {
    return {
      owner: getAddress(`0x${r.slice(-40)}`),
      v,
    };
  }

  const isEthSign = v > 30;
  const recoveryV = isEthSign ? v - 4 : v;
  const hash = isEthSign ? hashMessage({ raw: safeTxHash }) : safeTxHash;
  const owner = await recoverAddress({
    hash,
    signature: {
      r,
      s,
      v: BigInt(recoveryV),
    },
  });

  return { owner: getAddress(owner), v };
}

function joinSafeSignatures(signatures: Hex[]): Hex {
  if (signatures.length === 0) return '0x';
  return `0x${signatures.map((signature) => signature.slice(2)).join('')}`;
}
