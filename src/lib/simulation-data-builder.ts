import { encodeFunctionData, Abi } from 'viem';
import { PermitData } from './permit-utils';

/**
 * Parameters for building simulation calldata for different router contracts
 */
export interface BuildSimulationDataParams {
  /** Whether permit (EIP-2612) signatures are being used */
  willUsePermit: boolean;
  /** Whether ApproveRouter should be used (for token transfers) */
  shouldUseApproveRouter: boolean;
  /** Permit signature data (if using permit flow) */
  permitSignature: PermitData | null;
  /** Balance proxy contract details */
  proxy: { address: string; abi: Abi };
  /** PermitRouter contract ABI (for permit-based approvals) */
  permitRouter: { abi: Abi };
  /** Target contract ABI (ApproveRouter or basic proxy) */
  targetContract: { abi: Abi };
  /** Array of balance approvals for simulation */
  approvals: Array<{
    balance: {
      /** Address receiving balance approval (typically Universal Router) */
      target: `0x${string}`;
      /** Token being approved for spending */
      token: `0x${string}`;
      /** Amount approved for spending */
      balance: bigint;
    };
    /** Whether to use transferFrom() instead of approval */
    useTransfer: boolean;
  }>;
  /** Target address for the underlying transaction (e.g., Uniswap Router) */
  txTo: string;
  /** Modified calldata for the underlying transaction */
  modifiedData: string;
}

/**
 * Builds simulation calldata based on the selected router and approval method
 *
 * This function encodes calldata for one of three possible simulation paths:
 *
 * **1. PermitRouter Flow** (willUsePermit = true)
 * - Uses `permitProxyCallDiffsWithMeta()`
 * - Includes EIP-2612 permit signatures for gasless approvals
 * - Single transaction combines approval + swap
 * - Best UX: No separate approval transaction needed
 *
 * **2. ApproveRouter Flow** (shouldUseApproveRouter = true)
 * - Uses `approveProxyCallDiffsWithMeta()`
 * - Transfers tokens to Universal Router before execution
 * - Used when token doesn't support permit
 * - Requires prior approval transaction
 *
 * **3. Basic Proxy Flow** (fallback)
 * - Uses `proxyCallDiffsMeta()` directly on proxy
 * - Simplest path with no token transfers
 * - Used for ETH swaps or when approvals already exist
 *
 * All three flows:
 * - Route through BalanceProxy for accurate balance tracking
 * - Use modified calldata (with adjusted amounts for slippage)
 * - Return balance diffs for UI validation
 *
 * @param params - Parameters including router selection and transaction data
 * @returns Encoded calldata for the selected simulation path
 *
 * @example
 * // Example 1: Permit flow (USDC supports EIP-2612)
 * const data = buildSimulationData({
 *   willUsePermit: true,
 *   shouldUseApproveRouter: false,
 *   permitSignature: { v: 27, r: "0x...", s: "0x...", deadline: 1234n },
 *   proxy: { address: proxyAddress, abi: proxyAbi },
 *   permitRouter: { abi: permitRouterAbi },
 *   approvals: [{ balance: { target: uniswap, token: USDC, balance: 1000000n }, useTransfer: false }],
 *   txTo: uniswapRouter,
 *   modifiedData: "0x..."
 * });
 * // Returns: Encoded permitProxyCallDiffsWithMeta() call
 *
 * @example
 * // Example 2: ApproveRouter flow (token doesn't support permit)
 * const data = buildSimulationData({
 *   willUsePermit: false,
 *   shouldUseApproveRouter: true,
 *   permitSignature: null,
 *   targetContract: { abi: approveRouterAbi },
 *   approvals: [{ balance: { target: uniswap, token: DAI, balance: 1000n }, useTransfer: true }],
 *   txTo: uniswapRouter,
 *   modifiedData: "0x..."
 * });
 * // Returns: Encoded approveProxyCallDiffsWithMeta() call
 *
 * @example
 * // Example 3: Basic proxy flow (ETH swap, no approvals needed)
 * const data = buildSimulationData({
 *   willUsePermit: false,
 *   shouldUseApproveRouter: false,
 *   permitSignature: null,
 *   proxy: { address: proxyAddress, abi: proxyAbi },
 *   approvals: [],
 *   txTo: uniswapRouter,
 *   modifiedData: "0x..."
 * });
 * // Returns: Encoded proxyCallDiffsMeta() call
 */
export function buildSimulationData(
  params: BuildSimulationDataParams
): `0x${string}` {
  const {
    willUsePermit,
    shouldUseApproveRouter,
    permitSignature,
    proxy,
    permitRouter,
    targetContract,
    approvals,
    txTo,
    modifiedData,
  } = params;

  if (willUsePermit && permitSignature) {
    return encodeFunctionData({
      abi: permitRouter.abi,
      functionName: 'permitProxyCallDiffsWithMeta',
      args: [
        proxy.address,
        [],
        approvals,
        [permitSignature],
        txTo,
        modifiedData,
        [],
      ],
    }) as `0x${string}`;
  } else if (shouldUseApproveRouter && approvals.length > 0) {
    return encodeFunctionData({
      abi: targetContract.abi,
      functionName: 'approveProxyCallDiffsWithMeta',
      args: [proxy.address, [], approvals, txTo, modifiedData, []],
    }) as `0x${string}`;
  } else {
    return encodeFunctionData({
      abi: proxy.abi,
      functionName: 'proxyCallDiffsMeta',
      args: [[], approvals, txTo, modifiedData, []],
    }) as `0x${string}`;
  }
}
