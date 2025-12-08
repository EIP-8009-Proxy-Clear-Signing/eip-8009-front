import { EMode, Check } from '@/hooks/use-checks';
import { formatBalance, formatToken, formatBalancePrecise } from './utils';
import { SimulationResult } from './simulation-utils';
import { ethAddress, zeroAddress } from 'viem';
import { getGasPrice } from '@wagmi/core';
import { wagmiConfig } from '@/config/wagmi-config';

/**
 * Parameters required to populate balance checks in the transaction form
 * All values come from the modified simulation to ensure UI consistency
 */
export interface PopulateFormParams {
  /** Token being spent (negative diff) */
  from: SimulationResult['assetChanges'][0];
  /** Token being received (positive diff) */
  to: SimulationResult['assetChanges'][0];
  /** Target contract address (e.g., Uniswap Router) */
  txTo: string;
  /** User's wallet address */
  address: string;
  /** Slippage tolerance as percentage (e.g., 0.5 for 0.5%) */
  slippage: number;
  /** Check mode: "diifs" or "pre/post" */
  mode: string;
  /** Symbol of token being approved (for approval check) */
  appSymbol: string;
  /** Decimals of token being approved */
  appDecimals: number;
  /** Symbol of token being withdrawn (for withdrawal check) */
  withSymbol: string;
  /** Decimals of token being withdrawn */
  withDecimals: number;
  /** Estimated gas for the transaction (used for ETH balance validation) */
  gasUsed: bigint;
  /** Chain ID for gas price fetching (must match supported chains: 1, 8453, 11155111) */
  chainId: 1 | 8453 | 11155111;
  /** Callback to update approval check */
  changeApprovalCheck: (index: number, check: Check) => void;
  /** Callback to update withdrawal check */
  changeWithdrawalCheck: (index: number, check: Check) => void;
  /** Callback to update diffs check */
  changeDiffsCheck: (index: number, check: Check) => void;
  /** Callback to update pre-transfer check */
  changePreTransferCheck: (index: number, check: Check) => void;
  /** Callback to update post-transfer check */
  changePostTransferCheck: (index: number, check: Check) => void;
}

/**
 * Populates all balance checks for the transaction form based on simulation results
 *
 * This function is the core of the balance validation system. It takes simulation
 * results and populates UI checks that will be validated on-chain. The function:
 *
 * 1. **Approval Check**: Amount user needs to approve for the target contract
 * 2. **Withdrawal Check**: Minimum tokens user will receive (with slippage)
 * 3. **Mode-Specific Checks**:
 *    - Diffs Mode: Validates balance CHANGES (deltas)
 *    - Pre/Post Mode: Validates ABSOLUTE balances before and after
 *
 * For Pre/Post mode with ETH, this function accounts for gas fees by subtracting
 * estimated gas cost from the expected final balance.
 *
 * @param params - All parameters needed for check population
 *
 * @example
 * await populateFormChecks({
 *   from: { token: { address: USDC }, value: { diff: -1000000n, pre: 5000000n } },
 *   to: { token: { address: ETH }, value: { diff: 500000000000000n, pre: 1000000000000000n } },
 *   slippage: 0.5,
 *   mode: EMode.diifs,
 *   gasUsed: 200000n,
 *   // ... other params
 * });
 */
