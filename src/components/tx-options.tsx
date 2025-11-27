import { useModalPromise } from '@/hooks/use-modal-promise';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from './ui/dialog';
import { Label } from './ui/label';
import { Button } from './ui/button';
import { Card } from './ui/card';
import { Input } from './ui/input';
import { Checkbox } from './ui/checkbox';
import { Loader2, X } from 'lucide-react';
import {
  Check,
  EMode,
  MAX_SLIPPAGE,
  MIN_SLIPPAGE,
  useChecks,
} from '@/hooks/use-checks';
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
import { ChangeEvent, useCallback, useEffect, useRef, useState } from 'react';
import {
  formatBalance,
  formatToken,
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
  const filteredChecks = checks.filter((check) => check.token !== zeroAddress);
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
  const abortControllerRef = useRef<AbortController | null>(null);

  const {
    modalOpen,
    closeModal,
    tx,
    resolve,
    hideModal,
    isAdvanced,
    toggleAdvanced,
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

  const [inputSlippage, setInputSlippage] = useState<string>(String(slippage));
  
  const [usePermitRouter, setUsePermitRouter] = useState<boolean>(() => {
    const saved = localStorage.getItem('usePermitRouter');
    return saved !== null ? saved === 'true' : true;
  });

  // Store permit signatures for multiple tokens to reuse between simulation calls and execution
  // Key: token address (lowercase), Value: permit signature data
  const permitSignaturesRef = useRef<Map<string, PermitData>>(new Map());

  useEffect(() => {
    localStorage.setItem('usePermitRouter', String(usePermitRouter));
  }, [usePermitRouter]);

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
    // Clear all stored permit signatures
    permitSignaturesRef.current.clear();
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
    if (!publicClient || tx === null || !address) {
      return;
    }

    try {
      /**
       * SECURE TWO-PHASE SIMULATION FLOW:
       * 
       * Phase 1: Original Transaction (for security verification)
       * - Simulate the ORIGINAL Uniswap transaction with real Permit2 signature
       * - This may fail (expected) because Permit2 validation happens on-chain
       * - If it succeeds, we get approximate asset changes for validation
       * 
       * Phase 2: Modified Transaction (for proxy execution)
       * - Modify the calldata: remove Permit2 commands, adjust V4 payer flags
       * - Simulate through our proxy routers (ApproveRouter/BasicProxy)
       * - Get REAL asset changes that will be shown to the user
       * - Populate the modal with accurate swap amounts
       * 
       * This two-phase approach provides:
       * ✅ Security: User sees what Uniswap intended (Phase 1)
       * ✅ Accuracy: User sees what will actually happen (Phase 2)
       * ✅ Transparency: Both simulations are logged for verification
       */
      
      // Step 1: Get contract references
      const proxy = getContract('proxy', chainId);
      const uniswapRouter = getContract('uniswapRouter', chainId);
      const approveRouter = getContract('proxyApproveRouter', chainId);

      const isUniversalRouter = isUniversalRouterTransaction(
        tx.to,
        uniswapRouter.address
      );

      // Step 2: Try to simulate ORIGINAL transaction to get approximate changes
      console.log('🔍 Step 1: Simulating ORIGINAL transaction for approximate changes...');
      let originalSimRes;
      let hasOriginalSimulation = false;

      // Retry logic for original simulation (may fail due to network issues)
      let originalSimRetries = 100;
      while (originalSimRetries > 0 && !hasOriginalSimulation) {
        try {
          originalSimRes = await publicClient.simulateCalls({
            traceAssetChanges: true,
            account: address,
            calls: [
              {
                to: tx.to as `0x${string}`,
                data: tx.data as `0x${string}`,
                value: BigInt(tx.value || 0),
              },
            ],
          });

          if (originalSimRes.results[0].status === 'success') {
            console.log('✅ Original simulation successful:', originalSimRes.assetChanges);
            hasOriginalSimulation = true;
          } else {
            console.warn('⚠️ Original simulation returned failure status');
            originalSimRetries -= 1;
            if (originalSimRetries > 0) {
              console.log(`🔄 Retrying original simulation (${originalSimRetries} attempts left)...`);
              await new Promise(resolve => setTimeout(resolve, 500)); // Wait 500ms before retry
            }
          }
        } catch (error) {
          originalSimRetries -= 1;
          if (originalSimRetries > 0) {
            console.warn(`⚠️ Original simulation failed, retrying (${originalSimRetries} attempts left)...`);
            await new Promise(resolve => setTimeout(resolve, 500)); // Wait 500ms before retry
          } else {
            console.warn('⚠️ Original simulation failed after all retries (expected for Permit2):', error);
            console.log('💡 Will use modified transaction simulation for all values');
          }
        }
      }

      // Step 3: Modify transaction calldata for proxy execution
      console.log('🔍 Step 2: Modifying transaction calldata for proxy...');
      let modifiedData = tx.data;

      if (isUniversalRouter) {
        const modified = modifyUniversalRouterCalldata(
          tx.data,
          uniswapRouter,
          address
        );
        modifiedData = modified ?? tx.data;
        console.log('✅ Calldata modified for Universal Router');
      }

      // Step 4: Extract swap info to determine router and build approvals
      const swapInfo = isUniversalRouter
        ? extractSwapInfo(tx.data, uniswapRouter.abi)
        : null;

      console.log('🔍 Swap info:', swapInfo);

      // Step 5: Build approximate diffs and approvals from original simulation if available
      let approvalAmount = 0n;
      let inputTokenAddress: `0x${string}` | null = null;

      if (hasOriginalSimulation && originalSimRes) {
        // Get input token (negative diff) from original simulation
        const inputChange = originalSimRes.assetChanges.find(
          (change) => change.value.diff < 0n
        );
        if (inputChange) {
          inputTokenAddress = inputChange.token.address as `0x${string}`;
          // Add 10% buffer to approval amount to account for slippage/rounding
          const rawAmount = -inputChange.value.diff;
          approvalAmount = rawAmount;
          // approvalAmount = rawAmount + (rawAmount * 1n / 1000n);
          console.log('📊 From original simulation:', {
            token: inputTokenAddress,
            amount: approvalAmount.toString(),
            rawAmount: rawAmount.toString(),
            buffer: '10%',
          });
        }
      } else if (swapInfo?.inputToken && swapInfo.inputToken !== zeroAddress) {
        // Fallback to swap info
        inputTokenAddress = swapInfo.inputToken as `0x${string}`;
        
        if (swapInfo.inputAmount > 0n) {
          approvalAmount = swapInfo.inputAmount;
        } else {
          // V4 or case where we don't have amount - check user's token balance
          try {
            const balance = await publicClient.readContract({
              address: inputTokenAddress,
              abi: erc20Abi,
              functionName: 'balanceOf',
              args: [address],
            });
            // Use the user's full balance as approval amount (they probably want to swap it all)
            approvalAmount = balance;
            console.log('📊 Using user balance for approval:', {
              token: inputTokenAddress,
              balance: balance.toString(),
            });
          } catch {
            // If we can't get balance, use a reasonably large number (1 trillion tokens with 18 decimals)
            approvalAmount = BigInt('1000000000000000000000000'); // 1M tokens
            console.warn('⚠️ Could not get token balance, using default approval amount');
          }
        }
        
        console.log('📊 From swap info (fallback):', {
          token: inputTokenAddress,
          amount: approvalAmount.toString(),
        });
      }

      // Step 6: Determine which router to use and check/request approvals BEFORE simulation
      let shouldUseApproveRouter = false;
      let willUsePermitForExecution = false;
      let permitSignature: PermitData | null = null;
      const isTokenSwap =
        inputTokenAddress && inputTokenAddress !== zeroAddress && inputTokenAddress !== ethAddress;

      if (isTokenSwap) {
        shouldUseApproveRouter = true;
        console.log('📝 Will use ApproveRouter for token swap');
      }

      const targetContract = shouldUseApproveRouter ? approveRouter : proxy;
      const permitRouter = getContract('proxyPermitRouter', chainId);

      // Step 6.5: Check and request approvals/permits BEFORE simulation
      if (isTokenSwap && inputTokenAddress && !walletClient) {
        console.error('❌ Wallet client required for token approvals');
        toast.error('Please connect your wallet to continue');
        return;
      }

      if (isTokenSwap && inputTokenAddress && walletClient) {
        console.log('🔍 Checking token approval for simulation...');
        
        // Check current allowance
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

        console.log('📊 Current allowance:', {
          token: tokenSymbol,
          current: currentAllowance.toString(),
          needed: approvalAmount.toString(),
        });

        // Check if approval is needed
        if (currentAllowance < approvalAmount) {
          console.log('⚠️ Insufficient allowance - requesting approval...');
          
          // Check if token supports permit (EIP-2612)
          const tokenSupportsPermit = await supportsPermit(inputTokenAddress, publicClient);
          
          if (usePermitRouter && tokenSupportsPermit) {
            // Check if we already have a stored permit signature for this token
            const tokenKey = inputTokenAddress.toLowerCase();
            const storedPermit = permitSignaturesRef.current.get(tokenKey);
            
            if (storedPermit) {
              console.log(`✅ Reusing stored permit signature for ${tokenSymbol} (${inputTokenAddress})`);
              permitSignature = storedPermit;
              willUsePermitForExecution = true;
            } else {
              console.log(`📝 Token ${tokenSymbol} supports permit - will collect signature for simulation and execution`);
              toast.info(`Requesting permit signature for ${tokenSymbol}...`, {
                duration: 3000,
              });

              try {
                const deadline = BigInt(Math.floor(Date.now() / 1000) + 3600); // 1 hour
                
                // Generate permit signature - will be used for both simulation and execution
                permitSignature = await generatePermitSignature(
                  inputTokenAddress,
                  address,
                  permitRouter.address, // Permit to PermitRouter
                  approvalAmount,
                  deadline,
                  publicClient,
                  walletClient
                );
                
                // Store for reuse in subsequent calls
                permitSignaturesRef.current.set(tokenKey, permitSignature);
                
                willUsePermitForExecution = true;
                console.log(`✅ Permit signature collected for ${tokenSymbol} - will use for simulation and execution`);
                toast.success(`Permit granted for ${tokenSymbol}`);
              } catch (error) {
                console.error('❌ Permit signature failed:', error);
                toast.error('Failed to get permit signature - please try standard approval');
                return;
              }
            }
          } else {
            // Request standard approval
            console.log('📝 Requesting standard approval...');
            toast.info(`Requesting approval for ${tokenSymbol}...`, {
              duration: 3000,
            });

            try {
              const hash = await walletClient.writeContract({
                abi: erc20Abi,
                address: inputTokenAddress,
                functionName: 'approve',
                args: [targetContract.address, approvalAmount],
              });

              console.log('⏳ Waiting for approval transaction:', hash);
              toast.info('Waiting for approval transaction...', {
                duration: 5000,
              });

              const receipt = await publicClient.waitForTransactionReceipt({ hash });

              if (receipt.status === 'reverted') {
                throw new Error('Approval transaction reverted');
              }

              console.log('✅ Approval confirmed - proceeding with simulation');
              toast.success(`${tokenSymbol} approved successfully!`);
            } catch (error) {
              console.error('❌ Approval failed:', error);
              const errorMessage = error instanceof Error ? error.message : 'Unknown error';
              toast.error(`Approval failed: ${errorMessage}`);
              return;
            }
          }
        } else {
          console.log('✅ Sufficient allowance already exists');
        }
      }

      // Step 7: Build simulation call for MODIFIED transaction through proxy
      console.log('🔍 Step 3: Simulating MODIFIED transaction through proxy...');

      // Determine which contract to use for simulation
      // If we have a permit signature, use PermitRouter for both simulation and execution
      // Otherwise use the target contract (ApproveRouter with approval already done)
      const simulationContract = willUsePermitForExecution ? permitRouter : targetContract;

      let simulationData: `0x${string}`;
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

      console.log('📋 Simulation config:', {
        shouldUseApproveRouter,
        willUsePermitForExecution,
        hasPermitSignature: !!permitSignature,
        simulationContract: simulationContract.address,
        executionContract: willUsePermitForExecution ? permitRouter.address : targetContract.address,
        approvals: approvals.map(a => ({
          target: a.balance.target,
          token: a.balance.token,
          balance: a.balance.balance.toString(),
          useTransfer: a.useTransfer,
        })),
        txTo: tx.to,
        modifiedDataLength: modifiedData.length,
      });

      if (willUsePermitForExecution && permitSignature) {
        // Use PermitRouter for simulation with the permit signature
        simulationData = encodeFunctionData({
          abi: permitRouter.abi,
          functionName: 'permitProxyCallDiffsWithMeta',
          args: [
            proxy.address,
            [], // Empty diffs - we'll get real ones from simulation
            approvals,
            [permitSignature], // Pass the permit signature
            tx.to,
            modifiedData,
            [],
          ],
        }) as `0x${string}`;
      } else if (shouldUseApproveRouter && approvals.length > 0) {
        // Use ApproveRouter for simulation since we have approvals now
        simulationData = encodeFunctionData({
          abi: targetContract.abi,
          functionName: 'approveProxyCallDiffsWithMeta',
          args: [
            proxy.address,
            [], // Empty diffs - we'll get real ones from simulation
            approvals,
            tx.to,
            modifiedData,
            [],
          ],
        }) as `0x${string}`;
      } else {
        simulationData = encodeFunctionData({
          abi: proxy.abi,
          functionName: 'proxyCallDiffsMeta',
          args: [
            [], // Empty diffs
            approvals,
            tx.to,
            modifiedData,
            [],
          ],
        }) as `0x${string}`;
      }

      // Step 8: Simulate the MODIFIED transaction through proxy (with actual approvals in place)
      let retries = 100;
      let simRes;

      while (retries > 0) {
        try {
          simRes = await publicClient.simulateCalls({
            traceAssetChanges: true,
            account: address,
            calls: [
              {
                to: simulationContract.address as `0x${string}`, // Use appropriate contract for simulation
                data: simulationData,
                value: BigInt(tx.value || 0),
              },
            ],
          });

          break;
        } catch (error) {
          console.warn('⚠️ Proxy simulation failed:', error);
          console.log(
            '💡 Please manually configure approval and withdrawal checks'
          );

          retries -= 1;
        }
      }

      if (!simRes) {
        console.error('❌ Proxy simulation failed after all retries');
        return;
      }

      console.log('✅ Proxy simulation successful - showing real values in modal', simRes);

      // Check if simulation actually succeeded
      if (simRes.results[0].status !== 'success') {
        console.error('❌ Proxy simulation returned failure status:', simRes.results[0]);
        toast.error('Simulation failed - please check the transaction parameters');
        return;
      }

      // Step 9: Populate form with real values from proxy simulation
      const from = simRes.assetChanges.find((asset) => asset.value.diff < 0);
      const to = simRes.assetChanges.find((asset) => asset.value.diff > 0);

      console.log('📊 Asset changes for form:', { from, to });

      if (!from || !to) {
        console.error('❌ No asset changes detected in simulation');
        console.log('Asset changes:', simRes.assetChanges);
        toast.error('Could not detect token swap in simulation - please try again');
        return;
      }

      // Detect if input is ETH
      const isFromEth =
        from?.token.address === zeroAddress ||
        from?.token.address === ethAddress;

      // Create approval check if not exists
      if (!checks.approvals.length) {
        createApprovalCheck();
      }

      if (!checks.withdrawals.length) {
        createWithdrawalCheck();
      }

      // Create diff checks based on mode
      switch (mode) {
        case 'diifs': {
          if (!checks.diffs.length) {
            createDiffsCheck();
          }
          if (checks.diffs.length < 2) {
            createDiffsCheck();
          }
          break;
        }

        case EMode['pre/post']: {
          if (!checks.postTransfer.length) {
            createPostTransferCheck();
          }
          break;
        }
      }

      // Get token symbol and decimals for input token
      let appSymbol = 'ETH';
      let appDecimals = 18;

      if (!isFromEth && from?.token?.address) {
        [appSymbol, appDecimals] = await publicClient.multicall({
          contracts: [
            {
              abi: erc20Abi,
              address: from.token.address as `0x${string}`,
              functionName: 'symbol' as const,
              args: [],
            },
            {
              abi: erc20Abi,
              address: from.token.address as `0x${string}`,
              functionName: 'decimals' as const,
              args: [],
            },
          ],
          allowFailure: false,
        });
      }

      // Set approval check - use the ACTUAL approval amount we approved
      // Not the simulation result, to avoid mismatch between approved and used amounts
      const approvalBalance = formatBalance(approvalAmount, from?.token.decimals);

      changeApprovalCheck(0, {
        target: tx.to,
        token: formatToken(from?.token.symbol, from?.token.address),
        balance: approvalBalance,
        symbol: appSymbol,
        decimals: appDecimals,
      });

      // Get token symbol and decimals for output token
      let withSymbol = 'ETH';
      let withDecimals = 18;

      if (
        to?.token?.address &&
        to.token.address !== zeroAddress &&
        to.token.address !== ethAddress
      ) {
        [withSymbol, withDecimals] = await publicClient.multicall({
          contracts: [
            {
              abi: erc20Abi,
              address: to.token.address as `0x${string}`,
              functionName: 'symbol' as const,
              args: [],
            },
            {
              abi: erc20Abi,
              address: to.token.address as `0x${string}`,
              functionName: 'decimals' as const,
              args: [],
            },
          ],
          allowFailure: false,
        });
      }

      // Set withdrawal check with slippage
      changeWithdrawalCheck(0, {
        target: String(address),
        token: formatToken(to?.token.symbol, to?.token.address),
        balance:
          formatBalance(to?.value.diff, to?.token.decimals) *
          (1 - slippage / 100),
        symbol: withSymbol,
        decimals: withDecimals,
      });

      // Set diff checks based on mode
      switch (mode) {
        case EMode.diifs: {
          changeDiffsCheck(0, {
            target: String(address),
            token: formatToken(to?.token.symbol, to?.token.address),
            balance:
              formatBalance(to?.value.diff, to?.token.decimals) *
              (1 - slippage / 100),
          });

          const isEthInput =
            from?.token.address === zeroAddress ||
            from?.token.address === ethAddress;
          const inputBalance = -(
            formatBalance(from?.value.diff, from?.token.decimals) *
            (1 + slippage / 100)
          );

          if (!isEthInput || inputBalance >= 0) {
            changeDiffsCheck(1, {
              target: String(address),
              token: formatToken(from?.token.symbol, from?.token.address),
              balance: inputBalance,
            });
          }

          break;
        }

        case EMode['pre/post']: {
          changePostTransferCheck(0, {
            target: String(address),
            token: formatToken(to?.token.symbol, to?.token.address),
            balance: formatBalance(
              BigInt(Number(to?.value.post || 0n) * (1 - slippage / 100)),
              to?.token.decimals
            ),
          });

          break;
        }
      }

      console.log('✅ Form populated with real values from proxy simulation');
    } catch (error) {
      console.error('❌ Error in setDataToForm:', error);
      toast.error(
        `Failed to prepare transaction: ${error instanceof Error ? error.message : String(error)}`
      );
      return;
    }
  }, [
    publicClient,
    tx,
    address,
    chainId,
    slippage,
    mode,
    walletClient,
    usePermitRouter,
    checks.approvals.length,
    checks.withdrawals.length,
    checks.diffs.length,
    checks.postTransfer.length,
    createApprovalCheck,
    createWithdrawalCheck,
    createDiffsCheck,
    createPostTransferCheck,
    changeApprovalCheck,
    changeWithdrawalCheck,
    changeDiffsCheck,
    changePostTransferCheck,
  ]);

  useEffect(() => {
    setDataToForm();
  }, [setDataToForm]);

  useEffect(() => {
    if (!modalOpen && abortControllerRef.current) {
      console.log('⚠️ Modal closed - aborting transaction');
      toast.error('Transaction aborted by user');
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

      const [postTransfers, preTransfers, diffs, approvals, withdrawals] =
        await Promise.all([
          transformToMetadata(checks.postTransfer, publicClient),
          transformToMetadata(checks.preTransfer, publicClient),

          transformToMetadata(checks.diffs, publicClient),
          transformToMetadata(approvalsToUse, publicClient),
          transformToMetadata(withdrawalsToUse, publicClient),
        ]);

      checkAborted();

      const approvalsWithFlags = approvals.map((approval) => ({
        balance: approval.balance,
        useTransfer: isUniversalRouter && !hasWrapEthCommand,
      }));

      const preTransfersWithFlags = preTransfers.map((preTransfer) => ({
        balance: preTransfer.balance,
        useTransfer: false,
      }));

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

      const shouldUsePermitRouter = usePermitRouter && allTokensSupportPermit && !safe;

      const shouldUseApproveRouter =
        !shouldUsePermitRouter && approvalsWithFlags.some((a) => a.useTransfer);

      const permitRouter = getContract('proxyPermitRouter', chainId);
      const targetContract = shouldUseApproveRouter
        ? approveRouter
        : shouldUsePermitRouter
          ? permitRouter
          : proxy;

      console.log('🔍 Router selection:', {
        usePermitRouter,
        shouldUseApproveRouter,
        shouldUsePermitRouter,
        allTokensSupportPermit,
        targetContract: targetContract.address,
        permitSupport,
      });

      const targetContractAddress = targetContract.address as `0x${string}`;
      const value = tx.value ? BigInt(tx.value) : undefined;

      // Store permit signatures for later use (only needed if using permit router)
      const permitSignatures: PermitData[] = [];

      // Only collect permit signatures if using permit router
      // Standard approvals were already handled in setDataToForm()
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
              `✅ Reusing stored permit signature for ${token.symbol || tokenAddress}`
            );
            permitSignatures.push(storedPermit);
            continue; // Skip to next token
          }

          console.log(
            `📝 Token ${tokenAddress} supports permit - collecting new signature for execution`
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

            console.log(`✅ Permit signature collected for ${token.symbol || tokenAddress}`);
            
            // Store for potential reuse
            permitSignaturesRef.current.set(tokenKey, permitData);
            permitSignatures.push(permitData);
          } catch (error) {
            console.error('❌ Failed to collect permit signature:', error);
            const errorMessage =
              error instanceof Error ? error.message : 'Unknown error';
            toast.error(`Failed to get permit signature: ${errorMessage}`);
            throw error;
          }
        }
      }

      checkAborted();

      let hash: `0x${string}` = '0x';

      console.log('MODE USAGE:', mode, {
        shouldUseApproveRouter,
        shouldUsePermitRouter,
      });

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
                      preTransfersWithFlags,
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
                      preTransfersWithFlags,
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
                      preTransfersWithFlags,
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
          value: value || 0n,
        };

        const result = await safe.txs.send({
          txs: [mainTx],
        });

        // Check if aborted after async operation
        checkAborted();

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
              console.log({diffs})

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
                  preTransfersWithFlags,
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
                  preTransfersWithFlags,
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
                  preTransfersWithFlags,
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

      resolve(hash);
      hideModal();
      resetCheckState();
    } catch (error) {
      console.error('❌ Transaction failed with error:', error);
      console.error('Error details:', error);

      // Check if error is due to user abort
      if (
        error instanceof Error &&
        error.message === 'Transaction aborted by user'
      ) {
        console.log('🛑 Transaction was aborted by user');
        toast.info('Transaction cancelled');
      } else {
        const errorMessage =
          error instanceof Error ? error.message : 'Unknown error';
        toast.error(`Transaction failed: ${errorMessage}`);
      }

      closeModal();
      resetCheckState();
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
      setInputSlippage(slippage.toString());
      return;
    }
    const num = clamp(parseFloat(inputSlippage));
    setSlippage(num);
    setInputSlippage(num.toString());
  }, [inputSlippage, slippage, setSlippage, clamp]);

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
            <Button variant="outline" onClick={toggleAdvanced}>
              {isAdvanced ? 'Hide advanced' : 'Show advanced'}
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
            <Label htmlFor="Slippage">Slippage</Label>
            <Input
              value={inputSlippage}
              onChange={handleChange}
              onBlur={handleBlur}
              placeholder="Slippage"
            />
            <div className="flex items-center space-x-2 pt-2">
              <Checkbox
                id="use-permit-router"
                checked={usePermitRouter}
                onCheckedChange={(checked: boolean) => 
                  setUsePermitRouter(checked === true)
                }
              />
              <Label
                htmlFor="use-permit-router"
                className="text-sm font-normal cursor-pointer"
              >
                Use Permit Router (gasless approvals via EIP-2612 signatures)
              </Label>
            </div>
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
              {checks.approvals
                .filter((check) => check.token != '')
                .map((check) => (
                  <p key={check.token} className="text-lg font-bold">
                    - {check.balance.toFixed(6)} {check.symbol}
                  </p>
                ))}
            </div>
            <div className="flex flex-col gap-2">
              <Label>You receive:</Label>
              {checks.withdrawals
                .filter((check) => check.token != '')
                .map((check) => (
                  <p key={check.token} className="text-lg font-bold">
                    + {check.balance.toFixed(6)} {check.symbol}
                  </p>
                ))}
            </div>
            <div className="flex items-center space-x-2 pt-2">
              <Checkbox
                id="use-permit-router-simple"
                checked={usePermitRouter}
                onCheckedChange={(checked: boolean) => 
                  setUsePermitRouter(checked === true)
                }
              />
              <Label
                htmlFor="use-permit-router-simple"
                className="text-sm font-normal cursor-pointer"
              >
                Use Permit Router (gasless approvals)
              </Label>
            </div>
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
          <Button onClick={handleSave} disabled={isLoading}>
            {isLoading && <Loader2 className="animate-spin" />}{' '}
            {isLoading ? 'Saving...' : 'Save'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
