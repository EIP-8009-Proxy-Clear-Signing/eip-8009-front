import {
  PublicClient,
  WalletClient,
  erc20Abi,
  ethAddress,
  zeroAddress,
} from 'viem';
import { toast } from 'sonner';
import {
  supportsPermit,
  PermitData,
  generatePermitSignature,
} from './permit-utils';
import { SimulationResult } from './simulation-utils';
import { extractSwapInfo } from './extract-swap-info';

/**
 * Parameters for determining the approval amount needed for a swap
 */
export interface ApprovalCheckParams {
  /** Whether the original transaction simulation succeeded */
  hasOriginalSimulation: boolean;
  /** Result of original transaction simulation (if successful) */
  originalSimRes?: SimulationResult;
  /** Extracted swap information from Universal Router calldata */
  swapInfo: ReturnType<typeof extractSwapInfo> | null;
  publicClient: PublicClient;
  address: `0x${string}`;
}

/**
 * Result of approval amount determination
 */
export interface ApprovalResult {
  /** Amount that needs to be approved */
  approvalAmount: bigint;
  /** Address of the input token (null for ETH swaps) */
  inputTokenAddress: `0x${string}` | null;
}

/**
 * Determines the approval amount needed for a swap transaction
 *
 * This function extracts the required approval amount using two methods:
 * 1. **From Original Simulation** (preferred): Extracts exact amount from balance changes
 * 2. **From Swap Info** (fallback): Parses Universal Router calldata for input amount
 *
 * The approval amount is critical because:
 * - Too low: Transaction will fail
 * - Too high: Unnecessary approval (security risk)
 *
 * For swaps with exact output (where input is unknown), this falls back to
 * using the user's full token balance as the approval amount.
 *
 * @param params - Parameters including simulation results and swap info
 * @returns Approval amount and input token address
 *
 * @example
 * const { approvalAmount, inputTokenAddress } = await determineApprovalAmount({
 *   hasOriginalSimulation: true,
 *   originalSimRes: { assetChanges: [...] },
 *   swapInfo: { inputToken: USDC, inputAmount: 1000000n },
 *   publicClient,
 *   address: userAddress
 * });
 * // approvalAmount: 1000000n (1 USDC with 6 decimals)
 * // inputTokenAddress: "0x..." (USDC contract address)
 */
export async function determineApprovalAmount(
  params: ApprovalCheckParams
): Promise<ApprovalResult> {
  const {
    hasOriginalSimulation,
    originalSimRes,
    swapInfo,
    publicClient,
    address,
  } = params;

  let approvalAmount = 0n;
  let inputTokenAddress: `0x${string}` | null = null;

  // Method 1: Extract from original simulation (most accurate)
  if (hasOriginalSimulation && originalSimRes) {
    const inputChange = originalSimRes.assetChanges.find(
      (change) =>
        change.value.diff < 0n &&
        change.token.address !== ethAddress &&
        change.token.address !== zeroAddress
    );
    if (inputChange) {
      inputTokenAddress = inputChange.token.address as `0x${string}`;
      const rawAmount = -inputChange.value.diff;
      approvalAmount = rawAmount;
    }
  }
  // Method 2: Extract from swap info (fallback)
  else if (
    swapInfo?.inputToken &&
    swapInfo.inputToken !== zeroAddress &&
    swapInfo.inputToken !== ethAddress
  ) {
    inputTokenAddress = swapInfo.inputToken as `0x${string}`;

    if (swapInfo.inputAmount > 0n) {
      approvalAmount = swapInfo.inputAmount;
    } else {
      // For exact output swaps, approve full balance
      try {
        const balance = await publicClient.readContract({
          address: inputTokenAddress,
          abi: erc20Abi,
          functionName: 'balanceOf',
          args: [address],
        });
        approvalAmount = balance;
      } catch {
        // Fallback to a large number if balance check fails
        approvalAmount = BigInt('1000000000000000000000000');
        console.warn(
          'Could not get token balance, using default approval amount'
        );
      }
    }
  }

  return { approvalAmount, inputTokenAddress };
}

