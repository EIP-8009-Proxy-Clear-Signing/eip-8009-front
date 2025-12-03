import { EMode, Check } from '@/hooks/use-checks';
import { formatBalance, formatToken, formatBalancePrecise } from './utils';
import { SimulationResult } from './simulation-utils';

export interface PopulateFormParams {
  from: SimulationResult['assetChanges'][0];
  to: SimulationResult['assetChanges'][0];
  txTo: string;
  address: string;
  slippage: number;
  mode: string;
  appSymbol: string;
  appDecimals: number;
  withSymbol: string;
  withDecimals: number;
  changeApprovalCheck: (index: number, check: Check) => void;
  changeWithdrawalCheck: (index: number, check: Check) => void;
  changeDiffsCheck: (index: number, check: Check) => void;
  changePostTransferCheck: (index: number, check: Check) => void;
}

/**
 * Populates form checks with values from simulation results
 * All values come from the MODIFIED simulation for UI consistency
 */
export function populateFormChecks(params: PopulateFormParams): void {
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
    changeApprovalCheck,
    changeWithdrawalCheck,
    changeDiffsCheck,
    changePostTransferCheck,
  } = params;

  // Set approval check - use the value FROM MODIFIED SIMULATION
  // This ensures UI consistency: everything shown to user comes from the same simulation
  const approvalBalance = formatBalance(-from.value.diff, from.token.decimals);

  changeApprovalCheck(0, {
    target: txTo,
    token: formatToken(from.token.symbol, from.token.address),
    balance: approvalBalance,
    symbol: appSymbol,
    decimals: appDecimals,
  });

  // Set withdrawal check with slippage
  changeWithdrawalCheck(0, {
    target: String(address),
    token: formatToken(to.token.symbol, to.token.address),
    balance:
      formatBalance(to.value.diff, to.token.decimals) * (1 - slippage / 100),
    symbol: withSymbol,
    decimals: withDecimals,
  });

  // Set diff checks based on mode
  switch (mode) {
    case EMode.diifs: {
      changeDiffsCheck(0, {
        target: String(address),
        token: formatToken(to.token.symbol, to.token.address),
        balance:
          formatBalance(to.value.diff, to.token.decimals) *
          (1 - slippage / 100),
      });

      // Always add the input token to diffs (including ETH)
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
      // For pre/post mode, proxyCallMeta checks ABSOLUTE final balance
      // Calculate in bigint to avoid precision loss:
      // minFinalBalance = pre + (diff * (100 - slippage) / 100)
      const slippageMultiplier = BigInt(
        Math.floor((1 - slippage / 100) * 10000)
      );
      const minExpectedGain = (to.value.diff * slippageMultiplier) / 10000n;
      const minFinalBalanceBigInt = to.value.pre + minExpectedGain;

      // Convert to string preserving full precision (no float conversion!)
      const minFinalBalance = formatBalancePrecise(
        minFinalBalanceBigInt,
        to.token.decimals || 18
      );

      changePostTransferCheck(0, {
        target: String(address),
        token: formatToken(to.token.symbol, to.token.address),
        balance: minFinalBalance, // Now a string with full precision
      });

      break;
    }
  }
}
