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
      // We need to check both received and spent tokens

      // 1. Check received token (to): min final balance = pre + (diff * (1 - slippage))
      const toSlippageMultiplier = BigInt(
        Math.floor((1 - slippage / 100) * 10000)
      );
      const minExpectedGain = (to.value.diff * toSlippageMultiplier) / 10000n;
      const minFinalBalanceTo = to.value.pre + minExpectedGain;

      changePostTransferCheck(0, {
        target: String(address),
        token: formatToken(to.token.symbol, to.token.address),
        balance: formatBalancePrecise(
          minFinalBalanceTo,
          to.token.decimals || 18
        ),
      });

      // 2. Check spent token (from): max final balance = pre + (diff * (1 + slippage))
      // Since diff is negative for spent tokens, this calculates the minimum remaining balance
      const fromSlippageMultiplier = BigInt(
        Math.floor((1 + slippage / 100) * 10000)
      );
      const maxExpectedLoss =
        (from.value.diff * fromSlippageMultiplier) / 10000n;
      const minFinalBalanceFrom = from.value.pre + maxExpectedLoss;

      changePostTransferCheck(1, {
        target: String(address),
        token: formatToken(from.token.symbol, from.token.address),
        balance: formatBalancePrecise(
          minFinalBalanceFrom,
          from.token.decimals || 18
        ),
      });
    }
  }
}