/**
 * Parameters for checking current token allowance
 */
export interface CheckApprovalParams {
  inputTokenAddress: `0x${string}`;
  approvalAmount: bigint;
  targetContract: { address: `0x${string}` };
  publicClient: PublicClient;
  address: `0x${string}`;
}

/**
 * Checks the current token allowance for a spender
 *
 * Queries the ERC-20 contract to determine how much the user has already
 * approved for the target contract. This is used to determine if a new
 * approval transaction is needed.
 *
 * @param params - Parameters including token and spender addresses
 * @returns Current allowance and token symbol
 *
 * @example
 * const { allowance, symbol } = await checkCurrentAllowance({
 *   inputTokenAddress: USDC,
 *   targetContract: { address: approveRouter },
 *   publicClient,
 *   address: userAddress
 * });
 * // allowance: 0n (no approval yet)
 * // symbol: "USDC"
 */
export async function checkCurrentAllowance(
  params: CheckApprovalParams
): Promise<{ allowance: bigint; symbol: string }> {
  const { inputTokenAddress, targetContract, publicClient, address } = params;

  const [currentAllowance, tokenSymbol] = await publicClient.multicall({
    contracts: [
      {
        abi: erc20Abi,
        address: inputTokenAddress,
        functionName: 'allowance',
        args: [address, targetContract.address],
      },
      {
        abi: erc20Abi,
        address: inputTokenAddress,
        functionName: 'symbol',
      },
    ],
    allowFailure: false,
  });

  return { allowance: currentAllowance, symbol: tokenSymbol };
}

/**
 * Parameters for requesting a permit signature
 */
export interface RequestPermitParams {
  inputTokenAddress: `0x${string}`;
  tokenSymbol: string;
  approvalAmount: bigint;
  permitRouter: { address: `0x${string}` };
  publicClient: PublicClient;
  walletClient: WalletClient;
  address: `0x${string}`;
  permitSignaturesRef: React.MutableRefObject<Map<string, PermitData>>;
  checkAborted: () => void;
}

/**
 * Requests a permit signature (EIP-2612) for gasless approval
 *
 * EIP-2612 allows tokens to be approved via off-chain signatures instead of
 * on-chain transactions. Benefits:
 * - No gas cost for approval
 * - Single transaction for approve + swap
 * - Better UX (no waiting for approval to confirm)
 *
 * The signature includes:
 * - Owner address
 * - Spender address (permitRouter)
 * - Amount to approve
 * - Deadline (1 hour from now)
 * - Nonce (from token contract)
 *
 * @param params - Parameters including token details and wallet client
 * @returns Permit signature data or null if user rejects
 *
 * @example
 * const permit = await requestPermitSignature({
 *   inputTokenAddress: USDC,
 *   tokenSymbol: "USDC",
 *   approvalAmount: 1000000n,
 *   permitRouter: { address: permitRouterAddress },
 *   publicClient,
 *   walletClient,
 *   address: userAddress,
 *   permitSignaturesRef,
 *   checkAborted
 * });
 * // permit: { v: 27, r: "0x...", s: "0x...", deadline: 1234567890n }
 */
export async function requestPermitSignature(
  params: RequestPermitParams
): Promise<PermitData | null> {
  const {
    inputTokenAddress,
    tokenSymbol,
    approvalAmount,
    permitRouter,
    publicClient,
    walletClient,
    address,
    permitSignaturesRef,
    checkAborted,
  } = params;

  const tokenKey = inputTokenAddress.toLowerCase();
  const storedPermit = permitSignaturesRef.current.get(tokenKey);

  if (storedPermit) {
    return storedPermit;
  }

  console.log(`Requesting permit signature for ${tokenSymbol}`);

  checkAborted();

  toast.info(`Requesting permit signature for ${tokenSymbol}...`, {
    duration: 3000,
  });

  try {
    const deadline = BigInt(Math.floor(Date.now() / 1000) + 3600); // 1 hour

    // Generate permit signature
    const permitSignature = await generatePermitSignature(
      inputTokenAddress,
      address,
      permitRouter.address,
      approvalAmount,
      deadline,
      publicClient,
      walletClient
    );

    checkAborted();

    permitSignaturesRef.current.set(tokenKey, permitSignature);

    toast.success(`Permit granted for ${tokenSymbol}`);
    return permitSignature;
  } catch (error) {
    console.error('Permit signature failed:', error);
    toast.error(
      'Failed to get permit signature - please try standard approval'
    );
    throw error;
  }
}

