import {
  decodeFunctionData,
  encodeFunctionData,
  encodeAbiParameters,
  decodeAbiParameters,
  hexToNumber,
  slice,
  Abi,
  AbiParameter,
} from 'viem';
import { toast } from 'sonner';
import { getContract } from './contracts';

/**
 * Universal Router contract details
 */
export interface UniversalRouterContract {
  /** Contract address */
  address: string;
  /** Contract ABI for encoding/decoding */
  abi: Abi;
}

/**
 * Universal Router command identifiers
 *
 * The Universal Router uses a command-based architecture where each command
 * represents a specific action (swap, transfer, permit, etc.). Commands are
 * encoded as bytes and executed sequentially.
 *
 * Key commands:
 * - **V2_SWAP_***: Uniswap V2 AMM swaps
 * - **V3_SWAP_***: Uniswap V3 concentrated liquidity swaps
 * - **V4_SWAP**: Uniswap V4 swaps with hooks
 * - **PERMIT2_***: ERC-20 permit and batch transfer operations
 * - **WRAP_ETH/UNWRAP_WETH**: Convert between ETH and WETH
 * - **SWEEP/PAY_PORTION**: Collect remaining tokens after swap
 */
export const COMMAND_IDS = {
  V3_SWAP_EXACT_IN: 0x00,
  V3_SWAP_EXACT_OUT: 0x01,
  PERMIT2_TRANSFER_FROM: 0x02,
  PERMIT2_PERMIT_BATCH: 0x03,
  SWEEP: 0x04,
  TRANSFER: 0x05,
  PAY_PORTION: 0x06,
  V2_SWAP_EXACT_IN: 0x08,
  V2_SWAP_EXACT_OUT: 0x09,
  PERMIT2_PERMIT: 0x0a,
  WRAP_ETH: 0x0b,
  UNWRAP_WETH: 0x0c,
  PERMIT2_TRANSFER_FROM_BATCH: 0x0d,
  V4_SWAP: 0x10,
  LOOKS_RARE_721: 0x11,
} as const;

/**
 * Uniswap V4 action identifiers
 *
 * V4 introduces a plan-based architecture where actions (swap, settle, take)
 * are executed in sequence within a V4_SWAP command.
 *
 * Key actions:
 * - **SWAP_***: Execute swaps through V4 pools with hooks
 * - **SETTLE**: Transfer tokens from user to V4 PoolManager
 * - **TAKE**: Transfer tokens from V4 PoolManager to user
 *
 * SETTLE actions are critical for our proxy system because they determine
 * who pays for the input tokens (payerIsUser flag).
 */
const V4_ACTIONS = {
  SWAP_EXACT_IN_SINGLE: 0x06,
  SWAP_EXACT_IN: 0x07,
  SWAP_EXACT_OUT_SINGLE: 0x08,
  SWAP_EXACT_OUT: 0x09,
  SETTLE: 0x0b,
  SETTLE_ALL: 0x0c,
  SETTLE_PAIR: 0x0d,
  TAKE: 0x0e,
  TAKE_ALL: 0x0f,
  TAKE_PORTION: 0x10,
  TAKE_PAIR: 0x11,
} as const;

/**
 * Checks if a transaction targets a Universal Router deployment
 *
 * Both the current router (used by app.uniswap.org) and the legacy one are
 * recognised, so their calldata gets rewritten for pre-transferred tokens.
 *
 * @param txTo - Transaction target address
 * @param chainId - Chain the transaction is sent on
 * @returns True if transaction targets a known Universal Router
 *
 * @example
 * const isRouter = isUniversalRouterTransaction(
 *   "0x7E4f6c5e954Da5c61B3423D81E2277431Ac043f3",
 *   sepolia.id
 * );
 * // isRouter: true
 */
export function isUniversalRouterTransaction(
  txTo: string | undefined,
  chainId: number
): boolean {
  const routers = [
    getContract('uniswapRouter', chainId),
    getContract('uniswapRouterLegacy', chainId),
  ];
  return routers.some(
    (router) => router.address.toLowerCase() === txTo?.toLowerCase()
  );
}

/**
 * Parses command bytes from Universal Router calldata
 *
 * Universal Router encodes commands as a bytes array where each byte represents
 * one command ID. This function converts the hex string to an array of command IDs.
 *
 * @param commandsHex - Hex string of packed command bytes (e.g., "0x000b0c")
 * @returns Array of command IDs as numbers (e.g., [0, 11, 12])
 *
 * @example
 * const commands = parseCommands("0x000b0c");
 * // commands: [0, 11, 12]
 * // Represents: [V3_SWAP_EXACT_IN, WRAP_ETH, UNWRAP_WETH]
 */
