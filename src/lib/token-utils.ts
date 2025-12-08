import { PublicClient, erc20Abi } from 'viem';

/**
 * Token metadata including symbol and decimals
 */
export interface TokenMetadata {
  /** Token symbol (e.g., "USDC", "WETH", "DAI") */
  symbol: string;
  /** Number of decimal places (e.g., 6 for USDC, 18 for WETH) */
  decimals: number;
}

/**
 * Fetches token metadata (symbol and decimals) from blockchain
 *
 * This function retrieves essential token information needed for:
 * - Displaying token amounts correctly (using decimals)
 * - Showing token names in UI (using symbol)
 * - Formatting balance displays
 *
 * **Special Cases**:
 * - **ETH**: Returns { symbol: "ETH", decimals: 18 } without RPC call
 * - **No address**: Assumes ETH and returns default values
 *
 * **Implementation**:
 * - Uses `multicall` for efficiency (single RPC call for both values)
 * - Queries `symbol()` and `decimals()` functions on ERC-20 contract
 * - `allowFailure: false` means it throws if either call fails
 *
 * @param tokenAddress - Contract address of the token (or undefined for ETH)
 * @param publicClient - Viem public client for blockchain queries
 * @param isEth - Whether the token is native ETH (bypasses contract call)
 * @returns Token metadata with symbol and decimals
 *
 * @example
 * // Example 1: ERC-20 token (USDC)
 * const metadata = await getTokenMetadata(
 *   "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
 *   publicClient,
 *   false
 * );
 * // metadata: { symbol: "USDC", decimals: 6 }
 *
 * @example
 * // Example 2: Native ETH (no contract call)
 * const metadata = await getTokenMetadata(
 *   undefined,
 *   publicClient,
 *   true
 * );
 * // metadata: { symbol: "ETH", decimals: 18 }
 *
 * @example
 * // Example 3: WETH token
 * const metadata = await getTokenMetadata(
 *   "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
 *   publicClient
 * );
 * // metadata: { symbol: "WETH", decimals: 18 }
 */
export async function getTokenMetadata(
  tokenAddress: string | undefined,
  publicClient: PublicClient,
  isEth: boolean = false
): Promise<TokenMetadata> {
  if (isEth || !tokenAddress) {
    return { symbol: 'ETH', decimals: 18 };
  }

  const [symbol, decimals] = await publicClient.multicall({
    contracts: [
      {
        abi: erc20Abi,
        address: tokenAddress as `0x${string}`,
        functionName: 'symbol' as const,
        args: [],
      },
      {
        abi: erc20Abi,
        address: tokenAddress as `0x${string}`,
        functionName: 'decimals' as const,
        args: [],
      },
    ],
    allowFailure: false,
  });

  return { symbol, decimals };
}