export async function populateFormChecks(
  params: PopulateFormParams
): Promise<void> {
  const {
    from,
    to,
    txTo,
    address,
    slippage,
    mode,
    appSymbol,
    appDecimals,
    withSymbol,
    withDecimals,
    gasUsed,
    chainId,
    changeApprovalCheck,
    changeWithdrawalCheck,
    changeDiffsCheck,
    changePreTransferCheck,
    changePostTransferCheck,
  } = params;

  // Approval check: how much the user needs to approve for the target contract
  const approvalBalance = formatBalance(-from.value.diff, from.token.decimals);

  changeApprovalCheck(0, {
    target: txTo,
    token: formatToken(from.token.symbol, from.token.address),
    balance: approvalBalance,
    symbol: appSymbol,
    decimals: appDecimals,
  });

  // Withdrawal check: minimum tokens the user will receive (accounting for slippage)
  changeWithdrawalCheck(0, {
    target: String(address),
    token: formatToken(to.token.symbol, to.token.address),
    balance:
      formatBalance(to.value.diff, to.token.decimals) * (1 - slippage / 100),
    symbol: withSymbol,
    decimals: withDecimals,
  });

  // Populate mode-specific balance checks
  switch (mode) {
    case EMode.diifs: {
      // DIFFS MODE: Validates balance CHANGES (deltas)
      // Check 1: Minimum tokens received (positive diff with slippage protection)
      changeDiffsCheck(0, {
        target: String(address),
        token: formatToken(to.token.symbol, to.token.address),
        balance:
          formatBalance(to.value.diff, to.token.decimals) *
          (1 - slippage / 100),
      });

      // Check 2: Maximum tokens spent (negative diff with slippage protection)
      const inputBalance = -(
        formatBalance(from.value.diff, from.token.decimals) *
        (1 + slippage / 100)
      );

      changeDiffsCheck(1, {
        target: String(address),
        token: formatToken(from.token.symbol, from.token.address),
        balance: inputBalance,
      });

      break;
    }

    case EMode['pre/post']: {
      // PRE/POST MODE: Validates ABSOLUTE balances before and after transaction
      changePreTransferCheck(0, {
        target: String(address),
        token: formatToken(to.token.symbol, to.token.address),
        balance: formatBalancePrecise(to.value.pre, to.token.decimals || 18),
      });

      changePreTransferCheck(1, {
        target: String(address),
        token: formatToken(from.token.symbol, from.token.address),
        balance: formatBalancePrecise(
          from.value.pre,
          from.token.decimals || 18
        ),
      });

      const checkForETH = (token: string) => {
        // return false;

        return token === zeroAddress || token === ethAddress;
      };

      const isToEth = checkForETH(to.token.address);

      console.log('gasUsed in populateFormChecks:', gasUsed);

      // Post-transfer checks: final balances with slippage tolerance
      const toSlippageMultiplier = BigInt(
        Math.floor((1 - slippage / 100) * 1000000)
      );

      // Calculate gas cost for ETH balance validation
      // Use 125% of estimated gas as buffer for safety
      const calcGas = (gasUsed * 125n) / 100n;
      const gasPrice = await getGasPrice(wagmiConfig, {
        chainId,
      });
      console.log('gasPrice in populateFormChecks:', gasPrice);
      const gasConst = calcGas * gasPrice;
      const minExpectedGain = (to.value.diff * toSlippageMultiplier) / 1000000n;
      let minFinalBalanceTo = to.value.pre + minExpectedGain;
      if (isToEth) {
        minFinalBalanceTo -= gasConst;
      }

      console.log({
        slippage,
        toSlippageMultiplier,
        minExpectedGain,
        pre: to.value.pre,
        minFinalBalanceTo,
        gasUsed,
        gasConst,
        calcGas,
      });

      // if (!isToEth) {
      changePostTransferCheck(0, {
        target: String(address),
        token: formatToken(to.token.symbol, to.token.address),
        balance: formatBalancePrecise(
          minFinalBalanceTo,
          to.token.decimals || 18
        ),
      });
      // }

      const fromSlippageMultiplier = BigInt(
        Math.floor((1 + slippage / 100) * 1000000)
      );
      const maxExpectedLoss =
        (from.value.diff * fromSlippageMultiplier) / 1000000n;

      const isFromEth = checkForETH(from.token.address);
      let minFinalBalanceFrom = from.value.pre + maxExpectedLoss;

      if (isFromEth) {
        minFinalBalanceFrom -= gasUsed * 1500000000n;
      }

      // if (!isFromEth) {
      changePostTransferCheck(1, {
        target: String(address),
        token: formatToken(from.token.symbol, from.token.address),
        balance: formatBalancePrecise(
          minFinalBalanceFrom,
          from.token.decimals || 18
        ),
      });
      // }

      break;
    }
  }
}