export function parseCommands(commandsHex: string): number[] {
  const commandBytes = commandsHex.slice(2);
  const commandList: number[] = [];
  for (let i = 0; i < commandBytes.length; i += 2) {
    commandList.push(parseInt(commandBytes.substr(i, 2), 16));
  }
  return commandList;
}

/**
 * Checks if Universal Router transaction contains WRAP_ETH command
 *
 * WRAP_ETH (0x0b) converts native ETH to WETH before swapping. This affects
 * our proxy system because we need to know if ETH is being wrapped.
 *
 * @param txData - Transaction calldata
 * @param routerAbi - Universal Router ABI
 * @returns True if transaction includes WRAP_ETH command
 *
 * @example
 * const hasWrap = checkIfHasWrapEthCommand(txData, routerAbi);
 * if (hasWrap) {
 *   // Transaction wraps ETH → WETH before swapping
 * }
 */
export function checkIfHasWrapEthCommand(
  txData: `0x${string}`,
  routerAbi: Abi
): boolean {
  try {
    const decoded = decodeFunctionData({
      abi: routerAbi,
      data: txData as `0x${string}`,
    });
    if (decoded.functionName === 'execute' && decoded.args) {
      const [commands] = decoded.args as [string, string[], bigint];
      const commandBytes = commands.slice(2);
      for (let i = 0; i < commandBytes.length; i += 2) {
        if (parseInt(commandBytes.substr(i, 2), 16) === 0x0b) {
          return true;
          break;
        }
      }
    }
  } catch {
    // Ignore decode errors
  }

  return false;
}

/**
 * Logs Universal Router command list for debugging
 *
 * Decodes and logs the list of commands in a Universal Router transaction.
 * Useful for understanding the execution flow and debugging issues.
 *
 * @param txData - Transaction calldata
 * @param routerAbi - Universal Router ABI
 *
 * @example
 * logUniversalRouterCommands(txData, routerAbi);
 * // Console: "Universal Router commands: [0, 11, 12]"
 * // (V3_SWAP_EXACT_IN, WRAP_ETH, UNWRAP_WETH)
 */
export function logUniversalRouterCommands(
  txData: `0x${string}`,
  routerAbi: Abi
): void {
  try {
    const decoded = decodeFunctionData({
      abi: routerAbi,
      data: txData,
    });

    if (decoded?.functionName === 'execute' && decoded.args) {
      const [commands] = decoded.args as [string, string[], bigint];
      const commandList = parseCommands(commands);
      console.log('Universal Router commands:', commandList);
    }
  } catch {
    console.warn('Failed to decode Universal Router calldata');
  }
}

/**
 * Modifies Uniswap V4 swap parameters to use pre-transferred tokens
 *
 * **Problem**: V4 SETTLE actions include a `payerIsUser` boolean that determines
 * who provides the input tokens:
 * - `payerIsUser: true` → User transfers tokens directly
 * - `payerIsUser: false` → Tokens already in router are used
 *
 * **Our Solution**: We pre-transfer tokens to the router via our proxy system,
 * so we need to set `payerIsUser: false` in all SETTLE actions.
 *
 * **V4 Architecture**:
 * V4_SWAP commands contain a "plan" with:
 * - `actions`: Array of action IDs (SWAP, SETTLE, TAKE, etc.)
 * - `params`: Array of encoded parameters for each action
 *
 * **Modification Process**:
 * 1. Decode the V4 plan (actions + params)
 * 2. Find all SETTLE actions
 * 3. Decode SETTLE params: (currency, amount, payerIsUser)
 * 4. Re-encode with payerIsUser = false
 * 5. Re-encode the entire plan
 *
 * **Why This Matters**:
 * Without this modification, V4 swaps would fail because:
 * - Router expects user to transfer tokens
 * - But tokens are already in the router (pre-transferred)
 * - Transaction reverts with "insufficient balance"
 *
 * @param v4Input - Encoded V4 plan (actions + params)
 * @param index - Command index in Universal Router command array
 * @returns Object with modification status and new input (if modified)
 *
 * @example
 * const { modified, newInput } = modifyV4Swap(v4PlanBytes, 0);
 * if (modified) {
 *   // V4 plan modified: payerIsUser set to false in SETTLE actions
 *   // Router will use pre-transferred tokens
 * } else {
 *   // No SETTLE actions found or modification failed
 *   // Transaction may fail
 * }
 */
