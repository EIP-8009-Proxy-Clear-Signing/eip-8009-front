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

export interface ApprovalCheckParams {
  hasOriginalSimulation: boolean;
  originalSimRes?: SimulationResult;
  swapInfo: ReturnType<typeof extractSwapInfo> | null;
  publicClient: PublicClient;
  address: `0x${string}`;
}

export interface ApprovalResult {
  approvalAmount: bigint;
  inputTokenAddress: `0x${string}` | null;
}

/**
 * Determines approval amount from original simulation or swap info
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
  } else if (
    swapInfo?.inputToken &&
    swapInfo.inputToken !== zeroAddress &&
    swapInfo.inputToken !== ethAddress
  ) {
    inputTokenAddress = swapInfo.inputToken as `0x${string}`;

    if (swapInfo.inputAmount > 0n) {
      approvalAmount = swapInfo.inputAmount;
    } else {
      try {
        const balance = await publicClient.readContract({
          address: inputTokenAddress,
          abi: erc20Abi,
          functionName: 'balanceOf',
          args: [address],
        });
        approvalAmount = balance;
      } catch {
        approvalAmount = BigInt('1000000000000000000000000');
        console.warn(
          'Could not get token balance, using default approval amount'
        );
      }
    }
  }

  return { approvalAmount, inputTokenAddress };
}

export interface CheckApprovalParams {
  inputTokenAddress: `0x${string}`;
  approvalAmount: bigint;
  targetContract: { address: `0x${string}` };
  publicClient: PublicClient;
  address: `0x${string}`;
}

/**
 * Checks current token allowance
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

export interface RequestStandardApprovalParams {
  inputTokenAddress: `0x${string}`;
  tokenSymbol: string;
  approvalAmount: bigint;
  targetContract: { address: `0x${string}` };
  publicClient: PublicClient;
  walletClient: WalletClient;
  address: `0x${string}`;
  checkAborted: () => void;
}

/**
 * Requests standard ERC20 approval transaction
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

export interface HandleApprovalParams {
  inputTokenAddress: `0x${string}`;
  approvalAmount: bigint;
  targetContract: { address: `0x${string}` };
  permitRouter: { address: `0x${string}` };
  publicClient: PublicClient;
  walletClient: WalletClient;
  address: `0x${string}`;
  usePermitRouter: boolean;
  permitSignaturesRef: React.MutableRefObject<Map<string, PermitData>>;
  checkAborted: () => void;
}

/**
 * Handles approval/permit flow: checks allowance, requests permit or approval
 * Returns permit signature if permit route was used, null otherwise
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
