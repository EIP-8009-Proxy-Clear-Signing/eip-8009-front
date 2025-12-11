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
 * This function encodes calldata for one of two possible simulation paths:
 *
 * **1. PermitRouter Flow** (willUsePermit = true)
 * - Uses `permitProxyCallDiffsWithMeta()`
 * - Includes EIP-2612 permit signatures for gasless approvals
 * - Single transaction combines approval + swap
 * - Best UX: No separate approval transaction needed
 *
 * **2. ApproveRouter Flow** (default, always used when not using permit)
 * - Uses `approveProxyCallDiffsWithMeta()`
 * - Can handle both token transfers and empty approvals
 * - Used for all non-permit transactions (even with empty approvals array)
 * - Requires prior approval transaction for tokens
 *
 * Both flows:
 * - Route through BalanceProxy for accurate balance tracking
 * - Use modified calldata (with adjusted amounts for slippage)
 * - Return balance diffs for UI validation
 * - Accept separate metadata and balances arrays
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
 * // Example 3: ApproveRouter with empty approvals (ETH swap)
 * const data = buildSimulationData({
 *   willUsePermit: false,
 *   shouldUseApproveRouter: true,
 *   permitSignature: null,
 *   targetContract: { abi: approveRouterAbi },
 *   approvals: [],
 *   txTo: uniswapRouter,
 *   modifiedData: "0x..."
 * });
 * // Returns: Encoded approveProxyCallDiffsWithMeta() call with empty approvals
 */
export function buildSimulationData(
  params: BuildSimulationDataParams
): `0x${string}` {
  const {
    willUsePermit,
    permitSignature,
    proxy,
    permitRouter,
    targetContract,
    approvals,
    txTo,
    modifiedData,
  } = params;

  // Empty metadata arrays for simulation (no UI decoding needed)
  const emptyMeta: never[] = [];

  if (willUsePermit && permitSignature) {
    return encodeFunctionData({
      abi: permitRouter.abi,
      functionName: 'permitProxyCallDiffsWithMeta',
      args: [
        proxy.address,
        emptyMeta, // metadata array (empty for simulation)
        [], // diffs array (empty for simulation)
        approvals,
        [permitSignature],
        txTo,
        modifiedData,
        [],
      ],
    }) as `0x${string}`;
  } else {
    // Always use ApproveRouter (even with empty approvals)
    return encodeFunctionData({
      abi: targetContract.abi,
      functionName: 'approveProxyCallDiffsWithMeta',
      args: [
        proxy.address,
        emptyMeta, // metadata array (empty for simulation)
        [], // diffs array (empty for simulation)
        approvals,
        txTo,
        modifiedData,
        [],
      ],
    }) as `0x${string}`;
  }
}