function modifyV4Swap(
  v4Input: string,
  index: number
): { modified: boolean; newInput: string } {
  try {
    console.log('🔵 Modifying V4_SWAP at index', index);

    const planDecoded = decodeAbiParameters(
      [
        { name: 'actions', type: 'bytes' },
        { name: 'params', type: 'bytes[]' },
      ],
      v4Input as `0x${string}`
    );

    const actionsBytes = planDecoded[0];
    const params = planDecoded[1];

    const actions: number[] = [];
    const actionsHex = actionsBytes.slice(2);
    for (let j = 0; j < actionsHex.length; j += 2) {
      actions.push(parseInt(actionsHex.slice(j, j + 2), 16));
    }

    const modifiedParams: `0x${string}`[] = [];
    let modified = false;

    for (let j = 0; j < actions.length; j++) {
      const action = actions[j];
      const param = params[j];

      if (action === V4_ACTIONS.SETTLE) {
        try {
          const settleParams = decodeAbiParameters(
            [
              { name: 'currency', type: 'address' },
              { name: 'amount', type: 'uint256' },
              { name: 'payerIsUser', type: 'bool' },
            ],
            param as `0x${string}`
          );

          const [currency, amount] = settleParams;

          const newParam = encodeAbiParameters(
            [
              { name: 'currency', type: 'address' },
              { name: 'amount', type: 'uint256' },
              { name: 'payerIsUser', type: 'bool' },
            ],
            [currency, amount, false]
          );

          modifiedParams.push(newParam);
          modified = true;
        } catch (error) {
          console.error('Failed to decode/modify SETTLE action:', error);
          modifiedParams.push(param as `0x${string}`);
        }
      } else {
        modifiedParams.push(param as `0x${string}`);
      }
    }

    if (modified) {
      const newV4Input = encodeAbiParameters(
        [
          { name: 'actions', type: 'bytes' },
          { name: 'params', type: 'bytes[]' },
        ],
        [actionsBytes, modifiedParams]
      );
      return { modified: true, newInput: newV4Input };
    } else {
      console.warn('No SETTLE actions found or modified in V4 plan');
      toast.error(
        'V4 transaction may fail: No SETTLE actions could be modified for pre-transfer.'
      );
      return { modified: false, newInput: v4Input };
    }
  } catch (error) {
    console.error('Failed to process V4_SWAP:', error);
    toast.error(
      'Failed to process V4 swap. The transaction may still work with pre-transfer.'
    );
    return { modified: false, newInput: v4Input };
  }
}

/**
 * Returns the ABI layout of a V2/V3 swap input
 *
 * The current router appends `uint256[] minHopPriceX36` (per-hop price guard),
 * the legacy one ends at `payerIsUser`. The path is the first dynamic field,
 * so its offset equals the head size: 0xa0 (5 slots) or 0xc0 (6 slots).
 */
function swapInputParams(
  swapInput: `0x${string}`,
  pathType: 'bytes' | 'address[]'
): AbiParameter[] {
  const params: AbiParameter[] = [
    { name: 'recipient', type: 'address' },
    { name: 'amount', type: 'uint256' },
    { name: 'amountLimit', type: 'uint256' },
    { name: 'path', type: pathType },
    { name: 'payerIsUser', type: 'bool' },
  ];
  const pathOffset = hexToNumber(slice(swapInput, 96, 128));
  if (pathOffset === 5 * 32) return params;
  if (pathOffset === 6 * 32) {
    return [...params, { name: 'minHopPriceX36', type: 'uint256[]' }];
  }
  throw new Error(`Unknown swap input layout (path offset ${pathOffset})`);
}

/** Recipient placeholder the router resolves to its caller (ActionConstants.MSG_SENDER) */
const MSG_SENDER = '0x0000000000000000000000000000000000000001';

