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
  useWriteContract,
} from 'wagmi';
import { getProxyContract, getUniswapRouterContract } from '@/lib/contracts';
import {
  Abi,
  decodeFunctionData,
  encodeFunctionData,
  encodeAbiParameters,
  decodeAbiParameters,
  erc20Abi,
  ethAddress,
  parseAbi,
  parseUnits,
  PublicClient,
  zeroAddress,
} from 'viem';
import { whatsabi } from '@shazow/whatsabi';
import { ChangeEvent, useCallback, useEffect, useState } from 'react';
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

  const setDataToForm = async () => {
    if (!publicClient || tx === null) {
      return;
    }

    let simRes;
    try {
      simRes = await publicClient.simulateCalls({
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
    } catch (error) {
      console.warn('⚠️ Simulation failed:', error);
      console.log(
        '💡 Please manually configure approval and withdrawal checks'
      );

      // Create empty checks for manual configuration
      if (!checks.approvals.length) {
        createApprovalCheck();
      }
      if (!checks.withdrawals.length) {
        createWithdrawalCheck();
      }

      switch (mode) {
        case 'diifs': {
          if (!checks.diffs.length) {
            createDiffsCheck();
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

      return; // Exit early if simulation fails
    }

    const from = simRes.assetChanges.find((asset) => {
      if (0 > asset.value.diff) {
        return true;
      }
    });

    const to = simRes.assetChanges.find((asset) => {
      if (0 < asset.value.diff) {
        return true;
      }
    });

    // console.log('FROM > TO', from, to);

    // Detect if input is ETH before creating checks
    const isFromEth =
      from?.token.address === zeroAddress || from?.token.address === ethAddress;
    // const isFromEth = false;

    // Always create approval check (for UI display)
    // Backend will handle ETH vs token logic appropriately
    if (!checks.approvals.length) {
      createApprovalCheck();
    }

    if (!checks.withdrawals.length) {
      createWithdrawalCheck();
    }

    switch (mode) {
      case 'diifs': {
        // Create first diff check (always needed for output token)
        if (!checks.diffs.length) {
          createDiffsCheck();
        }

        // Only create second diff check if input is not ETH
        // (ETH is handled via transaction value)
        if (checks.diffs.length < 2 && !isFromEth) {
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

    let appSymbol = 'ETH';
    let appDecimals = 18;

    if (!isFromEth) {
      [appSymbol, appDecimals] = await publicClient.multicall({
        contracts: [
          {
            abi: erc20Abi,
            address: from?.token.address as `0x${string}`,
            functionName: 'symbol' as const,
            args: [],
          },
          {
            abi: erc20Abi,
            address: from?.token.address as `0x${string}`,
            functionName: 'decimals' as const,
            args: [],
          },
        ],
        allowFailure: false,
      });
    }
    // Add 0.1% buffer to account for precision loss in number conversion
    const approvalBalance =
      formatBalance(from?.value.diff, from?.token.decimals) * 1.001;

    // Only set approval check for non-ETH tokens
    // ETH is sent via transaction value, not approvals
    // if (!isFromEth) {
    changeApprovalCheck(0, {
      target: tx.to,
      token: formatToken(from?.token.symbol, from?.token.address),
      balance: approvalBalance,
      symbol: appSymbol,
      decimals: appDecimals,
    });
    // }

    let withSymbol = 'ETH';
    let withDecimals = 18;

    if (to?.token.address !== zeroAddress && to?.token.address !== ethAddress) {
      [withSymbol, withDecimals] = await publicClient.multicall({
        contracts: [
          {
            abi: erc20Abi,
            address: to?.token.address as `0x${string}`,
            functionName: 'symbol' as const,
            args: [],
          },
          {
            abi: erc20Abi,
            address: to?.token.address as `0x${string}`,
            functionName: 'decimals' as const,
            args: [],
          },
        ],
        allowFailure: false,
      });
    }

    changeWithdrawalCheck(0, {
      target: String(address),
      token: formatToken(to?.token.symbol, to?.token.address),
      balance:
        formatBalance(to?.value.diff, to?.token.decimals) *
        (1 - slippage / 100),
      symbol: withSymbol,
      decimals: withDecimals,
    });

    switch (mode) {
      case EMode.diifs: {
        changeDiffsCheck(0, {
          target: String(address),
          token: formatToken(to?.token.symbol, to?.token.address),
          balance:
            formatBalance(to?.value.diff, to?.token.decimals) *
            (1 - slippage / 100),
        });

        // Only add input diff if it's not ETH with negative value
        // ETH being sent should be handled via transaction value, not diffs
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
  };
  
  useEffect(() => {
    setDataToForm();
  }, [tx, address, slippage, mode]);

  const handleSave = async () => {
    setIsLoading(true);
    if (!address || !publicClient || !tx || !resolve) {
      console.error('No address or public client or tx or resolve');
      setIsLoading(false);
      return;
    }

    const proxy = getProxyContract(chainId);
    const uniswapRouter = getUniswapRouterContract(chainId);
    
    // Check if this is a Universal Router transaction
    const isUniversalRouter = tx.to?.toLowerCase() === uniswapRouter.address.toLowerCase();
    
    if (isUniversalRouter) {
      console.group('🔍 Universal Router Transaction Debug');
      console.log('Transaction to:', tx.to);
      console.log('Transaction data:', tx.data);
      console.log('Transaction value:', tx.value);
      
      try {
        // Decode Universal Router calldata
        const decoded = decodeFunctionData({
          abi: uniswapRouter.abi,
          data: tx.data as `0x${string}`,
        });
        
        console.log('📦 Decoded function:', decoded.functionName);
        console.log('📦 Decoded args:', decoded.args);
        
        // Parse execute() function - format: execute(bytes commands, bytes[] inputs, uint256 deadline)
        if (decoded.functionName === 'execute' && decoded.args) {
          const [commands, inputs, deadline] = decoded.args as [string, string[], bigint];
          
          console.log('🎯 Commands (hex):', commands);
          console.log('🎯 Number of commands:', (commands.length - 2) / 2); // Remove 0x and divide by 2
          console.log('🎯 Inputs array length:', inputs.length);
          console.log('🎯 Deadline:', deadline);
          
          // Parse each command byte
          const commandBytes = commands.slice(2); // Remove 0x
          const commandList = [];
          for (let i = 0; i < commandBytes.length; i += 2) {
            const commandByte = parseInt(commandBytes.substr(i, 2), 16);
            commandList.push(commandByte);
          }
          
          console.log('🎯 Command bytes:', commandList);
          
          // Map command bytes to names
          const COMMAND_NAMES: { [key: number]: string } = {
            0x00: 'V3_SWAP_EXACT_IN',
            0x01: 'V3_SWAP_EXACT_OUT',
            0x02: 'PERMIT2_TRANSFER_FROM',
            0x03: 'PERMIT2_PERMIT_BATCH',
            0x04: 'SWEEP',
            0x05: 'TRANSFER',
            0x06: 'PAY_PORTION',
            0x08: 'V2_SWAP_EXACT_IN',
            0x09: 'V2_SWAP_EXACT_OUT',
            0x0a: 'PERMIT2_PERMIT',
            0x0b: 'WRAP_ETH',
            0x0c: 'UNWRAP_WETH',
            0x0d: 'PERMIT2_TRANSFER_FROM_BATCH',
            0x10: 'V4_SWAP',
            0x11: 'LOOKS_RARE_721',
          };
          
          console.group('📋 Commands breakdown:');
          commandList.forEach((cmd, idx) => {
            console.log(`  ${idx}: 0x${cmd.toString(16).padStart(2, '0')} - ${COMMAND_NAMES[cmd] || 'UNKNOWN'}`);
          });
          console.groupEnd();
          
          // Log each input
          console.group('📋 Inputs breakdown:');
          inputs.forEach((input, idx) => {
            console.log(`  Input ${idx}:`, input);
            console.log(`    Length: ${input.length} characters`);
          });
          console.groupEnd();
        }
        
      } catch (error) {
        console.error('❌ Failed to decode Universal Router calldata:', error);
      }
      
      console.groupEnd();
    }
    
    // Modify Universal Router calldata for proxy execution
    let data = tx.data;
    
    if (isUniversalRouter) {
      console.group('🔧 Modifying Universal Router calldata');
      
      try {
        // Decode the current calldata
        const decoded = decodeFunctionData({
          abi: uniswapRouter.abi,
          data: tx.data as `0x${string}`,
        });
        
        if (decoded.functionName === 'execute' && decoded.args) {
          const [commands, inputs, deadline] = decoded.args as [string, string[], bigint];
          
          // Parse command bytes
          const commandBytes = commands.slice(2);
          const commandList: number[] = [];
          for (let i = 0; i < commandBytes.length; i += 2) {
            commandList.push(parseInt(commandBytes.substr(i, 2), 16));
          }
          
          console.log('Original commands:', commandList.map(c => '0x' + c.toString(16).padStart(2, '0')));
          console.log('Original inputs count:', inputs.length);
          
          const newCommands = [...commandList];
          const newInputs = [...inputs];
          
          // Find and remove PERMIT2_PERMIT (0x0a) command
          const permit2PermitIndex = commandList.indexOf(0x0a);
          if (permit2PermitIndex !== -1) {
            console.log(`🗑️  Removing PERMIT2_PERMIT command at index ${permit2PermitIndex}`);
            newCommands.splice(permit2PermitIndex, 1);
            newInputs.splice(permit2PermitIndex, 1);
          }
          
          // Check if there's an UNWRAP_WETH (0x0c) command
          // If present, keep swap recipient as router so UNWRAP_WETH can work
          // If not present, set swap recipient to user
          const hasUnwrapWeth = newCommands.indexOf(0x0c) !== -1;
          const hasWrapEth = newCommands.indexOf(0x0b) !== -1;
          const hasPayPortion = newCommands.indexOf(0x06) !== -1;
          const hasSweep = newCommands.indexOf(0x04) !== -1;
          
          // If any of these commands exist after the swap, tokens should stay in router
          const shouldKeepInRouter = hasUnwrapWeth || hasPayPortion || hasSweep;
          
          console.log(`Has UNWRAP_WETH: ${hasUnwrapWeth}`);
          console.log(`Has WRAP_ETH: ${hasWrapEth}`);
          console.log(`Has PAY_PORTION: ${hasPayPortion}`);
          console.log(`Has SWEEP: ${hasSweep}`);
          console.log(`Should keep tokens in router: ${shouldKeepInRouter}`);
          
          // Modify swap commands to use pre-transferred tokens
          for (let i = 0; i < newCommands.length; i++) {
            const command = newCommands[i];
            
            // V4_SWAP (0x10) - Handle nested action plan
            if (command === 0x10) {
              console.log('🔵 Modifying V4_SWAP at index', i);
              
              try {
                const v4Input = newInputs[i];
                
                // V4 input structure: abi.encode(bytes actions, bytes[] params)
                // This is encoded as two top-level parameters, not nested
                
                console.log('V4 input (first 400 chars):', v4Input.slice(0, 400));
                
                // Decode the V4 plan: (bytes actions, bytes[] params)
                // Actions is a bytes string where each byte is an action ID
                // Params is an array of bytes, one for each action
                const planDecoded = decodeAbiParameters(
                  [
                    { name: 'actions', type: 'bytes' },
                    { name: 'params', type: 'bytes[]' }
                  ],
                  v4Input as `0x${string}`
                );
                
                const actionsBytes = planDecoded[0];
                const params = planDecoded[1];
                
                console.log('Actions bytes:', actionsBytes);
                console.log('Params count:', params.length);
                
                // Parse actions
                const actions: number[] = [];
                const actionsHex = actionsBytes.slice(2); // Remove 0x
                for (let j = 0; j < actionsHex.length; j += 2) {
                  actions.push(parseInt(actionsHex.slice(j, j + 2), 16));
                }
                
                console.log('V4 Actions:', actions.map(a => `0x${a.toString(16).padStart(2, '0')}`));
                
                // V4 Action IDs (from v4-periphery Actions.sol)
                // Correct action IDs based on actual v4-periphery implementation:
                const V4_ACTIONS = {
                  SWAP_EXACT_IN_SINGLE: 0x06,
                  SWAP_EXACT_IN: 0x07,
                  SWAP_EXACT_OUT_SINGLE: 0x08,
                  SWAP_EXACT_OUT: 0x09,
                  SETTLE: 0x0b,           // ← CORRECT ID!
                  SETTLE_ALL: 0x0c,
                  SETTLE_PAIR: 0x0d,
                  TAKE: 0x0e,
                  TAKE_ALL: 0x0f,
                  TAKE_PORTION: 0x10,
                  TAKE_PAIR: 0x11,
                };
                
                // Modify SETTLE actions to use router's balance instead of Permit2
                const modifiedParams: `0x${string}`[] = [];
                let modified = false;
                
                for (let j = 0; j < actions.length; j++) {
                  const action = actions[j];
                  const param = params[j];
                  
                  console.log(`Action ${j}: 0x${action.toString(16).padStart(2, '0')}, param length: ${param.length}`);
                  
                  // Check if this is a SETTLE action that needs modification
                  // SETTLE action structure: (Currency currency, uint256 amount, bool payerIsUser)
                  if (action === V4_ACTIONS.SETTLE) {
                    console.log(`  → Found SETTLE action (0x0b), attempting to modify payerIsUser`);
                    
                    try {
                      // Decode SETTLE params: (address currency, uint256 amount, bool payerIsUser)
                      const settleParams = decodeAbiParameters(
                        [
                          { name: 'currency', type: 'address' },
                          { name: 'amount', type: 'uint256' },
                          { name: 'payerIsUser', type: 'bool' }
                        ],
                        param as `0x${string}`
                      );
                      
                      const [currency, amount, payerIsUser] = settleParams;
                      console.log('  → Original SETTLE params:', {
                        currency,
                        amount: amount.toString(),
                        payerIsUser
                      });
                      
                      // Re-encode with payerIsUser = false
                      const newParam = encodeAbiParameters(
                        [
                          { name: 'currency', type: 'address' },
                          { name: 'amount', type: 'uint256' },
                          { name: 'payerIsUser', type: 'bool' }
                        ],
                        [currency, amount, false]  // ← Change payerIsUser to false
                      );
                      
                      modifiedParams.push(newParam);
                      modified = true;
                      console.log('  → Modified payerIsUser from', payerIsUser, 'to false ✅');
                      
                    } catch (error) {
                      console.error('  → Failed to decode/modify SETTLE action:', error);
                      console.error('  → Param data:', param);
                      // Keep original param as fallback
                      modifiedParams.push(param as `0x${string}`);
                    }
                  }
                  // SETTLE_ALL action: (Currency currency, uint256 maxAmount)
                  // Note: SETTLE_ALL doesn't have payerIsUser, it always uses payer from context
                  else if (action === V4_ACTIONS.SETTLE_ALL) {
                    console.log('  → Found SETTLE_ALL action (0x0c) - no modification needed');
                    modifiedParams.push(param as `0x${string}`);
                  }
                  // SETTLE_PAIR action: (Currency currency0, Currency currency1)
                  else if (action === V4_ACTIONS.SETTLE_PAIR) {
                    console.log('  → Found SETTLE_PAIR action (0x0d) - no modification needed');
                    modifiedParams.push(param as `0x${string}`);
                  }
                  else {
                    // Other actions (SWAP, TAKE, etc.) - keep as-is
                    console.log(`  → Action 0x${action.toString(16).padStart(2, '0')} - keeping unchanged`);
                    modifiedParams.push(param as `0x${string}`);
                  }
                }
                
                if (modified) {
                  console.log('✅ Modified V4 plan, re-encoding...');
                  
                  // Re-encode the plan with modified params
                  const newV4Input = encodeAbiParameters(
                    [
                      { name: 'actions', type: 'bytes' },
                      { name: 'params', type: 'bytes[]' }
                    ],
                    [actionsBytes, modifiedParams]
                  );
                  
                  newInputs[i] = newV4Input;
                  console.log('✅ V4_SWAP modified successfully');
                  console.log('New V4 input length:', newV4Input.length);
                  
                } else {
                  console.warn('⚠️ No SETTLE actions found or modified in V4 plan');
                  console.warn('⚠️ Transaction may fail - V4 will try to use Permit2');
                  toast.error('V4 transaction may fail: No SETTLE actions could be modified for pre-transfer.');
                }
                
              } catch (error) {
                console.error('❌ Failed to process V4_SWAP:', error);
                console.error('Error details:', error);
                toast.error('Failed to process V4 swap. The transaction may still work with pre-transfer.');
                // Don't return - let it continue with unmodified input
              }
              
              // Continue to next command
              continue;
            }
            
            // V3_SWAP_EXACT_IN (0x00) or V3_SWAP_EXACT_OUT (0x01)
            if (command === 0x00 || command === 0x01) {
              const commandName = command === 0x00 ? 'V3_SWAP_EXACT_IN' : 'V3_SWAP_EXACT_OUT';
              console.log(`🔄 Modifying ${commandName} at index ${i}`);
              
              const swapInput = newInputs[i];
              const inputData = '0x' + swapInput.slice(2);
              
              // Parse current values
              // Structure for both: (address recipient, uint256 amount1, uint256 amount2, bytes path, bool payerIsUser)
              const recipient = '0x' + inputData.slice(2, 66).slice(24);
              const amount1 = '0x' + inputData.slice(66, 130);
              const amount2 = '0x' + inputData.slice(130, 194);
              const pathOffset = '0x' + inputData.slice(194, 258);
              const payerIsUserOld = BigInt('0x' + inputData.slice(258, 322)) === 1n;
              
              console.log('Old recipient:', recipient);
              console.log('Old payerIsUser:', payerIsUserOld);
              
              // Get the actual path data
              const pathOffsetInt = parseInt(pathOffset, 16);
              const pathLengthHex = inputData.slice(2 + pathOffsetInt * 2, 2 + pathOffsetInt * 2 + 64);
              const pathLength = parseInt(pathLengthHex, 16);
              const pathData = inputData.slice(2 + pathOffsetInt * 2 + 64, 2 + pathOffsetInt * 2 + 64 + pathLength * 2);
              
              // Construct new input with:
              // 1. Recipient = ADDRESS_THIS (router) if there are downstream commands (PAY_PORTION, SWEEP, UNWRAP_WETH)
              //    Otherwise send directly to user
              // 2. payerIsUser = false (always, since we're pre-transferring)
              let newRecipient: string;
              if (shouldKeepInRouter) {
                // Keep tokens in router for downstream commands (PAY_PORTION, SWEEP, UNWRAP_WETH)
                newRecipient = '0000000000000000000000000000000000000000000000000000000000000002'; // MSG_SENDER/ADDRESS_THIS constant
                console.log('New recipient: ADDRESS_THIS (0x02) - tokens will be processed by downstream commands');
              } else {
                // No downstream commands, send directly to user
                newRecipient = address!.slice(2).toLowerCase().padStart(64, '0');
                console.log('New recipient:', '0x' + newRecipient.slice(24));
              }
              const newPayerIsUser = '0'.padStart(64, '0'); // false
              
              console.log('New payerIsUser:', false);
              
              // Reconstruct the input
              // Structure: recipient (32 bytes) + amount1 (32 bytes) + amount2 (32 bytes) + pathOffset (32 bytes) + payerIsUser (32 bytes) + path
              const newInput = '0x' + 
                newRecipient + 
                amount1.slice(2) + 
                amount2.slice(2) + 
                pathOffset.slice(2) + 
                newPayerIsUser + 
                pathLengthHex + 
                pathData;
              
              newInputs[i] = newInput;
              console.log(`✅ Modified ${commandName} input`);
            }
            
            // V2_SWAP_EXACT_IN (0x08) or V2_SWAP_EXACT_OUT (0x09)
            if (command === 0x08 || command === 0x09) {
              const commandName = command === 0x08 ? 'V2_SWAP_EXACT_IN' : 'V2_SWAP_EXACT_OUT';
              console.log(`🔄 Modifying ${commandName} at index ${i}`);
              
              const swapInput = newInputs[i];
              const inputData = '0x' + swapInput.slice(2);
              
              // Parse current values
              // Structure for both: (address recipient, uint256 amount1, uint256 amount2, address[] path, bool payerIsUser)
              const recipient = '0x' + inputData.slice(2, 66).slice(24);
              const amount1 = '0x' + inputData.slice(66, 130);
              const amount2 = '0x' + inputData.slice(130, 194);
              const pathOffset = '0x' + inputData.slice(194, 258);
              const payerIsUserOld = BigInt('0x' + inputData.slice(258, 322)) === 1n;
              
              console.log('Old recipient:', recipient);
              console.log('Old payerIsUser:', payerIsUserOld);
              
              // Get the actual path data (address[] array)
              const pathOffsetInt = parseInt(pathOffset, 16);
              const pathArrayLengthHex = inputData.slice(2 + pathOffsetInt * 2, 2 + pathOffsetInt * 2 + 64);
              const pathArrayLength = parseInt(pathArrayLengthHex, 16);
              const pathArrayData = inputData.slice(2 + pathOffsetInt * 2 + 64, 2 + pathOffsetInt * 2 + 64 + pathArrayLength * 64);
              
              // Construct new input with:
              // 1. Recipient = ADDRESS_THIS (router) if there are downstream commands (PAY_PORTION, SWEEP, UNWRAP_WETH)
              //    Otherwise send directly to user
              // 2. payerIsUser = false (always, since we're pre-transferring)
              let newRecipient: string;
              if (shouldKeepInRouter) {
                // Keep tokens in router for downstream commands (PAY_PORTION, SWEEP, UNWRAP_WETH)
                newRecipient = '0000000000000000000000000000000000000000000000000000000000000002'; // MSG_SENDER/ADDRESS_THIS constant
                console.log('New recipient: ADDRESS_THIS (0x02) - tokens will be processed by downstream commands');
              } else {
                // No downstream commands, send directly to user
                newRecipient = address!.slice(2).toLowerCase().padStart(64, '0');
                console.log('New recipient:', '0x' + newRecipient.slice(24));
              }
              const newPayerIsUser = '0'.padStart(64, '0'); // false
              
              console.log('New payerIsUser:', false);
              
              // Reconstruct the input
              // Structure: recipient (32 bytes) + amount1 (32 bytes) + amount2 (32 bytes) + pathOffset (32 bytes) + payerIsUser (32 bytes) + pathArray
              const newInput = '0x' + 
                newRecipient + 
                amount1.slice(2) + 
                amount2.slice(2) + 
                pathOffset.slice(2) + 
                newPayerIsUser + 
                pathArrayLengthHex + 
                pathArrayData;
              
              newInputs[i] = newInput;
              console.log(`✅ Modified ${commandName} input`);
            }
          }
          
          // Encode new commands bytes
          const newCommandsHex = '0x' + newCommands.map(c => c.toString(16).padStart(2, '0')).join('');
          
          console.log('New commands:', newCommandsHex);
          console.log('New inputs count:', newInputs.length);
          
          // Re-encode the function call
          const newData = encodeFunctionData({
            abi: uniswapRouter.abi,
            functionName: 'execute',
            args: [newCommandsHex as `0x${string}`, newInputs as `0x${string}`[], deadline],
          });
          
          console.log('✅ Successfully modified calldata');
          console.log('Old data length:', tx.data.length);
          console.log('New data length:', newData.length);
          
          data = newData;
          
        }
        
      } catch (error) {
        console.error('❌ Failed to modify Universal Router calldata:', error);
        console.error(error);
      }
      
      console.groupEnd();
    } else {
      data = tx.data;
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

    // Get ETH value from original transaction (not from checks, since we skip ETH approvals)
    const value = tx.value ? BigInt(tx.value) : undefined;

    for (const token of tokenApprovals) {
      // Additional safety check
      if (
        !token.token ||
        token.token === '' ||
        token.token === zeroAddress ||
        token.token === ethAddress
      ) {
        continue;
      }

      const [allowance, decimals, balance] = await publicClient.multicall({
        contracts: [
          {
            abi: erc20Abi,
            address: token.token as `0x${string}`,
            functionName: 'allowance',
            args: [address, proxy.address],
          },
          {
            abi: erc20Abi,
            address: token.token as `0x${string}`,
            functionName: 'decimals',
            args: [],
          },
          {
            abi: erc20Abi,
            address: token.token as `0x${string}`,
            functionName: 'balanceOf',
            args: [address],
          },
        ],
        allowFailure: false,
      });

      const needed = parseUnits(
        token.balance.toString().replace(',', '.'),
        decimals
      );

      if (allowance >= needed) {
        // console.log('✅ Approval already sufficient, skipping');
        continue;
      }

      if (safe && safeInfo) {
        try {
          const approvalTx = {
            to: token.token as `0x${string}`,
            data: encodeFunctionData({
              abi: erc20Abi,
              functionName: 'approve',
              args: [
                proxy.address,
                parseUnits(
                  token.balance.toString().replace(',', '.'),
                  decimals
                ),
              ],
            }),
            value: 0n,
          };

          const result = await safe.txs.send({
            txs: [approvalTx],
          });

          console.log('Safe approval hash', result.safeTxHash);

          toast.success('Approval sent to Safe for signing!', {
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
        } catch (error) {
          console.error('Safe approval failed:', error);
          toast.error('Safe approval failed!');
          setIsLoading(false);
          return;
        }
      } else {
        const canIncrease = balance >= needed;
        const amountToApprove = canIncrease ? needed + 1n : balance;

        // console.log({canIncrease})

        const hash = await writeContractAsync({
          abi: erc20Abi,
          address: token.token as `0x${string}`,
          functionName: 'approve',
          args: [proxy.address, amountToApprove],
        });

        try {
          const receipt = await publicClient.waitForTransactionReceipt({
            hash,
          });

          console.log('✅ User approval transaction confirmed:', {
            hash,
            status: receipt.status,
            tokenAddress: token.token,
            spender: proxy.address,
            amount: amountToApprove.toString(),
          });
          resetCheckState();
        } catch (error) {
          console.error('❌ User approval transaction failed:', error);
          resetCheckState();
        }
      }
    }

    // Detect if transaction has WRAP_ETH command (ETH input - comes with tx.value)
    let hasWrapEthCommand = false;
    if (isUniversalRouter) {
      try {
        const decoded = decodeFunctionData({
          abi: uniswapRouter.abi,
          data: tx.data as `0x${string}`,
        });
        if (decoded.functionName === 'execute' && decoded.args) {
          const [commands] = decoded.args as [string, string[], bigint];
          const commandBytes = commands.slice(2);
          for (let i = 0; i < commandBytes.length; i += 2) {
            if (parseInt(commandBytes.substr(i, 2), 16) === 0x0b) {
              hasWrapEthCommand = true;
              break;
            }
          }
        }
      } catch {
        // Ignore decode errors
      }
    }

    // For Universal Router, we need to adjust checks:
    // - For token input: Add pre-transfer items to approvals (proxy will transfer from user → router)
    // - For ETH input: No approvals needed (ETH comes with tx.value)
    // - Only output token balance will change during proxy execution
    // - No withdrawals needed (diffs check is sufficient, proxy doesn't hold tokens)
    let diffsToUse = checks.diffs;
    let approvalsToUse = tokenApprovals;
    let withdrawalsToUse = checks.withdrawals;
    
    if (isUniversalRouter) {
      console.log('🔧 Adjusting checks for Universal Router');
      console.log('Original diffs:', checks.diffs);
      console.log('Original approvals:', tokenApprovals);
      console.log('Original withdrawals:', checks.withdrawals);
      console.log('Has WRAP_ETH:', hasWrapEthCommand);
      
      if (hasWrapEthCommand) {
        // ETH input: No pre-transfer, ETH comes with tx.value
        // No approval checks needed
        approvalsToUse = [];
        
        // Keep all diffs (ETH decrease will be from tx.value, not from balance change)
        // Filter to only positive diffs (output token increase)
        diffsToUse = checks.diffs.filter(diff => diff.balance >= 0);
        
        // No withdrawal checks - proxy doesn't hold the tokens
        withdrawalsToUse = [];
      } else {
        // Token input: Add pre-transfer to approvals array
        // The proxy will transfer tokens from user → router in the same transaction
        // Change target to Universal Router address for pre-transfer
        approvalsToUse = tokenApprovals.map(approval => ({
          ...approval,
          target: uniswapRouter.address, // Proxy will transfer to router, not approve proxy
        }));
        
        // Filter out negative diffs (input tokens) - their balance will change from proxy transfer
        diffsToUse = checks.diffs.filter(diff => diff.balance >= 0);
        
        // No withdrawal checks needed for any token - diffs check is sufficient
        // Withdrawal checks try to send tokens which the proxy doesn't have
        withdrawalsToUse = [];
      }
      
      console.log('Adjusted approvals:', approvalsToUse);
      console.log('Adjusted diffs (output only):', diffsToUse);
      console.log('Adjusted withdrawals:', withdrawalsToUse);
    }

    const [postTransfers, preTransfers, diffs, approvals, withdrawals] =
      await Promise.all([
        transformToMetadata(checks.postTransfer, publicClient),
        transformToMetadata(checks.preTransfer, publicClient),

        transformToMetadata(diffsToUse, publicClient),
        transformToMetadata(approvalsToUse, publicClient),
        transformToMetadata(withdrawalsToUse, publicClient),
      ]);

    // For Universal Router with token input: use transfer (true) so proxy transfers tokens to router
    // For everything else: use approve (false) - default behavior
    const transferFlags = approvals.map(() => isUniversalRouter && !hasWrapEthCommand);
    const preTransferFlags = preTransfers.map(() => false); // Default approve for pre/post mode

    try {
      let hash: `0x${string}` = '0x';

      if (safe && safeInfo) {
        const mainTx = {
          to: proxy.address,
          data: (() => {
            switch (mode) {
              case EMode.diifs: {
                return encodeFunctionData({
                  abi: proxy.abi,
                  functionName: 'proxyCallMetadataCalldataDiffs',
                  args: [diffs, approvals, transferFlags, tx.to, data, withdrawals],
                });
              }
              case EMode['pre/post']: {
                return encodeFunctionData({
                  abi: proxy.abi,
                  functionName: 'proxyCallMetadataCalldata',
                  args: [
                    postTransfers,
                    preTransfers,
                    preTransferFlags,
                    tx.to,
                    data,
                    withdrawals,
                  ],
                });
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
            hash = await writeContractAsync({
              abi: proxy.abi,
              address: proxy.address,
              functionName: 'proxyCallMetadataCalldataDiffs',
              args: [diffs, approvals, transferFlags, tx.to, data, withdrawals],
              value: value,
              maxFeePerGas: 200_000n,
            });

            break;
          }

          case EMode['pre/post']: {
            hash = await writeContractAsync({
              abi: proxy.abi,
              address: proxy.address,
              functionName: 'proxyCallMetadataCalldata',
              args: [
                postTransfers,
                preTransfers,
                preTransferFlags,
                tx.to,
                data,
                withdrawals,
              ],
              value: value,
            });

            break;
          }
        }

        const txData = await waitForTx(publicClient, hash, 1);

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
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      toast.error(`Transaction failed: ${errorMessage}`);
      closeModal();
      resetCheckState();
    } finally {
      setIsLoading(false);
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
