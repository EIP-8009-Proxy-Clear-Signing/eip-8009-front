import { PublicClient, erc20Abi, ethAddress, zeroAddress } from 'viem';
import { toast } from 'sonner';
import { formatBalance } from './utils';

export interface BalanceCheckParams {
  fromToken: {
    address: string;
    symbol?: string;
    decimals?: number;
  };
  fromValueDiff: bigint;
  slippage: number;
  publicClient: PublicClient;
  address: `0x${string}`;
}

export interface BalanceCheckResult {
  sufficient: boolean;
  userBalance: bigint;
  requiredAmount: bigint;
  rawAmount: bigint;
  shortfall?: bigint;
}

/**
 * Checks if user has sufficient balance for the transaction
 * Accounts for slippage buffer to prevent transaction failures
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