/**
 * Modifies a Uniswap V2/V3 swap input for pre-transferred tokens
 *
 * **Swap Input Structure** (ABI-encoded):
 * - recipient (address)
 * - amountIn / amountOut (uint256)
 * - amountOutMinimum / amountInMaximum (uint256)
 * - path: `bytes` with pool fees for V3, `address[]` for V2
 * - payerIsUser (bool)
 * - minHopPriceX36 (uint256[]): current router only, kept unchanged
 *
 * **Our Modifications**:
 * - Set `payerIsUser: false` (tokens pre-transferred to router)
 * - Replace a MSG_SENDER recipient with the user address: the router's
 *   caller is BalanceProxy, so MSG_SENDER would pay the proxy instead.
 *   Every other recipient is kept: ADDRESS_THIS (0x02) feeds the next leg,
 *   UNWRAP_WETH, PAY_PORTION or SWEEP; a V2 pair feeds the next V2 hop;
 *   an explicit address is where Uniswap sends the output.
 *
 * @param swapInput - Encoded V2/V3 swap parameters
 * @param index - Command index in Universal Router
 * @param userAddress - User's wallet address
 * @param commandName - Command name for logging
 * @param pathType - `bytes` for V3, `address[]` for V2
 * @returns Modified swap input
 *
 * @example
 * // Last leg of USDC → WETH paid out to MSG_SENDER
 * const modified = rewriteSwapInput(swapInput, 0, userAddress, "V3_SWAP_EXACT_IN", "bytes");
 * // Result: recipient = userAddress, payerIsUser = false
 */
function rewriteSwapInput(
  swapInput: string,
  index: number,
  userAddress: string,
  commandName: string,
  pathType: 'bytes' | 'address[]'
): string {
  console.log(`Modifying ${commandName} at index ${index}`);

  const input = swapInput as `0x${string}`;
  const params = swapInputParams(input, pathType);
  const [recipient, amount, amountLimit, path, payerIsUser, ...rest] =
    decodeAbiParameters(params, input);

  console.log('Old recipient:', recipient);
  console.log('Old payerIsUser:', payerIsUser);

  const newRecipient =
    String(recipient).toLowerCase() === MSG_SENDER ? userAddress : recipient;

  console.log('New recipient:', newRecipient);
  console.log('New payerIsUser:', false);

  const newInput = encodeAbiParameters(params, [
    newRecipient,
    amount,
    amountLimit,
    path,
    false,
    ...rest,
  ]);

  console.log(`Modified ${commandName} input`);
  return newInput;
}

/**
 * Modifies Universal Router calldata to work with pre-transferred tokens
 *
 * **THE CORE PROBLEM**:
 * Uniswap's Universal Router expects users to transfer tokens during execution.
 * Our proxy system pre-transfers tokens BEFORE calling the router. Without
 * modification, the router would try to pull tokens from the user (who no longer
 * has them), causing the transaction to fail.
 *
 * **THE SOLUTION**:
 * This function modifies the router calldata to tell it that tokens are already
 * available in the router contract, eliminating the need for the router to pull
 * tokens from the user.
 *
 * **MODIFICATION STEPS**:
 *
 * 1. **Decode Transaction**:
 *    - Parse Universal Router `execute(commands, inputs, deadline)` call
 *    - Extract command list and input parameters
 *
 * 2. **Remove PERMIT2_PERMIT Commands**:
 *    - PERMIT2_PERMIT is for pulling tokens from user
 *    - We pre-transferred tokens, so permit is unnecessary
 *    - Remove command and corresponding input
 *
 * 3. **Modify Swap Commands**:
 *    - **V4_SWAP**: Set `payerIsUser: false` in all SETTLE actions
 *    - **V3_SWAP_***: Set `payerIsUser: false`, MSG_SENDER recipient → user
 *    - **V2_SWAP_***: Set `payerIsUser: false`, MSG_SENDER recipient → user
 *
 * 4. **Re-encode Transaction**:
 *    - Build new command bytes from modified command list
 *    - Encode new `execute()` call with modified inputs
 *
 * **RECIPIENT LOGIC**:
 * Uniswap already routes every output: ADDRESS_THIS (0x02) for tokens the
 * next leg, UNWRAP_WETH, PAY_PORTION or SWEEP consumes; the user's address
 * for the final output. Those are kept. Only MSG_SENDER (0x01) is replaced
 * with the user address, since BalanceProxy, not the user, calls the router.
 *
 * **ERROR HANDLING**:
 * - If modification fails, returns original calldata
 * - Logs detailed error information
 * - Shows toast warning for V4 modification failures
 *
 * @param txData - Original Universal Router calldata
 * @param router - Universal Router contract details
 * @param userAddress - User's wallet address
 * @returns Modified calldata compatible with pre-transferred tokens
 *
 * @example
 * // Example: USDC → WETH swap paid out to MSG_SENDER
 * const modifiedData = modifyUniversalRouterCalldata(
 *   originalTxData,
 *   { address: routerAddress, abi: routerAbi },
 *   userAddress
 * );
 * // Modifications:
 * // - PERMIT2_PERMIT removed (tokens pre-transferred)
 * // - V3_SWAP_EXACT_IN: payerIsUser = false, recipient = userAddress
 *
 * @example
 * // Example: USDC → WETH → ETH (has UNWRAP_WETH)
 * const modifiedData = modifyUniversalRouterCalldata(
 *   originalTxData,
 *   { address: routerAddress, abi: routerAbi },
 *   userAddress
 * );
 * // Modifications:
 * // - PERMIT2_PERMIT removed
 * // - V3_SWAP_EXACT_IN: payerIsUser = false, recipient stays ADDRESS_THIS (0x02)
 * // - UNWRAP_WETH: Will unwrap WETH that stayed in router
 */
