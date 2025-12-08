import { PublicClient, erc20Abi, ethAddress, zeroAddress } from 'viem';
import { toast } from 'sonner';
import { formatBalance } from './utils';

/**
 * Parameters for checking if user has sufficient balance for a transaction
 */
export interface BalanceCheckParams {
  /** Token being spent (contains address, symbol, decimals) */
  fromToken: {
    address: string;
    symbol?: string;
    decimals?: number;
  };
  /** Expected balance change (negative for spending) */
  fromValueDiff: bigint;
  /** Slippage percentage to add as buffer (e.g., 3.0 for 3%) */
  slippage: number;
  publicClient: PublicClient;
  /** User's wallet address */
  address: `0x${string}`;
}

/**
 * Result of balance sufficiency check
 */
export interface BalanceCheckResult {
  /** Whether user has sufficient balance (including slippage buffer) */
  sufficient: boolean;
  /** User's current token balance */
  userBalance: bigint;
  /** Amount required (raw amount + slippage buffer) */
  requiredAmount: bigint;
  /** Raw amount needed without slippage */
  rawAmount: bigint;
  /** Amount short if insufficient (undefined if sufficient) */
  shortfall?: bigint;
}

/**
 * Checks if user has sufficient balance for a transaction
 *
 * This function validates that the user has enough tokens to complete a swap,
 * accounting for slippage protection. The slippage buffer prevents transaction
 * failures due to price movements between simulation and execution.
 *
 * **Calculation**:
 * - Raw amount: Absolute value of balance change (e.g., -1000000n → 1000000n)
 * - Required amount: rawAmount × (1 + slippage/100)
 * - Example: 1 USDC with 3% slippage = 1.03 USDC required
 *
 * **For ETH**:
 * - Uses `getBalance()` to fetch native balance
 * - Includes gas costs in withdrawal checks (handled by caller)
 *
 * **For ERC-20 tokens**:
 * - Uses `balanceOf()` to fetch token balance
 * - No gas consideration needed (gas paid in ETH separately)
 *
 * **On Failure**:
 * - Shows detailed toast error with:
 *   - Token symbol and amounts
 *   - Required amount (including slippage)
 *   - Available balance
 *   - Shortfall amount
 * - Returns `sufficient: false` with shortfall details
 *
 * @param params - Parameters including token details and slippage
 * @returns Balance check result with sufficiency status and amounts
 *
 * @example
 * // Example 1: Sufficient balance
 * const result = await checkSufficientBalance({
 *   fromToken: { address: USDC, symbol: "USDC", decimals: 6 },
 *   fromValueDiff: -1000000n, // Spending 1 USDC
 *   slippage: 3.0,             // 3% buffer
 *   publicClient,
 *   address: userAddress
 * });
 * // result: {
 * //   sufficient: true,
 * //   userBalance: 5000000n,    // Has 5 USDC
 * //   requiredAmount: 1030000n, // Needs 1.03 USDC (with slippage)
 * //   rawAmount: 1000000n       // Raw 1 USDC
 * // }
 *
 * @example
 * // Example 2: Insufficient balance (shows error toast)
 * const result = await checkSufficientBalance({
 *   fromToken: { address: WETH, symbol: "WETH", decimals: 18 },
 *   fromValueDiff: -1000000000000000000n, // Spending 1 WETH
 *   slippage: 3.0,
 *   publicClient,
 *   address: userAddress
 * });
 * // result: {
 * //   sufficient: false,
 * //   userBalance: 500000000000000000n,  // Has 0.5 WETH
 * //   requiredAmount: 1030000000000000000n, // Needs 1.03 WETH
 * //   rawAmount: 1000000000000000000n,
 * //   shortfall: 530000000000000000n    // Short 0.53 WETH
 * // }
 * // Toast: "Insufficient WETH balance. You need 1.03 (including 3% slippage
 * //         buffer) but only have 0.5. Shortfall: 0.53 WETH"
 */
export async function checkSufficientBalance(
  params: BalanceCheckParams
): Promise<BalanceCheckResult> {
  const { fromToken, fromValueDiff, slippage, publicClient, address } = params;

  const isFromEth =
    fromToken.address === zeroAddress || fromToken.address === ethAddress;

  const rawAmount = -fromValueDiff;
  const requiredAmount = BigInt(
    Math.ceil(Number(rawAmount) * (1 + slippage / 100))
  );

  let userBalance: bigint;

  if (isFromEth) {
    userBalance = await publicClient.getBalance({ address });
  } else {
    userBalance = await publicClient.readContract({
      abi: erc20Abi,
      address: fromToken.address as `0x${string}`,
      functionName: 'balanceOf',
      args: [address],
    });
  }

  const tokenSymbol = fromToken.symbol || 'TOKEN';
  const tokenDecimals = fromToken.decimals || 18;

  console.log('Balance check:', {
    token: tokenSymbol,
    rawAmount: rawAmount.toString(),
    requiredWithSlippage: requiredAmount.toString(),
    slippagePercent: slippage,
    available: userBalance.toString(),
    sufficient: userBalance >= requiredAmount,
  });

  const sufficient = userBalance >= requiredAmount;

  if (!sufficient) {
    const shortfall = requiredAmount - userBalance;
    console.error('Insufficient balance for transaction');
    toast.error(
      `Insufficient ${tokenSymbol} balance. You need ${formatBalance(requiredAmount, tokenDecimals)} (including ${slippage}% slippage buffer) but only have ${formatBalance(userBalance, tokenDecimals)}. Shortfall: ${formatBalance(shortfall, tokenDecimals)} ${tokenSymbol}`,
      { duration: 10000 }
    );
    return {
      sufficient: false,
      userBalance,
      requiredAmount,
      rawAmount,
      shortfall,
    };
  }

  return { sufficient: true, userBalance, requiredAmount, rawAmount };
}
