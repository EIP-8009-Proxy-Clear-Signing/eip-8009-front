import { PublicClient, erc20Abi } from 'viem';

export interface TokenMetadata {
  symbol: string;
  decimals: number;
}

/**
 * Fetches token symbol and decimals
 * Returns ETH defaults if no address provided
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
