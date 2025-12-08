import { PublicClient } from 'viem';

/**
 * Represents the result of a transaction simulation
 * Contains asset changes (token balances) and execution results
 */
export interface SimulationResult {
  /** Array of token balance changes detected during simulation */
  assetChanges: ReadonlyArray<{
    token: {
      address: string;
      symbol?: string;
      decimals?: number;
    };
    /** Balance change: diff (change amount), pre (before), post (after) */
    value: { diff: bigint; pre: bigint; post: bigint };
  }>;
  /** Execution results for each call in the simulation */
  results: ReadonlyArray<{
    status: 'success' | 'failure';
    gasUsed?: bigint;
  }>;
}

/**
 * Parameters for simulating the original transaction
 * Used to validate the user's intent before modification
 */
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

/**
 * Parameters for simulating the modified (proxy) transaction
 * Used to get accurate balance changes for UI display
 */
export interface ModifiedSimulationParams {
  publicClient: PublicClient;
  address: `0x${string}`;
  simulationContract: { address: string };
  simulationData: `0x${string}`;
  txValue: bigint;
  maxRetries?: number;
}

/**
 * Simulates the ORIGINAL transaction to validate user intent and extract approval amounts
 *
 * This is Phase 1 of the two-phase simulation system. It attempts to simulate the
 * original Uniswap transaction as-is, which may fail due to Permit2 validation
 * (expected behavior). The goal is to:
 * - Verify the transaction structure is valid
 * - Extract the approval amount needed for the swap
 * - Ensure the transaction intent matches user expectations
 *
 * @param params - Simulation parameters including transaction details
 * @returns Promise resolving to success status and optional simulation result
 *
 * @example
 * const { success, result } = await simulateOriginalTransaction({
 *   publicClient,
 *   address: userAddress,
 *   tx: { to: uniswapRouter, data: swapCalldata, value: 0 }
 * });
 *
 * if (success && result) {
 *   // Extract approval amount from asset changes
 *   const approvalAmount = result.assetChanges[0].value.diff;
 * }
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
 * Simulates the MODIFIED transaction through the proxy contract
 *
 * This is Phase 2 of the two-phase simulation system. It simulates the transaction
 * after calldata modification, routing through the proxy contract. This simulation:
 * - Uses modified calldata with proxy address substitutions
 * - Returns ACCURATE asset changes that will be shown to the user
 * - Includes gas estimation for the actual execution
 * - Validates that the proxy routing works correctly
 *
 * The returned balance changes are used to populate the UI and balance checks.
 *
 * @param params - Simulation parameters including proxy contract and modified data
 * @returns Promise resolving to simulation result or null if failed
 *
 * @example
 * const simRes = await simulateModifiedTransaction({
 *   publicClient,
 *   address: userAddress,
 *   simulationContract: { address: permitRouter },
 *   simulationData: encodedProxyCall,
 *   txValue: 0n
 * });
 *
 * if (simRes) {
 *   const { from, to } = extractAssetChanges(simRes);
 *   console.log(`Spending ${from.value.diff} ${from.token.symbol}`);
 *   console.log(`Receiving ${to.value.diff} ${to.token.symbol}`);
 * }
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
 * Validates that a simulation completed successfully
 *
 * Checks the simulation result to ensure the transaction would execute
 * without reverting. Returns false if the simulation indicates failure.
 *
 * @param simRes - The simulation result to validate
 * @returns true if simulation was successful, false otherwise
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
 * Extracts token input/output and gas information from simulation
 *
 * Analyzes the asset changes array to identify:
 * - `from`: Token being spent (negative diff)
 * - `to`: Token being received (positive diff)
 * - `gasUsed`: Estimated gas consumption
 *
 * This information is used to:
 * - Populate balance checks with expected changes
 * - Display swap details to the user
 * - Calculate gas fees for ETH balance validation
 *
 * @param simRes - The simulation result containing asset changes
 * @returns Object with from token, to token, and gas used
 *
 * @example
 * const { from, to, gasUsed } = extractAssetChanges(simRes);
 *
 * // from.token.address: "0x..." (USDC)
 * // from.value.diff: -1000000n (spending 1 USDC)
 * // to.token.address: "0x000..." (ETH)
 * // to.value.diff: 500000000000000n (receiving 0.0005 ETH)
 * // gasUsed: 200000n
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