/**
 * Parameters for requesting a standard ERC-20 approval
 */
export interface RequestStandardApprovalParams {
  /** Address of the ERC-20 token contract */
  inputTokenAddress: `0x${string}`;
  /** Symbol of the token (e.g., "USDC") */
  tokenSymbol: string;
  /** Amount to approve for spending */
  approvalAmount: bigint;
  /** Contract that will be approved to spend tokens */
  targetContract: { address: `0x${string}` };
  publicClient: PublicClient;
  walletClient: WalletClient;
  /** User's wallet address */
  address: `0x${string}`;
  /** Function to check if operation was aborted */
  checkAborted: () => void;
}

/**
 * Requests a standard ERC-20 approval transaction
 *
 * This is the traditional on-chain approval flow that requires:
 * 1. User signs approval transaction
 * 2. Wait for transaction to be mined
 * 3. Pay gas fees for the approval
 *
 * After approval, the target contract can spend up to the approved amount
 * of the user's tokens using `transferFrom()`.
 *
 * This function:
 * - Calls `approve(spender, amount)` on the token contract
 * - Waits for transaction confirmation
 * - Shows toast notifications for user feedback
 * - Throws error if approval fails or reverts
 *
 * @param params - Parameters including token details and amount
 * @throws Error if approval transaction fails or reverts
 *
 * @example
 * await requestStandardApproval({
 *   inputTokenAddress: USDC,
 *   tokenSymbol: "USDC",
 *   approvalAmount: 1000000n,
 *   targetContract: { address: approveRouter },
 *   publicClient,
 *   walletClient,
 *   address: userAddress,
 *   checkAborted
 * });
 * // User approves transaction → waits for confirmation → success toast
 */
export async function requestStandardApproval(
  params: RequestStandardApprovalParams
): Promise<void> {
  const {
    inputTokenAddress,
    tokenSymbol,
    approvalAmount,
    targetContract,
    publicClient,
    walletClient,
    address,
    checkAborted,
  } = params;

  console.log('Requesting standard approval...');

  checkAborted();

  toast.info(`Requesting approval for ${tokenSymbol}...`, {
    duration: 3000,
  });

  try {
    const hash = await walletClient.writeContract({
      abi: erc20Abi,
      address: inputTokenAddress,
      functionName: 'approve',
      args: [targetContract.address, approvalAmount],
      account: address,
      chain: null,
    });

    checkAborted();

    console.log('Waiting for approval transaction:', hash);
    toast.info('Waiting for approval transaction...', {
      duration: 5000,
    });

    const receipt = await publicClient.waitForTransactionReceipt({ hash });

    checkAborted();

    if (receipt.status === 'reverted') {
      throw new Error('Approval transaction reverted');
    }

    console.log('Approval confirmed');
    toast.success(`${tokenSymbol} approved successfully!`);
  } catch (error) {
    console.error('Approval failed:', error);
    toast.error('Approval failed!');
    throw error;
  }
}

/**
 * Parameters for handling the approval/permit flow
 */
export interface HandleApprovalParams {
  /** Address of the input token requiring approval */
  inputTokenAddress: `0x${string}`;
  /** Amount that needs to be approved */
  approvalAmount: bigint;
  /** Target contract that will spend tokens (ApproveRouter or Uniswap Router) */
  targetContract: { address: `0x${string}` };
  /** PermitRouter contract for EIP-2612 permits */
  permitRouter: { address: `0x${string}` };
  publicClient: PublicClient;
  walletClient: WalletClient;
  /** User's wallet address */
  address: `0x${string}`;
  /** Whether to use permit router (gasless approval) if available */
  usePermitRouter: boolean;
  /** Reference to stored permit signatures (avoids re-signing) */
  permitSignaturesRef: React.MutableRefObject<Map<string, PermitData>>;
  /** Function to check if operation was aborted */
  checkAborted: () => void;
}

