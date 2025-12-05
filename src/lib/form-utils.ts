import { EMode, Check } from '@/hooks/use-checks';
import { formatBalance, formatToken, formatBalancePrecise } from './utils';
import { SimulationResult } from './simulation-utils';
import { ethAddress, zeroAddress } from 'viem';
import { getGasPrice } from '@wagmi/core';
import { wagmiConfig } from '@/config/wagmi-config';

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
  gasUsed: bigint;
  chainId: number;
  changeApprovalCheck: (index: number, check: Check) => void;
  changeWithdrawalCheck: (index: number, check: Check) => void;
  changeDiffsCheck: (index: number, check: Check) => void;
  changePreTransferCheck: (index: number, check: Check) => void;
  changePostTransferCheck: (index: number, check: Check) => void;
}

/**
 * Populates form checks with values from simulation results
 * All values come from the MODIFIED simulation for UI consistency
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

  const approvalBalance = formatBalance(-from.value.diff, from.token.decimals);

  changeApprovalCheck(0, {
    target: txTo,
    token: formatToken(from.token.symbol, from.token.address),
    balance: approvalBalance,
    symbol: appSymbol,
    decimals: appDecimals,
  });

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
      // Pre-transfer checks: initial balances before transaction
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

      // change gasUsed to gasLimit

      const calcGas = (gasUsed * 125n) / 100n;
      const gasPrice = await getGasPrice(wagmiConfig, {
        chainId: chainId as any,
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
