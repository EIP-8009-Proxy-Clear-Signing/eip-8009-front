import { useModalPromise } from '@/hooks/use-modal-promise';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from './ui/dialog';
import { Button } from './ui/button';
import { Card } from './ui/card';
import { Input } from './ui/input';
import { Loader2, X } from 'lucide-react';
import {
  Check,
  EMode,
  MAX_SLIPPAGE,
  MIN_SLIPPAGE,
  useChecks,
} from '@/hooks/use-checks';
import { ChangeEvent, useCallback, useRef, useState, useEffect } from 'react';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from './ui/accordion';
import {
  useAccount,
  useChainId,
  usePublicClient,
  useWalletClient,
  useWriteContract,
} from 'wagmi';
import { getContract } from '@/lib/contracts';
import {
  Abi,
  decodeFunctionData,
  encodeFunctionData,
  erc20Abi,
  ethAddress,
  parseAbi,
  parseUnits,
  PublicClient,
  zeroAddress,
} from 'viem';
import { whatsabi } from '@shazow/whatsabi';
import {
  getEnumValues,
  getExplorerUrl,
  shortenAddress,
  waitForTx,
} from '@/lib/utils.ts';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs.tsx';
import { toast } from 'sonner';
import { useSafeApp } from '@/providers/safe-app-provider.tsx';
import {
  checkIfHasWrapEthCommand,
  isUniversalRouterTransaction,
  logUniversalRouterCommands,
  modifyUniversalRouterCalldata,
} from '@/lib/uniswap-router';
import { extractSwapInfo } from '@/lib/extract-swap-info';
import {
  supportsPermit,
  PermitData,
  generatePermitSignature,
} from '@/lib/permit-utils';
import { Label } from './ui/label';
import {
  simulateOriginalTransaction,
  simulateModifiedTransaction,
  validateSimulationResult,
  extractAssetChanges,
} from '@/lib/simulation-utils';
import {
  determineApprovalAmount,
  handleApprovalFlow,
} from '@/lib/approval-utils';
import { checkSufficientBalance } from '@/lib/balance-utils';
import { getTokenMetadata } from '@/lib/token-utils';
import { populateFormChecks } from '@/lib/form-utils';
import { buildSimulationData } from '@/lib/simulation-data-builder';

const formatter = new Intl.NumberFormat('en-US', {
  style: 'decimal',
  notation: 'standard',
  maximumSignificantDigits: 6,
});

function swapAddressInArgsTraverse<T>(
  args: T,
  from: string,
  to: string
): unknown[] | T {
  return Array.isArray(args)
    ? args.map((arg: unknown) => {
        if (typeof arg === 'string' && arg.toLowerCase().includes(from)) {
          // console.log('found', index, arg, from, to);
          return arg.toLowerCase().replaceAll(from, to) as T;
        }
        if (Array.isArray(arg)) {
          return swapAddressInArgsTraverse(arg, from, to);
        }
        return arg;
      })
    : (args as T);
}

const createCheckComp =
  (title: string, target?: string) =>
  ({
    check,
    onChange,
    onRemove,
    index,
  }: {
    check: Check;
    onChange: (check: Check) => void;
    onRemove: () => void;
    index: number;
  }) => {
    const onBalanceChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const value = e.target.value;
      const number = Number(value);
      if (isNaN(number)) {
        return;
      }
      onChange({ ...check, balance: number });
    };

    return (
      <Card className="p-2 rounded-sm">
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <Label>
              {title} {index + 1}
            </Label>
            <Button variant="ghost" size="icon" onClick={onRemove}>
              <X />
            </Button>
          </div>
          <div className="flex flex-col gap-1">
            <Label>Token address:</Label>
            <Input
              value={check.token}
              onChange={(e) => onChange({ ...check, token: e.target.value })}
            />
          </div>
          {!!target && (
            <div className="flex flex-col gap-1">
              <Label>{target}:</Label>
              <Input
                value={check.target}
                onChange={(e) => onChange({ ...check, target: e.target.value })}
              />
            </div>
          )}
          <div className="flex flex-col gap-1">
            <Label>Minimum balance:</Label>
            <Input
              value={check.balance}
              type="number"
              onChange={onBalanceChange}
            />
          </div>
        </div>
      </Card>
    );
  };

const CheckComp = createCheckComp('Check', 'Check address');
const ApprovalComp = createCheckComp('Approval', 'Where to approve');
const WithdrawalComp = createCheckComp('Withdrawal', 'Where to withdraw');

