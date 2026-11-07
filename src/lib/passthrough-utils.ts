import { decodeFunctionData, erc20Abi, Hex, isAddressEqual } from 'viem';

export const PERMIT2_ADDRESS = '0x000000000022D473030F116dDEE9F6B43aC78BA3';

export type DappTx = {
  to: string;
  data?: string;
  value?: string | number | bigint;
};

export function isPassthroughApproval(tx: DappTx): boolean {
  try {
    if (!tx.data || BigInt(tx.value ?? 0) !== 0n) return false;
    const call = decodeFunctionData({ abi: erc20Abi, data: tx.data as Hex });
    return (
      call.functionName === 'approve' &&
      isAddressEqual(call.args[0], PERMIT2_ADDRESS)
    );
  } catch {
    return false;
  }
}