/**
 * Orchestrates the complete approval/permit flow for token swaps
 *
 * This function is the main entry point for handling token approvals. It:
 *
 * **Step 1: Check Current Allowance**
 * - Queries token contract for existing approval
 * - If sufficient allowance exists, returns immediately (no action needed)
 *
 * **Step 2: Determine Approval Method**
 * - **Permit (EIP-2612)**: If token supports it AND user selected permit router
 *   - Gasless approval via off-chain signature
 *   - Single transaction (approve + swap combined)
 *   - Better UX (no waiting for approval tx)
 *
 * - **Standard Approval**: Otherwise
 *   - On-chain approval transaction
 *   - Requires gas and separate transaction
 *   - Works with all ERC-20 tokens
 *
 * **Step 3: Execute Chosen Method**
 * - Request permit signature OR send approval transaction
 * - Wait for completion
 * - Return result for use in swap transaction
 *
 * @param params - Parameters including token details and router selection
 * @returns Object with permit signature (if used) and boolean indicating permit usage
 *
 * @example
 * // Example 1: Token supports permit, user selected permit router
 * const { permitSignature, willUsePermit } = await handleApprovalFlow({
 *   inputTokenAddress: USDC, // Supports EIP-2612
 *   approvalAmount: 1000000n,
 *   targetContract: { address: approveRouter },
 *   permitRouter: { address: permitRouterAddress },
 *   usePermitRouter: true,
 *   ...otherParams
 * });
 * // permitSignature: { v: 27, r: "0x...", s: "0x...", deadline: 1234567890n }
 * // willUsePermit: true
 *
 * @example
 * // Example 2: Standard approval (token doesn't support permit)
 * const { permitSignature, willUsePermit } = await handleApprovalFlow({
 *   inputTokenAddress: DAI, // No EIP-2612 support
 *   approvalAmount: 1000000000000000000n,
 *   targetContract: { address: uniswapRouter },
 *   usePermitRouter: false,
 *   ...otherParams
 * });
 * // permitSignature: null
 * // willUsePermit: false
 * // (Standard approval transaction was sent and confirmed)
 */
export async function handleApprovalFlow(
  params: HandleApprovalParams
): Promise<{ permitSignature: PermitData | null; willUsePermit: boolean }> {
  const {
    inputTokenAddress,
    approvalAmount,
    targetContract,
    permitRouter,
    publicClient,
    walletClient,
    address,
    usePermitRouter,
    permitSignaturesRef,
    checkAborted,
  } = params;

  checkAborted();

  const { allowance: currentAllowance, symbol: tokenSymbol } =
    await checkCurrentAllowance({
      inputTokenAddress,
      approvalAmount,
      targetContract,
      publicClient,
      address,
    });

  if (currentAllowance < approvalAmount) {
    // Check if token supports permit (EIP-2612)
    const tokenSupportsPermit = await supportsPermit(
      inputTokenAddress,
      publicClient
    );

    if (usePermitRouter && tokenSupportsPermit) {
      const permitSignature = await requestPermitSignature({
        inputTokenAddress,
        tokenSymbol,
        approvalAmount,
        permitRouter,
        publicClient,
        walletClient,
        address,
        permitSignaturesRef,
        checkAborted,
      });
      return { permitSignature, willUsePermit: true };
    } else {
      // Use standard approval
      await requestStandardApproval({
        inputTokenAddress,
        tokenSymbol,
        approvalAmount,
        targetContract,
        publicClient,
        walletClient,
        address,
        checkAborted,
      });
      return { permitSignature: null, willUsePermit: false };
    }
  } else {
    console.log('Sufficient allowance already exists');
    return { permitSignature: null, willUsePermit: false };
  }
}