const transformToMetadata = async (
  checks: Check[],
  publicClient: PublicClient
) => {
  const filteredChecks = checks.filter(
    (check) => check.token !== zeroAddress && check.token !== ''
  );
  const ether = checks.find((check) => check.token === zeroAddress);

  const checksSymbolRequests = filteredChecks.map(({ token }) => ({
    abi: erc20Abi,
    address: token as `0x${string}`,
    functionName: 'symbol' as const,
    args: [],
  }));

  const checksSymbols = await publicClient.multicall({
    contracts: checksSymbolRequests,
    allowFailure: false,
  });

  const checksDecimalsRequests = filteredChecks.map(({ token }) => ({
    abi: erc20Abi,
    address: token as `0x${string}`,
    functionName: 'decimals' as const,
    args: [],
  }));

  const checksDecimals = await publicClient.multicall({
    contracts: checksDecimalsRequests,
    allowFailure: false,
  });

  const result = filteredChecks.map((balance, index) => ({
    balance: {
      target: balance.target as `0x${string}`,
      token: balance.token as `0x${string}`,
      balance: parseUnits(
        balance.balance.toString().replace(',', '.'),
        checksDecimals[index]
      ),
    },
    symbol: checksSymbols[index],
    decimals: checksDecimals[index],
  }));

  if (ether) {
    result.push({
      balance: {
        target: ether.target as `0x${string}`,
        token: zeroAddress,
        balance: parseUnits(ether.balance.toString().replace(',', '.'), 18),
      },
      symbol: 'ETH',
      decimals: 18,
    });
  }

  return result;
};

