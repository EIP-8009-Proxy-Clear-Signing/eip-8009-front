import { PublicClient } from 'viem';

export interface SimulationResult {
  assetChanges: ReadonlyArray<{
    token: {
      address: string;
      symbol?: string;
      decimals?: number;
    };
    value: { diff: bigint; pre: bigint; post: bigint };
  }>;
  results: ReadonlyArray<{
    status: 'success' | 'failure';
    gasUsed?: bigint;
  }>;
}

export interface OriginalSimulationParams {
  publicClient: PublicClient;
  address: `0x${string}`;
  tx: {
    to: string;
    data: string;
    value?: string | number;
  };
  maxRetries?: number;
  retryDelay?: number;
}

export interface ModifiedSimulationParams {
  publicClient: PublicClient;
  address: `0x${string}`;
  simulationContract: { address: string };
  simulationData: `0x${string}`;
  txValue: bigint;
  maxRetries?: number;
}

/**
 * Simulates the ORIGINAL Uniswap transaction for security verification
 * May fail (expected) because Permit2 validation happens on-chain
 */
export async function simulateOriginalTransaction(
  params: OriginalSimulationParams
): Promise<{ success: boolean; result?: SimulationResult }> {
  const {
    publicClient,
    address,
    tx,
    maxRetries = 100,
    retryDelay = 500,
  } = params;

  console.log('Simulating original transaction for approximate changes...');

  let retries = maxRetries;
  while (retries > 0) {
    try {
      const result = await publicClient.simulateCalls({
        traceAssetChanges: true,
        account: address,
        calls: [
          {
            to: tx.to as `0x${string}`,
            data: tx.data as `0x${string}`,
            value: BigInt(tx.value || 0),
          },
        ],
      });

      if (result.results[0].status === 'success') {
        console.log('Original simulation successful');
        return { success: true, result: result as SimulationResult };
      } else {
        console.warn('Original simulation returned failure status');
        retries -= 1;
        if (retries > 0) {
          await new Promise((resolve) => setTimeout(resolve, retryDelay));
        }
      }
    } catch {
      retries -= 1;
      if (retries > 0) {
        await new Promise((resolve) => setTimeout(resolve, retryDelay));
      } else {
        console.warn(
          'Original simulation failed after all retries (expected for Permit2)'
        );
      }
    }
  }

  return { success: false };
}

/**
 * Simulates the MODIFIED transaction through proxy
 * Returns REAL asset changes that will be shown to the user
 */
export async function simulateModifiedTransaction(
  params: ModifiedSimulationParams
): Promise<SimulationResult | null> {
  const {
    publicClient,
    address,
    simulationContract,
    simulationData,
    txValue,
    maxRetries = 100,
  } = params;

  console.log('Simulating modified transaction through proxy...');

  let retries = maxRetries;
  while (retries > 0) {
    try {
      const result = await publicClient.simulateCalls({
        traceAssetChanges: true,
        account: address,
        calls: [
          {
            to: simulationContract.address as `0x${string}`,
            data: simulationData,
            value: txValue,
          },
        ],
      });

      console.log('Proxy simulation successful');
      return result as SimulationResult;
    } catch (error) {
      console.warn('Proxy simulation failed:', error);
      retries -= 1;
    }
  }

  console.error('Proxy simulation failed after all retries');
  return null;
}

/**
 * Validates simulation result
 */
export function validateSimulationResult(simRes: SimulationResult): boolean {
  if (simRes.results[0].status !== 'success') {
    console.error(
      'Proxy simulation returned failure status:',
      simRes.results[0]
    );
    return false;
  }
  return true;
}

/**
 * Extracts input and output tokens from simulation result
 */
export function extractAssetChanges(simRes: SimulationResult): {
  from: SimulationResult['assetChanges'][0] | undefined;
  to: SimulationResult['assetChanges'][0] | undefined;
  gasUsed: bigint;
} {
  const from = simRes.assetChanges.find((asset) => asset.value.diff < 0);
  const to = simRes.assetChanges.find((asset) => asset.value.diff > 0);
  const gasUsed = simRes.results[0]?.gasUsed || 0n;

  return { from, to, gasUsed };
}