export function modifyUniversalRouterCalldata(
  txData: `0x${string}`,
  router: UniversalRouterContract,
  userAddress: string
): `0x${string}` {
  console.group('🔧 Modifying Universal Router calldata');

  try {
    const decoded = decodeFunctionData({
      abi: router.abi,
      data: txData,
    });

    if (decoded.functionName === 'execute' && decoded.args) {
      const [commands, inputs, deadline] = decoded.args as [
        string,
        string[],
        bigint,
      ];

      const commandList = parseCommands(commands);

      console.log(
        'Original commands:',
        commandList.map((c) => '0x' + c.toString(16).padStart(2, '0'))
      );
      console.log('Original inputs count:', inputs.length);

      const newCommands = [...commandList];
      const newInputs = [...inputs];

      const permit2PermitIndex = commandList.indexOf(
        COMMAND_IDS.PERMIT2_PERMIT
      );
      if (permit2PermitIndex !== -1) {
        console.log(
          `Removing PERMIT2_PERMIT command at index ${permit2PermitIndex}`
        );
        newCommands.splice(permit2PermitIndex, 1);
        newInputs.splice(permit2PermitIndex, 1);
      }

      for (let i = 0; i < newCommands.length; i++) {
        const command = newCommands[i];

        if (command === COMMAND_IDS.V4_SWAP) {
          const { modified, newInput } = modifyV4Swap(newInputs[i], i);
          if (modified) {
            newInputs[i] = newInput;
          }
          continue;
        }

        if (
          command === COMMAND_IDS.V3_SWAP_EXACT_IN ||
          command === COMMAND_IDS.V3_SWAP_EXACT_OUT
        ) {
          const commandName =
            command === COMMAND_IDS.V3_SWAP_EXACT_IN
              ? 'V3_SWAP_EXACT_IN'
              : 'V3_SWAP_EXACT_OUT';
          newInputs[i] = rewriteSwapInput(
            newInputs[i],
            i,
            userAddress,
            commandName,
            'bytes'
          );
        }

        if (
          command === COMMAND_IDS.V2_SWAP_EXACT_IN ||
          command === COMMAND_IDS.V2_SWAP_EXACT_OUT
        ) {
          const commandName =
            command === COMMAND_IDS.V2_SWAP_EXACT_IN
              ? 'V2_SWAP_EXACT_IN'
              : 'V2_SWAP_EXACT_OUT';
          newInputs[i] = rewriteSwapInput(
            newInputs[i],
            i,
            userAddress,
            commandName,
            'address[]'
          );
        }
      }

      const newCommandsHex =
        '0x' + newCommands.map((c) => c.toString(16).padStart(2, '0')).join('');

      console.log('New commands:', newCommandsHex);
      console.log('New inputs count:', newInputs.length);

      const newData = encodeFunctionData({
        abi: router.abi,
        functionName: 'execute',
        args: [
          newCommandsHex as `0x${string}`,
          newInputs as `0x${string}`[],
          deadline,
        ],
      });

      console.log('Successfully modified calldata');
      console.log('Old data length:', txData.length);
      console.log('New data length:', newData.length);

      console.groupEnd();
      return newData;
    }

    console.groupEnd();
    return txData;
  } catch (error) {
    console.error('Failed to modify Universal Router calldata:', error);
    console.error(error);
    console.groupEnd();
    return txData;
  }
}