export const TxOptions = () => {
  const [isLoading, setIsLoading] = useState(false);
  const [loadingStep, setLoadingStep] = useState<string>('');
  const [isSimulationComplete, setIsSimulationComplete] = useState(false);
  const abortControllerRef = useRef<AbortController | null>(null);

  const {
    modalOpen,
    closeModal,
    tx,
    resolve,
    reject,
    hideModal,
    isAdvanced,
    toggleAdvanced,
    usePermitRouter,
  } = useModalPromise();
  const { address } = useAccount();
  const chainId = useChainId();
  const publicClient = usePublicClient();
  const { data: walletClient } = useWalletClient();
  const { writeContractAsync } = useWriteContract();
  const { safeInfo, safe } = useSafeApp();

  const {
    mode,
    setMode,
    checks,
    slippage,
    setSlippage,
    slippagePrePost,
    setSlippagePrePost,
    createApprovalCheck,
    changeApprovalCheck,
    removeApprovalCheck,
    createWithdrawalCheck,
    changeWithdrawalCheck,
    removeWithdrawalCheck,
    createDiffsCheck,
    changeDiffsCheck,
    removeDiffsCheck,
    createPreTransferCheck,
    changePreTransferCheck,
    removePreTransferCheck,
    removePostTransferCheck,
    changePostTransferCheck,
    createPostTransferCheck,
  } = useChecks();

  // Use appropriate slippage based on mode
  const activeSlippage =
    mode === EMode['pre/post'] ? slippagePrePost : slippage;
  const setActiveSlippage =
    mode === EMode['pre/post'] ? setSlippagePrePost : setSlippage;

  const [inputSlippage, setInputSlippage] = useState<string>(
    String(activeSlippage)
  );

  const permitSignaturesRef = useRef<Map<string, PermitData>>(new Map());

  const resetCheckState = useCallback(() => {
    for (let i = checks.approvals.length - 1; i >= 0; i--) {
      removeApprovalCheck(i);
    }
    for (let i = checks.withdrawals.length - 1; i >= 0; i--) {
      removeWithdrawalCheck(i);
    }
    for (let i = checks.diffs.length - 1; i >= 0; i--) {
      removeDiffsCheck(i);
    }
    for (let i = checks.preTransfer.length - 1; i >= 0; i--) {
      removePreTransferCheck(i);
    }
    for (let i = checks.postTransfer.length - 1; i >= 0; i--) {
      removePostTransferCheck(i);
    }
    permitSignaturesRef.current.clear();
    setIsSimulationComplete(false);
    setLoadingStep('');
  }, [
    checks.approvals.length,
    checks.diffs.length,
    checks.postTransfer.length,
    checks.preTransfer.length,
    checks.withdrawals.length,
    removeApprovalCheck,
    removeDiffsCheck,
    removePostTransferCheck,
    removePreTransferCheck,
    removeWithdrawalCheck,
  ]);

  const setDataToForm = useCallback(async () => {
    if (!publicClient || tx === null || !address || !walletClient) {
      return;
    }

    // Reset simulation state
    setIsSimulationComplete(false);
    setLoadingStep('Initializing...');

    // Create abort controller for this operation
    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    const checkAborted = () => {
      if (abortController.signal.aborted) {
        resetCheckState();
        throw new Error('Operation aborted - modal was closed');
      }
    };

    try {
      /**
       * SECURE TWO-PHASE SIMULATION FLOW:
       * Phase 1: Original Transaction → Extract token address & approval amount
       * Phase 2: Modified Transaction → Get REAL asset changes for UI
       */

      // Step 1: Get contract references
      const proxy = getContract('proxy', chainId);
      const uniswapRouter = getContract('uniswapRouter', chainId);
      const approveRouter = getContract('proxyApproveRouter', chainId);
      const permitRouter = getContract('proxyPermitRouter', chainId);

      const isUniversalRouter = isUniversalRouterTransaction(
        tx.to,
        uniswapRouter.address
      );

      // Step 2: Simulate ORIGINAL transaction
      setLoadingStep('Simulating original transaction...');
      const { success: hasOriginalSimulation, result: originalSimRes } =
        await simulateOriginalTransaction({
          publicClient,
          address,
          tx,
        });

      // Step 3: Modify transaction calldata
      setLoadingStep('Modifying transaction calldata...');
      let modifiedData = tx.data;

      if (isUniversalRouter) {
        const modified = modifyUniversalRouterCalldata(
          tx.data,
          uniswapRouter,
          address
        );
        modifiedData = modified ?? tx.data;
      }

      // Step 4: Extract swap info and determine approval amount
      const swapInfo = isUniversalRouter
        ? extractSwapInfo(tx.data, uniswapRouter.abi)
        : null;

      const { approvalAmount, inputTokenAddress } =
        await determineApprovalAmount({
          hasOriginalSimulation,
          originalSimRes,
          swapInfo,
          publicClient,
          address,
        });

      // Step 5: Determine router and handle approvals/permits
      const isTokenSwap =
        inputTokenAddress &&
        inputTokenAddress !== zeroAddress &&
        inputTokenAddress !== ethAddress;

      let shouldUseApproveRouter = false;
      let willUsePermitForExecution = false;
      let permitSignature: PermitData | null = null;

      if (isTokenSwap) {
        shouldUseApproveRouter = true;
      }

      const targetContract = shouldUseApproveRouter ? approveRouter : proxy;

      // Step 6: Handle approval/permit flow
      if (isTokenSwap && inputTokenAddress) {
        setLoadingStep('Checking token approvals...');

        const approvalResult = await handleApprovalFlow({
          inputTokenAddress,
          approvalAmount,
          targetContract: targetContract as { address: `0x${string}` },
          permitRouter: permitRouter as { address: `0x${string}` },
          publicClient,
          walletClient,
          address,
          usePermitRouter,
          permitSignaturesRef,
          checkAborted,
          isSafeWallet: !!(safe && safeInfo),
          safe,
        });

        permitSignature = approvalResult.permitSignature;
        willUsePermitForExecution = approvalResult.willUsePermit;

        // For Safe wallets: If approval was sent to Safe (not permit),
        // close modal and instruct user to complete approval before retrying swap
        if (safe && safeInfo && approvalResult.approvalSent) {
          console.log('Safe wallet: Approval queued, closing modal');
          
          // Close modal and reset state
          resetCheckState();
          
          // Show long toast with instructions
          toast.info(
            'Token approval queued in Safe wallet. Please sign the approval transaction in Safe, then restart the swap.',
            {
              duration: 1000000,
              position: 'top-center',
              closeButton: true,
              action: {
                label: 'View in Safe',
                onClick: () =>
                  window.open(
                    `https://app.safe.global/transactions/queue?safe=${safeInfo.safeAddress}`,
                    '_blank',
                    'noopener,noreferrer'
                  ),
              },
            }
          );
          return;
        }
      }

      // Step 7: Build simulation call for MODIFIED transaction
      setLoadingStep('Simulating modified transaction through proxy...');
      const simulationContract = willUsePermitForExecution
        ? permitRouter
        : targetContract;

      const approvals =
        isTokenSwap && inputTokenAddress
          ? [
              {
                balance: {
                  target: tx.to as `0x${string}`,
                  token: inputTokenAddress,
                  balance: approvalAmount,
                },
                useTransfer: true,
              },
            ]
          : [];

      const simulationData = buildSimulationData({
        willUsePermit: willUsePermitForExecution,
        shouldUseApproveRouter,
        permitSignature,
        proxy: proxy as { address: string; abi: Abi },
        permitRouter: permitRouter as { abi: Abi },
        targetContract: targetContract as { abi: Abi },
        approvals,
        txTo: tx.to,
        modifiedData,
      });

      // Step 8: Simulate MODIFIED transaction
      const simRes = await simulateModifiedTransaction({
        publicClient,
        address,
        simulationContract: simulationContract as { address: string },
        simulationData,
        txValue: BigInt(tx.value || 0),
      });

      if (!simRes) {
        console.error('Proxy simulation failed');
        toast.error(
          'Simulation failed - please check the transaction parameters'
        );
        return;
      }

      // Validate simulation
      if (!validateSimulationResult(simRes)) {
        toast.error(
          'Simulation failed - please check the transaction parameters'
        );
        return;
      }

      // Step 9: Extract asset changes
      const { from, to, gasUsed } = extractAssetChanges(simRes);

      if (!from || !to) {
        console.error('No asset changes detected in simulation');
        toast.error(
          'Could not detect token swap in simulation - please try again'
        );
        return;
      }

      // Step 10: Check user balance
      const isFromEth =
        from.token.address === zeroAddress || from.token.address === ethAddress;

      const balanceCheck = await checkSufficientBalance({
        fromToken: from.token,
        fromValueDiff: from.value.diff,
        slippage: activeSlippage,
        publicClient,
        address,
      });

      if (!balanceCheck.sufficient) {
        return; // Error toast already shown by checkSufficientBalance
      }

      // Step 11: Create checks if needed
      if (!checks.approvals.length) createApprovalCheck();
      if (!checks.withdrawals.length) createWithdrawalCheck();

      switch (mode) {
        case EMode.diifs: {
          if (!checks.diffs.length) createDiffsCheck();
          if (checks.diffs.length < 2) createDiffsCheck();
          break;
        }
        case EMode['pre/post']: {
          // Create pre-transfer checks (for initial balances)
          if (!checks.preTransfer.length) createPreTransferCheck();
          if (checks.preTransfer.length < 2) createPreTransferCheck();
          // Create post-transfer checks (for final balances with slippage)
          if (!checks.postTransfer.length) createPostTransferCheck();
          if (checks.postTransfer.length < 2) createPostTransferCheck();
          break;
        }
      }

      // Step 12: Get token metadata
      checkAborted();
      const appMetadata = await getTokenMetadata(
        from.token.address,
        publicClient,
        isFromEth
      );
      checkAborted();
      const withMetadata = await getTokenMetadata(
        to.token.address,
        publicClient,
        to.token.address === zeroAddress || to.token.address === ethAddress
      );

      // Step 13: Estimate gas for the actual transaction
      setLoadingStep('Estimating gas...');
      let estimatedGas = 0n;
      
      try {
        // Estimate gas for the original transaction (simpler and more accurate)
        estimatedGas = await publicClient.estimateGas({
          account: address,
          to: tx.to as `0x${string}`,
          data: tx.data as `0x${string}`,
          value: BigInt(tx.value || 0),
        });
      } catch (error) {
        console.error('Gas estimation failed, using simulation gas:', error);
        estimatedGas = gasUsed;
      }

      // Step 14: Populate form checks
      await populateFormChecks({
        from,
        chainId: chainId as any,
        to,
        gasUsed: estimatedGas, // Use estimated gas instead of simulation gas
        txTo: tx.to,
        address,
        slippage: activeSlippage,
        mode,
        appSymbol: appMetadata.symbol,
        appDecimals: appMetadata.decimals,
        withSymbol: withMetadata.symbol,
        withDecimals: withMetadata.decimals,
        changeApprovalCheck,
        changeWithdrawalCheck,
        changeDiffsCheck,
        changePreTransferCheck,
        changePostTransferCheck,
      });

      setLoadingStep('');
      setIsSimulationComplete(true);
    } catch (error) {
      // Check if error is due to abort
      if (
        error instanceof Error &&
        error.message === 'Operation aborted - modal was closed'
      ) {
        return;
      }

      console.error('Error in setDataToForm:', error);
      toast.error('Failed to prepare transaction!');
      return;
    } finally {
      // Clear abort controller if operation completed
      if (abortControllerRef.current === abortController) {
        abortControllerRef.current = null;
      }
    }
  }, [
    publicClient,
    tx,
    address,
    chainId,
    activeSlippage,
    mode,
    walletClient,
    usePermitRouter,
    resetCheckState,
    checks.approvals.length,
    checks.withdrawals.length,
    checks.diffs.length,
    checks.preTransfer.length,
    checks.postTransfer.length,
    createApprovalCheck,
    createWithdrawalCheck,
    createDiffsCheck,
    createPreTransferCheck,
    createPostTransferCheck,
    changeApprovalCheck,
    changeWithdrawalCheck,
    changeDiffsCheck,
    changePreTransferCheck,
    changePostTransferCheck,
    safe,
    safeInfo,
    hideModal,
  ]);

  useEffect(() => {
    setDataToForm();
  }, [setDataToForm]);

  useEffect(() => {
    if (!modalOpen && abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
  }, [modalOpen]);

  const handleSave = async () => {
    setIsLoading(true);

    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    if (!address || !publicClient || !tx || !resolve) {
      console.error('No address or public client or tx or resolve');
      setIsLoading(false);
      abortControllerRef.current = null;
      return;
    }

    const checkAborted = () => {
      if (abortController.signal.aborted) {
        throw new Error('Transaction aborted by user');
      }
    };

    try {
      const proxy = getContract('proxy', chainId);
      const approveRouter = getContract('proxyApproveRouter', chainId);
      const uniswapRouter = getContract('uniswapRouter', chainId);

      const isUniversalRouter = isUniversalRouterTransaction(
        tx.to,
        uniswapRouter.address
      );

      if (isUniversalRouter) {
        logUniversalRouterCommands(tx.data, uniswapRouter.abi);
      }

      // Modify Universal Router calldata for proxy execution
      let data = tx.data;

      if (isUniversalRouter) {
        const modifiedData = modifyUniversalRouterCalldata(
          tx.data,
          uniswapRouter,
          address!
        );
        data = modifiedData ?? tx.data;
      }

      const selector = data.slice(0, 10);
      const lookup = new whatsabi.loaders.FourByteSignatureLookup();
      const signatures: string[] = await lookup.loadFunctions(selector);

      // Skip address replacement for Universal Router - we already modified it
      if (signatures.length > 0 && !isUniversalRouter) {
        const fnSignature = signatures[0];
        const fullFragment = `function ${fnSignature}`;
        // console.log('fullFragment', fullFragment);
        const abi = parseAbi([fullFragment]) as Abi;

        const decoded = decodeFunctionData({
          abi,
          data: data,
        });

        // console.log('decoded args', decoded.args);
        // console.log('decoded functionName', decoded.functionName);

        let newArgs = swapAddressInArgsTraverse(
          decoded.args || [],
          address.toLowerCase(),
          proxy.address.toLowerCase()
        );
        newArgs = swapAddressInArgsTraverse(
          newArgs,
          address.slice(2).toLowerCase(),
          proxy.address.slice(2).toLowerCase()
        );

        const newData = encodeFunctionData({
          abi,
          functionName: decoded.functionName,
          args: newArgs,
        });

        data = newData;
      }

      const tokenApprovals = checks.approvals.filter(
        (check) =>
          check.token !== zeroAddress &&
          check.token !== '' &&
          check.token !== ethAddress
      );

      const hasWrapEthCommand = isUniversalRouter
        ? checkIfHasWrapEthCommand(tx.data, uniswapRouter.abi)
        : false;

      let approvalsToUse = tokenApprovals;
      let withdrawalsToUse = checks.withdrawals;

      if (isUniversalRouter) {
        approvalsToUse = hasWrapEthCommand
          ? []
          : (approvalsToUse = tokenApprovals.map((approval) => ({
              ...approval,
              target: uniswapRouter.address,
            })));

        withdrawalsToUse = [];
      }

      // Transform metadata for contract calls
      // Note: preTransfers are populated in UI but NOT sent to contract (UI display only)
      const [postTransfers, , diffs, approvals, withdrawals] =
        await Promise.all([
          transformToMetadata(checks.postTransfer, publicClient),
          transformToMetadata(checks.preTransfer, publicClient), // For UI only
          transformToMetadata(checks.diffs, publicClient),
          transformToMetadata(approvalsToUse, publicClient),
          transformToMetadata(withdrawalsToUse, publicClient),
        ]);

      checkAborted();

      const approvalsWithFlags = approvals.map((approval) => ({
        balance: approval.balance,
        useTransfer: isUniversalRouter && !hasWrapEthCommand,
      }));

      // Note: preTransfers are populated for UI display only
      // They are NOT sent to the contract - only postTransfers are validated on-chain

      // Check which tokens support permit (EIP-2612)
      const permitSupport = await Promise.all(
        approvalsWithFlags.map(async (approval) => {
          const tokenAddress = approval.balance.token;
          if (
            tokenAddress === zeroAddress ||
            tokenAddress === ethAddress ||
            !tokenAddress
          ) {
            return false;
          }
          return await supportsPermit(tokenAddress, publicClient);
        })
      );

      checkAborted();

      // Determine router to use based on transaction requirements:
      // Priority order:
      // 1. permitRouter - if all tokens support EIP-2612 permit (best, gasless) and flag is true
      // 2. approveRouter - if tokens need transfers (Universal Router non-WRAP_ETH)
      // 3. proxy - basic approval-only flow (fallback)
      const allTokensSupportPermit =
        approvalsWithFlags.length > 0 &&
        permitSupport.every((supports, idx) => {
          // Skip check for ETH or zero address
          const tokenAddress = approvalsWithFlags[idx].balance.token;
          if (
            tokenAddress === zeroAddress ||
            tokenAddress === ethAddress ||
            !tokenAddress
          ) {
            return true;
          }
          return supports;
        });

      const shouldUsePermitRouter =
        usePermitRouter && allTokensSupportPermit && (!safe && !safeInfo);

      const shouldUseApproveRouter =
        !shouldUsePermitRouter && approvalsWithFlags.some((a) => a.useTransfer);

      const permitRouter = getContract('proxyPermitRouter', chainId);
      const targetContract = shouldUseApproveRouter
        ? approveRouter
        : shouldUsePermitRouter
          ? permitRouter
          : proxy;

      const targetContractAddress = targetContract.address as `0x${string}`;
      const value = tx.value ? BigInt(tx.value) : undefined;

      const permitSignatures: PermitData[] = [];

      if (shouldUsePermitRouter) {
        for (let tokenIdx = 0; tokenIdx < approvalsToUse.length; tokenIdx++) {
          const token = approvalsToUse[tokenIdx];

          if (
            !token.token ||
            token.token === '' ||
            token.token === zeroAddress ||
            token.token === ethAddress
          ) {
            continue;
          }

          if (!permitSupport[tokenIdx]) {
            continue; // Skip tokens that don't support permit
          }

          const tokenAddress = token.token as `0x${string}`;
          const tokenKey = tokenAddress.toLowerCase();

          // Check if we already have a stored permit signature for this token
          const storedPermit = permitSignaturesRef.current.get(tokenKey);

          if (storedPermit) {
            console.log(
              `Reusing stored permit signature for ${token.symbol || tokenAddress}`
            );
            permitSignatures.push(storedPermit);
            continue; // Skip to next token
          }

          console.log(
            `Token ${tokenAddress} supports permit - collecting new signature for execution`
          );

          if (!walletClient) {
            throw new Error('Wallet client not available for permit signing');
          }

          try {
            // Get token decimals to calculate the amount
            const decimals = await publicClient.readContract({
              abi: erc20Abi,
              address: tokenAddress,
              functionName: 'decimals',
            });

            checkAborted();

            const amount = parseUnits(
              token.balance.toString().replace(',', '.'),
              decimals
            );

            // Calculate deadline (1 hour from now)
            const deadline = BigInt(Math.floor(Date.now() / 1000) + 3600);

            // Check if transaction was aborted before requesting permit signature
            checkAborted();

            toast.info(
              `Requesting permit signature for ${token.symbol || tokenAddress}...`,
              { duration: 3000 }
            );

            // Generate permit signature
            const permitData = await generatePermitSignature(
              tokenAddress,
              address,
              targetContractAddress,
              amount,
              deadline,
              publicClient,
              walletClient
            );

            checkAborted();

            permitSignaturesRef.current.set(tokenKey, permitData);
            permitSignatures.push(permitData);
          } catch (error) {
            console.error('Failed to collect permit signature:', error);
            toast.error('Failed to get permit signature!');
            throw error;
          }
        }
      }

      checkAborted();

      let hash: `0x${string}` = '0x';

      if (safe && safeInfo) {
        const mainTx = {
          to: targetContract.address,
          data: (() => {
            switch (mode) {
              case EMode.diifs: {
                if (shouldUseApproveRouter) {
                  return encodeFunctionData({
                    abi: targetContract.abi,
                    functionName: 'approveProxyCallDiffsWithMeta',
                    args: [
                      proxy.address,
                      diffs,
                      approvalsWithFlags,
                      tx.to,
                      data,
                      withdrawals.map((w) => w.balance),
                    ],
                  });
                } else if (shouldUsePermitRouter) {
                  return encodeFunctionData({
                    abi: targetContract.abi,
                    functionName: 'permitProxyCallDiffsWithMeta',
                    args: [
                      proxy.address,
                      diffs,
                      approvalsWithFlags,
                      permitSignatures,
                      tx.to,
                      data,
                      withdrawals.map((w) => w.balance),
                    ],
                  });
                } else {
                  return encodeFunctionData({
                    abi: targetContract.abi,
                    functionName: 'proxyCallDiffsMeta',
                    args: [
                      diffs,
                      approvalsWithFlags,
                      tx.to,
                      data,
                      withdrawals.map((w) => w.balance),
                    ],
                  });
                }
              }
              case EMode['pre/post']: {
                if (shouldUseApproveRouter) {
                  return encodeFunctionData({
                    abi: targetContract.abi,
                    functionName: 'approveProxyCallWithMeta',
                    args: [
                      proxy.address,
                      postTransfers,
                      approvalsWithFlags,
                      tx.to,
                      data,
                      withdrawals.map((w) => w.balance),
                    ],
                  });
                } else if (shouldUsePermitRouter) {
                  return encodeFunctionData({
                    abi: targetContract.abi,
                    functionName: 'permitProxyCallWithMeta',
                    args: [
                      proxy.address,
                      postTransfers,
                      approvalsWithFlags,
                      permitSignatures,
                      tx.to,
                      data,
                      withdrawals.map((w) => w.balance),
                    ],
                  });
                } else {
                  return encodeFunctionData({
                    abi: targetContract.abi,
                    functionName: 'proxyCallMeta',
                    args: [
                      postTransfers,
                      approvalsWithFlags,
                      tx.to,
                      data,
                      withdrawals.map((w) => w.balance),
                    ],
                  });
                }
              }
              default:
                return '0x';
            }
          })(),
          value: String(value || 0n),
        };

        const result = await safe.txs.send({
          txs: [mainTx],
        });

        // Check if aborted after async operation
        checkAborted();

        // Validate that we got a safeTxHash back
        if (!result.safeTxHash) {
          throw new Error('Failed to create Safe transaction - no safeTxHash returned');
        }

        hash = result.safeTxHash as `0x${string}`;

        toast.success('Transaction sent to Safe for signing!', {
          duration: 7_000,
          position: 'top-center',
          closeButton: true,
          action: {
            label: 'View in Safe',
            onClick: () =>
              window.open(
                `https://app.safe.global/transactions/queue?safe=${safeInfo.safeAddress}`,
                '_blank',
                'noopener,noreferrer'
              ),
          },
        });
      } else {
        switch (mode) {
          case EMode.diifs: {
            if (shouldUseApproveRouter) {
              hash = await writeContractAsync({
                abi: targetContract.abi,
                address: targetContract.address as `0x${string}`,
                functionName: 'approveProxyCallDiffsWithMeta',
                args: [
                  proxy.address,
                  diffs,
                  approvalsWithFlags,
                  tx.to,
                  data,
                  withdrawals.map((w) => w.balance),
                ],
                value: value,
              });
            } else if (shouldUsePermitRouter) {
              hash = await writeContractAsync({
                abi: targetContract.abi,
                address: targetContract.address as `0x${string}`,
                functionName: 'permitProxyCallDiffsWithMeta',
                args: [
                  proxy.address,
                  diffs,
                  approvalsWithFlags,
                  permitSignatures as readonly PermitData[] & never[],
                  tx.to,
                  data,
                  withdrawals.map((w) => w.balance),
                ],
                value: value,
              });
            } else {
              hash = await writeContractAsync({
                abi: targetContract.abi,
                address: targetContract.address as `0x${string}`,
                functionName: 'proxyCallDiffsMeta',
                args: [
                  diffs,
                  approvalsWithFlags,
                  tx.to,
                  data,
                  withdrawals.map((w) => w.balance),
                ],
                value: value,
              });
            }

            break;
          }

          case EMode['pre/post']: {
            if (shouldUseApproveRouter) {
              hash = await writeContractAsync({
                abi: targetContract.abi,
                address: targetContract.address as `0x${string}`,
                functionName: 'approveProxyCallWithMeta',
                args: [
                  proxy.address,
                  postTransfers,
                  approvalsWithFlags,
                  tx.to,
                  data,
                  withdrawals.map((w) => w.balance),
                ],
                value: value,
              });
            } else if (shouldUsePermitRouter) {
              hash = await writeContractAsync({
                abi: targetContract.abi,
                address: targetContract.address as `0x${string}`,
                functionName: 'permitProxyCallWithMeta',
                args: [
                  proxy.address,
                  postTransfers,
                  approvalsWithFlags,
                  permitSignatures as readonly PermitData[] & never[],
                  tx.to,
                  data,
                  withdrawals.map((w) => w.balance),
                ],
                value: value,
              });
            } else {
              hash = await writeContractAsync({
                abi: targetContract.abi,
                address: targetContract.address as `0x${string}`,
                functionName: 'proxyCallMeta',
                args: [
                  postTransfers,
                  approvalsWithFlags,
                  tx.to,
                  data,
                  withdrawals.map((w) => w.balance),
                ],
                value: value,
              });
            }

            break;
          }
        }

        // Only wait for transaction receipt for non-Safe transactions
        // Safe transactions return safeTxHash which is not an on-chain tx hash
        if (!safe) {
          const txData = await waitForTx(publicClient, hash, 1);

          // Check if aborted after async operation
          checkAborted();

          if (txData?.status === 'success') {
            toast.success('Transaction sent successfully!', {
              duration: 7_000,
              position: 'top-center',
              closeButton: true,
              action: {
                label: 'Open in Explorer',
                onClick: () =>
                  window.open(
                    `${getExplorerUrl(chainId)}/tx/${hash}`,
                    '_blank',
                    'noopener,noreferrer'
                  ),
              },
            });
          } else {
            toast.error('Transaction sent unsuccessfully!');
          }
        }
      }

      resolve(hash);
      hideModal();
      resetCheckState();
    } catch (error) {
      console.error('Transaction failed with error:', error);
      console.error('Error details:', error);

      // Check if error is due to user abort
      if (
        error instanceof Error &&
        error.message === 'Transaction aborted by user'
      ) {
        toast.info('Transaction cancelled');
      } else if (safe) {
        // Safe-specific error handling
        toast.error('Failed to send transaction to Safe!', {
          duration: 7_000,
          position: 'top-center',
          description: error instanceof Error ? error.message : 'Unknown error',
        });
      } else {
        toast.error('Transaction failed!');
      }

      closeModal();
      resetCheckState();
      
      // Reject the promise with the error so callers can handle it
      if (reject) {
        reject(error);
      }
    } finally {
      setIsLoading(false);
      abortControllerRef.current = null;
    }
  };

  const clamp = useCallback(
    (n: number) => Math.min(Math.max(n, MIN_SLIPPAGE), MAX_SLIPPAGE),
    []
  );

  const handleChange = useCallback((e: ChangeEvent<HTMLInputElement>) => {
    const v = e.target.value;
    if (v === '' || /^\d*\.?\d*$/.test(v)) {
      setInputSlippage(v);
    }
  }, []);

  const handleBlur = useCallback(() => {
    if (inputSlippage === '') {
      setInputSlippage(activeSlippage.toString());
      return;
    }
    const num = clamp(parseFloat(inputSlippage));
    setActiveSlippage(num);
    setInputSlippage(num.toString());
  }, [inputSlippage, activeSlippage, setActiveSlippage, clamp]);

  // Update input slippage when mode changes
  useEffect(() => {
    setInputSlippage(activeSlippage.toString());
  }, [mode, activeSlippage]);

  if (!modalOpen) return null;

  return (
    <Dialog
      open={modalOpen}
      onOpenChange={(open) => {
        if (!open) {
          resetCheckState();
          closeModal();
        }
      }}
    >
      <DialogContent className="overflow-y-auto max-h-[80vh]">
        <DialogHeader>
          <DialogTitle>Settings</DialogTitle>
          <DialogDescription className="flex items-center justify-between">
            <span className="text-sm">
              {tx
                ? `Call to ${shortenAddress(tx.to)}`
                : 'Setup your tx options here.'}
            </span>
            <Button
              variant="outline"
              onClick={toggleAdvanced}
              disabled={isLoading || !isSimulationComplete}
            >
              {isLoading
                ? 'Saving...'
                : !isSimulationComplete
                  ? 'Preparing...'
                  : isAdvanced
                    ? 'Hide advanced'
                    : 'Show advanced'}
            </Button>
          </DialogDescription>
        </DialogHeader>

        {isAdvanced ? (
          <>
            <Tabs value={mode}>
              <TabsList defaultValue={EMode.diifs} className="w-full">
                {getEnumValues(EMode).map((mode) => {
                  return (
                    <TabsTrigger value={mode} onClick={() => setMode(mode)}>
                      {mode}
                    </TabsTrigger>
                  );
                })}
              </TabsList>
            </Tabs>
            <Label htmlFor="Slippage">Slippage (%)</Label>
            <Input
              value={inputSlippage}
              onChange={handleChange}
              onBlur={handleBlur}
              placeholder="Slippage"
            />
            {mode === EMode['pre/post'] && (
              <p className="text-xs text-muted-foreground mt-1">
                Pre/Post mode requires higher slippage (recommended: 1-3%). With eth amount around 0.01 slippage is recommended to be at lease 10%
              </p>
            )}
            <Accordion type="single" collapsible defaultValue="pre-transfer">
              <AccordionItem value="approval">
                <AccordionTrigger>Approval</AccordionTrigger>
                <AccordionContent className="flex flex-col gap-2">
                  {checks.approvals.map((check, index) => (
                    <ApprovalComp
                      key={index}
                      check={check}
                      onChange={(check) => changeApprovalCheck(index, check)}
                      onRemove={() => removeApprovalCheck(index)}
                      index={index}
                    />
                  ))}
                  <Button onClick={createApprovalCheck}>Add</Button>
                </AccordionContent>
              </AccordionItem>
              <AccordionItem value="withdrawal">
                <AccordionTrigger>Withdrawal</AccordionTrigger>
                <AccordionContent className="flex flex-col gap-2">
                  {checks.withdrawals.map((check, index) => (
                    <WithdrawalComp
                      key={index}
                      check={check}
                      onChange={(check) => changeWithdrawalCheck(index, check)}
                      onRemove={() => removeWithdrawalCheck(index)}
                      index={index}
                    />
                  ))}
                  <Button onClick={createWithdrawalCheck}>Add</Button>
                </AccordionContent>
              </AccordionItem>
              {mode === EMode.diifs && (
                <AccordionItem value="diffs">
                  <AccordionTrigger>Diffs</AccordionTrigger>
                  <AccordionContent className="flex flex-col gap-2">
                    {checks.diffs.map((check, index) => (
                      <CheckComp
                        key={index}
                        check={check}
                        onChange={(check) => changeDiffsCheck(index, check)}
                        onRemove={() => removeDiffsCheck(index)}
                        index={index}
                      />
                    ))}
                    <Button onClick={createDiffsCheck}>Add</Button>
                  </AccordionContent>
                </AccordionItem>
              )}
              {mode === EMode['pre/post'] && (
                <>
                  <AccordionItem value="pre-transfer">
                    <AccordionTrigger>Pre-transfer</AccordionTrigger>
                    <AccordionContent className="flex flex-col gap-2">
                      {checks.preTransfer.map((check, index) => (
                        <CheckComp
                          key={index}
                          check={check}
                          onChange={(check) =>
                            changePreTransferCheck(index, check)
                          }
                          onRemove={() => removePreTransferCheck(index)}
                          index={index}
                        />
                      ))}
                      <Button onClick={createPreTransferCheck}>Add</Button>
                    </AccordionContent>
                  </AccordionItem>
                  <AccordionItem value="post-transfer">
                    <AccordionTrigger>Post-transfer</AccordionTrigger>
                    <AccordionContent className="flex flex-col gap-2">
                      {checks.postTransfer.map((check, index) => (
                        <CheckComp
                          key={index}
                          check={check}
                          onChange={(check) =>
                            changePostTransferCheck(index, check)
                          }
                          onRemove={() => removePostTransferCheck(index)}
                          index={index}
                        />
                      ))}
                      <Button onClick={createPostTransferCheck}>Add</Button>
                    </AccordionContent>
                  </AccordionItem>
                </>
              )}
            </Accordion>
          </>
        ) : (
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label>You spend:</Label>
              {checks.diffs
                .filter(
                  (check) => check.token != '' && Number(check.balance) < 0
                )
                .map((check) => (
                  <p key={check.token} className="text-lg font-bold">
                    - {formatter.format(Math.abs(Number(check.balance)))}{' '}
                    {check.symbol}
                  </p>
                ))}
            </div>
            <div className="flex flex-col gap-2">
              <Label>You receive:</Label>
              {checks.diffs
                .filter(
                  (check) => check.token != '' && Number(check.balance) > 0
                )
                .map((check) => (
                  <p key={check.token} className="text-lg font-bold">
                    + {formatter.format(Number(check.balance))} {check.symbol}
                  </p>
                ))}
            </div>
          </div>
        )}

        {loadingStep && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span>{loadingStep}</span>
          </div>
        )}

        <DialogFooter className="flex items-center justify-between">
          <Button
            variant="outline"
            onClick={() => {
              resetCheckState();
              closeModal();
            }}
          >
            Close
          </Button>
          <Button
            onClick={handleSave}
            disabled={isLoading || !isSimulationComplete}
          >
            {isLoading && <Loader2 className="animate-spin" />}{' '}
            {isLoading
              ? 'Saving...'
              : !isSimulationComplete
                ? 'Preparing...'
                : 'Save'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
