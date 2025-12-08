import {
  decodeFunctionData,
  encodeFunctionData,
  encodeAbiParameters,
  decodeAbiParameters,
  Abi,
} from 'viem';
import { toast } from 'sonner';

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
 * Checks if a transaction targets the Universal Router
 *
 * @param txTo - Transaction target address
 * @param routerAddress - Universal Router contract address
 * @returns True if transaction targets the Universal Router
 *
 * @example
 * const isRouter = isUniversalRouterTransaction(
 *   "0x3fC91A3afd70395Cd496C647d5a6CC9D4B2b7FAD",
 *   UNISWAP_UNIVERSAL_ROUTER
 * );
 * // isRouter: true
 */
export function isUniversalRouterTransaction(
  txTo: string | undefined,
  routerAddress: string
): boolean {
  return txTo?.toLowerCase() === routerAddress.toLowerCase();
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
 * Modifies Uniswap V3 swap parameters for pre-transferred tokens
 *
 * **Problem**: V3 swaps have two fields that need modification:
 * 1. **recipient**: Who receives output tokens
 * 2. **payerIsUser**: Who provides input tokens
 *
 * **Our Modifications**:
 * - Set `payerIsUser: false` (tokens pre-transferred to router)
 * - Set `recipient` based on downstream commands:
 *   - **ADDRESS_THIS (0x02)**: If tokens stay in router (for UNWRAP_WETH, SWEEP, etc.)
 *   - **User address**: If tokens go directly to user
 *
 * **V3 Swap Input Structure** (ABI-encoded):
 * - recipient (address): 32 bytes
 * - amountIn (uint256): 32 bytes
 * - amountOutMinimum (uint256): 32 bytes
 * - path (bytes): Dynamic length (encoded separately)
 * - payerIsUser (bool): 32 bytes
 *
 * **Recipient Logic**:
 * We check if there are downstream commands that process the output tokens:
 * - **Has UNWRAP_WETH**: Keep in router → unwrap WETH to ETH
 * - **Has PAY_PORTION**: Keep in router → take fee portion
 * - **Has SWEEP**: Keep in router → sweep remaining tokens
 * - **None of above**: Send directly to user
 *
 * @param swapInput - Encoded V3 swap parameters
 * @param index - Command index in Universal Router
 * @param shouldKeepInRouter - Whether to keep tokens in router for downstream commands
 * @param userAddress - User's wallet address (for direct sends)
 * @param commandName - Command name for logging ("V3_SWAP_EXACT_IN" or "V3_SWAP_EXACT_OUT")
 * @returns Modified swap input with updated recipient and payerIsUser
 *
 * @example
 * // Example 1: ETH → USDC (no downstream commands)
 * const modified = modifyV3Swap(
 *   swapInput,
 *   0,
 *   false, // shouldKeepInRouter
 *   userAddress,
 *   "V3_SWAP_EXACT_IN"
 * );
 * // Result: recipient = userAddress, payerIsUser = false
 *
 * @example
 * // Example 2: USDC → ETH (has UNWRAP_WETH)
 * const modified = modifyV3Swap(
 *   swapInput,
 *   0,
 *   true, // shouldKeepInRouter (UNWRAP_WETH follows)
 *   userAddress,
 *   "V3_SWAP_EXACT_IN"
 * );
 * // Result: recipient = ADDRESS_THIS (0x02), payerIsUser = false
 */
function modifyV3Swap(
  swapInput: string,
  index: number,
  shouldKeepInRouter: boolean,
  userAddress: string,
  commandName: string
): string {
  console.log(`Modifying ${commandName} at index ${index}`);

  const inputData = '0x' + swapInput.slice(2);

  const recipient = '0x' + inputData.slice(2, 66).slice(24);
  const amount1 = '0x' + inputData.slice(66, 130);
  const amount2 = '0x' + inputData.slice(130, 194);
  const pathOffset = '0x' + inputData.slice(194, 258);
  const payerIsUserOld = BigInt('0x' + inputData.slice(258, 322)) === 1n;

  console.log('Old recipient:', recipient);
  console.log('Old payerIsUser:', payerIsUserOld);

  const pathOffsetInt = parseInt(pathOffset, 16);
  const pathLengthHex = inputData.slice(
    2 + pathOffsetInt * 2,
    2 + pathOffsetInt * 2 + 64
  );
  const pathLength = parseInt(pathLengthHex, 16);
  const pathData = inputData.slice(
    2 + pathOffsetInt * 2 + 64,
    2 + pathOffsetInt * 2 + 64 + pathLength * 2
  );

  let newRecipient: string;
  if (shouldKeepInRouter) {
    newRecipient =
      '0000000000000000000000000000000000000000000000000000000000000002';
    console.log(
      'New recipient: ADDRESS_THIS (0x02) - tokens will be processed by downstream commands'
    );
  } else {
    newRecipient = userAddress.slice(2).toLowerCase().padStart(64, '0');
    console.log('New recipient:', '0x' + newRecipient.slice(24));
  }
  const newPayerIsUser = '0'.padStart(64, '0');

  console.log('New payerIsUser:', false);

  const newInput =
    '0x' +
    newRecipient +
    amount1.slice(2) +
    amount2.slice(2) +
    pathOffset.slice(2) +
    newPayerIsUser +
    pathLengthHex +
    pathData;

  console.log(`Modified ${commandName} input`);
  return newInput;
}

/**
 * Modifies Uniswap V2 swap parameters for pre-transferred tokens
 *
 * Similar to V3 swaps, but for V2 AMM pools. V2 swaps have the same fields:
 * - **recipient**: Output token destination
 * - **payerIsUser**: Input token source
 *
 * **V2 vs V3 Difference**:
 * - V2 uses an **address array** for the path (not bytes)
 * - V2 path: [tokenA, tokenB, tokenC] (simple array)
 * - V3 path: encoded bytes with pool fees
 *
 * **Modification Logic** (same as V3):
 * - Set `payerIsUser: false` (use pre-transferred tokens)
 * - Set `recipient` based on downstream commands:
 *   - ADDRESS_THIS (0x02) if tokens processed by downstream commands
 *   - User address if tokens sent directly
 *
 * @param swapInput - Encoded V2 swap parameters
 * @param index - Command index in Universal Router
 * @param shouldKeepInRouter - Whether to keep tokens in router for downstream commands
 * @param userAddress - User's wallet address
 * @param commandName - Command name for logging
 * @returns Modified swap input
 *
 * @example
 * const modified = modifyV2Swap(
 *   swapInput,
 *   0,
 *   false, // Direct to user
 *   userAddress,
 *   "V2_SWAP_EXACT_IN"
 * );
 * // Result: recipient = userAddress, payerIsUser = false
 */
function modifyV2Swap(
  swapInput: string,
  index: number,
  shouldKeepInRouter: boolean,
  userAddress: string,
  commandName: string
): string {
  console.log(`Modifying ${commandName} at index ${index}`);

  const inputData = '0x' + swapInput.slice(2);

  const recipient = '0x' + inputData.slice(2, 66).slice(24);
  const amount1 = '0x' + inputData.slice(66, 130);
  const amount2 = '0x' + inputData.slice(130, 194);
  const pathOffset = '0x' + inputData.slice(194, 258);
  const payerIsUserOld = BigInt('0x' + inputData.slice(258, 322)) === 1n;

  console.log('Old recipient:', recipient);
  console.log('Old payerIsUser:', payerIsUserOld);

  const pathOffsetInt = parseInt(pathOffset, 16);
  const pathArrayLengthHex = inputData.slice(
    2 + pathOffsetInt * 2,
    2 + pathOffsetInt * 2 + 64
  );
  const pathArrayLength = parseInt(pathArrayLengthHex, 16);
  const pathArrayData = inputData.slice(
    2 + pathOffsetInt * 2 + 64,
    2 + pathOffsetInt * 2 + 64 + pathArrayLength * 64
  );

  let newRecipient: string;
  if (shouldKeepInRouter) {
    newRecipient =
      '0000000000000000000000000000000000000000000000000000000000000002';
    console.log(
      'New recipient: ADDRESS_THIS (0x02) - tokens will be processed by downstream commands'
    );
  } else {
    newRecipient = userAddress.slice(2).toLowerCase().padStart(64, '0');
    console.log('New recipient:', '0x' + newRecipient.slice(24));
  }
  const newPayerIsUser = '0'.padStart(64, '0');

  console.log('New payerIsUser:', false);

  const newInput =
    '0x' +
    newRecipient +
    amount1.slice(2) +
    amount2.slice(2) +
    pathOffset.slice(2) +
    newPayerIsUser +
    pathArrayLengthHex +
    pathArrayData;

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
 * 3. **Analyze Downstream Commands**:
 *    - Check for UNWRAP_WETH, PAY_PORTION, SWEEP
 *    - If present, tokens must stay in router (set recipient to ADDRESS_THIS)
 *    - If absent, tokens can go directly to user
 *
 * 4. **Modify Swap Commands**:
 *    - **V4_SWAP**: Set `payerIsUser: false` in all SETTLE actions
 *    - **V3_SWAP_***: Set `payerIsUser: false`, adjust recipient
 *    - **V2_SWAP_***: Set `payerIsUser: false`, adjust recipient
 *
 * 5. **Re-encode Transaction**:
 *    - Build new command bytes from modified command list
 *    - Encode new `execute()` call with modified inputs
 *
 * **RECIPIENT LOGIC**:
 * - **ADDRESS_THIS (0x02)**: Tokens stay in router for downstream processing
 *   - Used when: UNWRAP_WETH, PAY_PORTION, or SWEEP commands present
 *   - Example: USDC → WETH → (UNWRAP_WETH) → ETH
 *
 * - **User Address**: Tokens sent directly to user
 *   - Used when: No downstream token processing
 *   - Example: USDC → ETH (direct)
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
 * // Example: USDC → ETH swap (no downstream commands)
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
 * // - V3_SWAP_EXACT_IN: payerIsUser = false, recipient = ADDRESS_THIS (0x02)
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

      const hasUnwrapWeth = newCommands.includes(COMMAND_IDS.UNWRAP_WETH);
      const hasWrapEth = newCommands.includes(COMMAND_IDS.WRAP_ETH);
      const hasPayPortion = newCommands.includes(COMMAND_IDS.PAY_PORTION);
      const hasSweep = newCommands.includes(COMMAND_IDS.SWEEP);

      const shouldKeepInRouter = hasUnwrapWeth || hasPayPortion || hasSweep;

      console.log(`Has UNWRAP_WETH: ${hasUnwrapWeth}`);
      console.log(`Has WRAP_ETH: ${hasWrapEth}`);
      console.log(`Has PAY_PORTION: ${hasPayPortion}`);
      console.log(`Has SWEEP: ${hasSweep}`);
      console.log(`Should keep tokens in router: ${shouldKeepInRouter}`);

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
          newInputs[i] = modifyV3Swap(
            newInputs[i],
            i,
            shouldKeepInRouter,
            userAddress,
            commandName
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
          newInputs[i] = modifyV2Swap(
            newInputs[i],
            i,
            shouldKeepInRouter,
            userAddress,
            commandName
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
